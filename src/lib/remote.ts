/** The real store: Supabase `split` schema, guarded by row-level security and server functions. */
import { balances, type Paise } from "./money";
import { currentUser, db, ensureSession } from "./supabase";
import type { ActivityRow, ExpenseDraft, ExpenseRow, GroupData, GroupSummary, InviteLinks, InvitePreview, Member, PaymentRow, Store } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const check = (r: { data: any; error: { message: string } | null }): any => {
  if (r.error) throw new Error(friendly(r.error.message));
  return r.data ?? [];
};
function friendly(m: string) {
  if (/fetch|network/i.test(m)) return "You're offline. Try again when you're connected.";
  if (/do not add up/.test(m)) return "The split doesn't add up to the total.";
  if (/too many groups/.test(m)) return "You've created a lot of groups today. Try again tomorrow.";
  if (/row-level security|permission denied/i.test(m)) return "You can't change that — only the person who added it or the group admin can.";
  return m.replace(/^.*exception:\s*/i, "");
}

type ER = { id: string; description: string; amount: number; paid_by: string; split_kind: ExpenseRow["splitKind"]; split_input: ExpenseRow["splitInput"]; shares: Record<string, number>; spent_on: string; category: string; created_by: string; created_at: string; deleted_at: string | null; source: ExpenseRow["source"] };
type SR = { id: string; from_member: string; to_member: string; amount: number; method: PaymentRow["method"]; recorded_by: string; paid_on: string; created_at: string; deleted_at: string | null };

export const remote: Store = {
  async listGroups() {
    const uid = await currentUser();
    if (!uid) return [];
    const c = db();
    const mine = check(await c.from("members").select("group_id").eq("user_id", uid).is("left_at", null));
    const ids = mine.map((m: { group_id: string }) => m.group_id);
    if (!ids.length) return [];
    const [gs, ms, es, ss] = await Promise.all([
      c.from("groups").select("id,name,emoji,created_at").in("id", ids).is("archived_at", null).order("created_at", { ascending: false }),
      c.from("members").select("id,group_id,user_id").in("group_id", ids).is("left_at", null),
      c.from("expenses").select("group_id,amount,paid_by,shares").in("group_id", ids).is("deleted_at", null),
      c.from("settlements").select("group_id,from_member,to_member,amount").in("group_id", ids).is("deleted_at", null),
    ]);
    return check(gs).map((g: { id: string; name: string; emoji: string }): GroupSummary => {
      const members = check(ms).filter((m: { group_id: string }) => m.group_id === g.id) as { id: string; user_id: string | null }[];
      const me = members.find((m) => m.user_id === uid)?.id ?? "";
      const b = balances(
        members.map((m) => m.id),
        (check(es) as (ER & { group_id: string })[]).filter((e) => e.group_id === g.id).map((e, i) => ({ id: `${i}`, amount: e.amount, paidBy: e.paid_by, shares: e.shares })),
        (check(ss) as (SR & { group_id: string })[]).filter((s) => s.group_id === g.id).map((s, i) => ({ id: `${i}`, from: s.from_member, to: s.to_member, amount: s.amount })),
      );
      return { id: g.id, name: g.name, emoji: g.emoji, myBalance: b[me] ?? 0, people: members.length, demo: false };
    });
  },

  async loadGroup(id) {
    const uid = await currentUser();
    const c = db();
    const [g, m, e, s, a] = await Promise.all([
      c.from("groups").select("id,name,emoji").eq("id", id).maybeSingle(),
      c.from("members").select("id,name,upi_id,is_admin,user_id,created_at").eq("group_id", id).is("left_at", null).order("created_at"),
      c.from("expenses").select("*").eq("group_id", id).order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
      c.from("settlements").select("*").eq("group_id", id).order("created_at", { ascending: false }),
      c.from("activity").select("id,actor,kind,subject,before,after,created_at").eq("group_id", id).order("id", { ascending: false }).limit(200),
    ]);
    const group = (g.error ? check(g) : g.data) as { id: string; name: string; emoji: string } | null;
    if (!group) throw new Error("This group doesn't exist, or you're not in it.");
    const members: Member[] = (check(m) as { id: string; name: string; upi_id: string | null; is_admin: boolean; user_id: string | null }[]).map((x) => ({
      id: x.id, name: x.name, upi: x.upi_id, isAdmin: x.is_admin, isMe: !!uid && x.user_id === uid, joined: !!x.user_id,
    }));
    const me = members.find((x) => x.isMe);
    return {
      id: group.id, name: group.name, emoji: group.emoji, demo: false, me: me?.id ?? "", isAdmin: !!me?.isAdmin, members,
      expenses: (check(e) as ER[]).map((x) => ({ id: x.id, description: x.description, amount: x.amount, paidBy: x.paid_by, splitKind: x.split_kind, splitInput: x.split_input, shares: x.shares, date: x.spent_on, category: x.category, createdBy: x.created_by, createdAt: x.created_at, deletedAt: x.deleted_at, source: x.source })),
      payments: (check(s) as SR[]).map((x) => ({ id: x.id, from: x.from_member, to: x.to_member, amount: x.amount, method: x.method, recordedBy: x.recorded_by, date: x.paid_on, createdAt: x.created_at, deletedAt: x.deleted_at })),
      activity: (check(a) as { id: number; actor: string | null; kind: string; subject: string | null; before: ActivityRow["before"]; after: ActivityRow["after"]; created_at: string }[]).map((x) => ({ id: x.id, actor: x.actor, kind: x.kind, subject: x.subject, before: x.before, after: x.after, at: x.created_at })),
    } satisfies GroupData;
  },

  async createGroup(name, emoji, myName, others) {
    await ensureSession();
    return check(await db().rpc("create_group", { p_name: name, p_emoji: emoji, p_my_name: myName, p_others: others })) as string;
  },
  async addMember(groupId, name) { check(await db().rpc("add_member", { p_group: groupId, p_name: name })); },

  async saveExpense(groupId, d: ExpenseDraft, id) {
    const g = await this.loadGroup(groupId);
    const row = { description: d.description, amount: d.amount, paid_by: d.paidBy, split_kind: d.splitKind, split_input: d.splitInput, shares: d.shares, spent_on: d.date, category: d.category };
    if (id) {
      const r = check(await db().from("expenses").update(row).eq("id", id).select("id"));
      if (!r.length) throw new Error("You can't change that — only the person who added it or the group admin can.");
    } else check(await db().from("expenses").insert({ ...row, group_id: groupId, created_by: g.me }));
  },
  async setExpenseDeleted(_g, id, deleted) {
    const r = check(await db().from("expenses").update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", id).select("id"));
    if (!r.length) throw new Error("You can't change that — only the person who added it or the group admin can.");
  },
  async recordPayment(groupId, p) {
    const g = await this.loadGroup(groupId);
    check(await db().from("settlements").insert({ group_id: groupId, from_member: p.from, to_member: p.to, amount: p.amount, method: p.method, recorded_by: g.me }));
  },
  async setPaymentDeleted(_g, id, deleted) {
    const r = check(await db().from("settlements").update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", id).select("id"));
    if (!r.length) throw new Error("Only the people in this payment, whoever recorded it, or the admin can undo it.");
  },
  async updateMember(_g, memberId, patch) {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.upi !== undefined) row.upi_id = patch.upi ? patch.upi.trim() : null;
    const r = check(await db().from("members").update(row).eq("id", memberId).select("id"));
    if (!r.length) throw new Error("You can only change your own details (or anyone's, if you're the admin).");
  },
  async renameGroup(groupId, name, emoji) { check(await db().from("groups").update({ name: name.trim(), emoji }).eq("id", groupId)); },
  async inviteLinks(groupId) {
    const r = await db().rpc("invite_links", { p_group: groupId });
    if (r.error) throw new Error(friendly(r.error.message));
    const d = r.data as { group: string; people: { member_id: string; name: string; token: string }[] } | null;
    if (!d) throw new Error("You're not in this group.");
    return { group: d.group, people: d.people.map((p) => ({ memberId: p.member_id, name: p.name, token: p.token })) } satisfies InviteLinks;
  },
  async rotateInvite(groupId) { check(await db().rpc("rotate_invite", { p_group: groupId })); },
  async unlinkMember(_g, memberId) { check(await db().rpc("unlink_member", { p_member: memberId })); },

  subscribe(groupId, onChange) {
    // Wait for the saved session and hand its token to realtime first; otherwise the socket can connect
    // as an anonymous visitor and row-level security filters out every event.
    let ch: ReturnType<ReturnType<typeof db>["channel"]> | null = null;
    let closed = false;
    void (async () => {
      const { data } = await db().auth.getSession();
      if (closed) return;
      if (data.session) await db().realtime.setAuth(data.session.access_token);
      ch = db().channel(`group-${groupId}-${Math.random().toString(36).slice(2, 10)}`);
      for (const table of ["expenses", "settlements", "members", "groups"]) {
        ch.on("postgres_changes", { event: "*", schema: "split", table, filter: table === "groups" ? `id=eq.${groupId}` : `group_id=eq.${groupId}` }, onChange);
      }
      ch.subscribe();
    })();
    return () => { closed = true; if (ch) void db().removeChannel(ch); };
  },
};

export async function previewInvite(token: string): Promise<InvitePreview | null> {
  await ensureSession();
  const r = await db().rpc("preview_invite", { p_token: token });
  if (r.error) throw new Error(friendly(r.error.message));
  const d = r.data as null | { group_id: string; name: string; emoji: string; for_member: { id: string; name: string } | null; people: string[]; already_member: boolean };
  return d && { groupId: d.group_id, name: d.name, emoji: d.emoji, forMember: d.for_member, people: d.people ?? [], alreadyMember: d.already_member };
}
export async function joinWithInvite(token: string, name: string): Promise<string> {
  await ensureSession();
  return check(await db().rpc("join_group", { p_token: token, p_name: name })) as string;
}
export async function importSplitwise(name: string, myName: string, people: string[], rows: unknown[]): Promise<string> {
  await ensureSession();
  return check(await db().rpc("import_splitwise", { p_name: name, p_my_name: myName, p_people: people, p_rows: rows })) as string;
}
export type { Paise };
