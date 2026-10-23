/**
 * Runs against the real Supabase project (LIVE=1). Three guest users: Asha creates a group, Bilal joins
 * with the group link, Chetan with a personal placeholder link, and Dev is an outsider. Checks every access
 * rule that keeps friends' data safe. The groups it makes are archived at the end.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").trim().split("\n").map((l) => l.split("=") as [string, string]));
const live = process.env.LIVE === "1";
const client = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL!, env.EXPO_PUBLIC_SUPABASE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "split" } });

describe.skipIf(!live)("live database rules", () => {
  let asha: ReturnType<typeof client>, bilal: ReturnType<typeof client>, chetan: ReturnType<typeof client>, dev: ReturnType<typeof client>;
  let group = "", ashaId = "", bilalId = "", chetanId = "", expenseId = "";
  const made: string[] = [];

  beforeAll(async () => {
    [asha, bilal, chetan, dev] = [client(), client(), client(), client()];
    for (const c of [asha, bilal, chetan, dev]) { const { error } = await c.auth.signInAnonymously(); expect(error).toBeNull(); }
  });
  afterAll(async () => { for (const g of made) await asha.from("groups").update({ archived_at: new Date().toISOString() }).eq("id", g); });

  it("creates a group with placeholders; the creator is admin", async () => {
    const { data, error } = await asha.rpc("create_group", { p_name: "Test · Goa", p_emoji: "🏖️", p_my_name: "Asha", p_others: ["Chetan"] });
    expect(error).toBeNull();
    group = data as string; made.push(group);
    const { data: m } = await asha.from("members").select("id,name,is_admin,user_id").eq("group_id", group);
    expect(m!.map((x) => x.name).sort()).toEqual(["Asha", "Chetan"]);
    ashaId = m!.find((x) => x.name === "Asha")!.id;
    expect(m!.find((x) => x.name === "Asha")!.is_admin).toBe(true);
  });

  it("tokens are not readable directly, only through invite_links for members", async () => {
    expect((await asha.from("groups").select("invite_token").eq("id", group)).error).not.toBeNull();
    expect((await asha.from("members").select("claim_token").eq("group_id", group)).error).not.toBeNull();
    expect((await dev.rpc("invite_links", { p_group: group })).data).toBeNull();
  });

  it("Bilal joins with the group link as a new person; Chetan claims his placeholder with his personal link", async () => {
    const { data: links } = await asha.rpc("invite_links", { p_group: group });
    const preview = (await bilal.rpc("preview_invite", { p_token: links.group })).data;
    expect(preview).toMatchObject({ name: "Test · Goa", for_member: null, already_member: false });
    expect((await bilal.rpc("join_group", { p_token: links.group, p_name: "Bilal" })).error).toBeNull();
    const personal = links.people.find((p: { name: string }) => p.name === "Chetan").token;
    expect((await chetan.rpc("preview_invite", { p_token: personal })).data.for_member.name).toBe("Chetan");
    expect((await chetan.rpc("join_group", { p_token: personal, p_name: "" })).error).toBeNull();
    // the personal link is single-use
    expect((await dev.rpc("join_group", { p_token: personal, p_name: "Imposter" })).error).not.toBeNull();
    const { data: m } = await asha.from("members").select("id,name,user_id").eq("group_id", group);
    bilalId = m!.find((x) => x.name === "Bilal")!.id;
    chetanId = m!.find((x) => x.name === "Chetan")!.id;
    expect(m!.every((x) => x.user_id)).toBe(true);
  });

  it("outsiders see nothing", async () => {
    expect((await dev.from("groups").select("id,name").eq("id", group)).data).toEqual([]);
    expect((await dev.from("members").select("id").eq("group_id", group)).data).toEqual([]);
  });

  it("an expense's shares must add up and belong to the group", async () => {
    const bad = await bilal.from("expenses").insert({ group_id: group, description: "Dinner", amount: 30000, paid_by: bilalId, split_kind: "equal", shares: { [ashaId]: 10000, [bilalId]: 10000 }, created_by: bilalId });
    expect(bad.error?.message).toMatch(/do not add up/);
    const ok = await bilal.from("expenses").insert({ group_id: group, description: "Dinner", amount: 30000, paid_by: bilalId, split_kind: "equal", shares: { [ashaId]: 10000, [bilalId]: 10000, [chetanId]: 10000 }, created_by: bilalId }).select("id").single();
    expect(ok.error).toBeNull();
    expenseId = ok.data!.id;
  });

  it("you can't add an expense pretending to be someone else, or from outside", async () => {
    expect((await bilal.from("expenses").insert({ group_id: group, description: "x", amount: 100, paid_by: ashaId, split_kind: "equal", shares: { [ashaId]: 100 }, created_by: ashaId })).error).not.toBeNull();
    expect((await dev.from("expenses").insert({ group_id: group, description: "x", amount: 100, paid_by: ashaId, split_kind: "equal", shares: { [ashaId]: 100 }, created_by: ashaId })).error).not.toBeNull();
  });

  it("only the author or the admin can edit or delete an expense", async () => {
    const chetanTry = await chetan.from("expenses").update({ description: "hacked" }).eq("id", expenseId).select("id");
    expect(chetanTry.data ?? []).toEqual([]);
    expect((await asha.from("expenses").update({ description: "Dinner at Thalassa" }).eq("id", expenseId).select("id")).data).toHaveLength(1);
    expect((await bilal.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", expenseId).select("id")).data).toHaveLength(1);
    expect((await bilal.from("expenses").update({ deleted_at: null }).eq("id", expenseId).select("id")).data).toHaveLength(1);
  });

  it("every change lands in the activity log with who did it", async () => {
    const { data } = await chetan.from("activity").select("kind,actor").eq("group_id", group).order("id");
    const kinds = data!.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["group.created", "member.joined", "expenses.added", "expenses.edited", "expenses.deleted", "expenses.restored"]));
    expect(data!.find((a) => a.kind === "expenses.edited")!.actor).toBe(ashaId);
  });

  it("payments: recorded by a member, between members, undoable by those involved", async () => {
    const s = await chetan.from("settlements").insert({ group_id: group, from_member: chetanId, to_member: bilalId, amount: 10000, recorded_by: chetanId }).select("id").single();
    expect(s.error).toBeNull();
    expect((await asha.from("settlements").insert({ group_id: group, from_member: chetanId, to_member: chetanId, amount: 100, recorded_by: ashaId })).error).not.toBeNull();
    expect((await bilal.from("settlements").update({ deleted_at: new Date().toISOString() }).eq("id", s.data!.id).select("id")).data).toHaveLength(1);
  });

  it("you can set your own UPI ID but not someone else's (unless admin); bad IDs are refused", async () => {
    expect((await bilal.from("members").update({ upi_id: "bilal@okaxis" }).eq("id", bilalId).select("id")).data).toHaveLength(1);
    expect((await bilal.from("members").update({ upi_id: "evil@ybl" }).eq("id", chetanId).select("id")).data ?? []).toEqual([]);
    expect((await bilal.from("members").update({ upi_id: "not a upi" }).eq("id", bilalId)).error).not.toBeNull();
    expect((await bilal.from("members").update({ is_admin: true }).eq("id", bilalId)).error).not.toBeNull();
  });

  it("admin can rotate the group link; the old one stops working", async () => {
    const before = (await asha.rpc("invite_links", { p_group: group })).data.group;
    expect((await bilal.rpc("rotate_invite", { p_group: group })).error).not.toBeNull();
    expect((await asha.rpc("rotate_invite", { p_group: group })).error).toBeNull();
    expect((await dev.rpc("preview_invite", { p_token: before })).data).toBeNull();
  });
});

describe.skipIf(!live)("live Splitwise import", () => {
  it("imports an export into a new group whose balances match Splitwise's totals", async () => {
    const { parseSplitwise } = await import("../src/lib/splitwise");
    const { balances } = await import("../src/lib/money");
    const sw = parseSplitwise(readFileSync("tests/fixtures/splitwise-goa.csv", "utf8"));
    const c = client();
    await c.auth.signInAnonymously();
    const { data: g, error } = await c.rpc("import_splitwise", { p_name: "Goa (from Splitwise)", p_my_name: "Bilal Khan", p_people: sw.people, p_rows: sw.rows });
    expect(error).toBeNull();
    const [{ data: m }, { data: e }, { data: s }] = await Promise.all([
      c.from("members").select("id,name,user_id").eq("group_id", g).order("created_at"),
      c.from("expenses").select("amount,paid_by,shares,source").eq("group_id", g),
      c.from("settlements").select("from_member,to_member,amount").eq("group_id", g),
    ]);
    expect(m!.find((x) => x.name === "Bilal Khan")!.user_id).toBeTruthy();
    expect(e!.every((x) => x.source === "splitwise")).toBe(true);
    const b = balances(m!.map((x) => x.id), e!.map((x, i) => ({ id: `${i}`, amount: x.amount, paidBy: x.paid_by, shares: x.shares })), s!.map((x, i) => ({ id: `${i}`, from: x.from_member, to: x.to_member, amount: x.amount })));
    expect(sw.people.map((p) => b[m!.find((x) => x.name === p)!.id])).toEqual(sw.balances);
    const { data: act } = await c.from("activity").select("kind").eq("group_id", g);
    expect(act!.filter((a) => a.kind === "expenses.added")).toHaveLength(0); // the import is one entry, not one per row
    await c.from("groups").update({ archived_at: new Date().toISOString() }).eq("id", g);
  });
});
