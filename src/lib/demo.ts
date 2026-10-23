/**
 * Demo store: a fictional "Goa trip" saved only on this device, so anyone can try the whole app
 * without an account. Same interface and rules as the real store (you are the admin, Arjun).
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { computeSplit } from "./money";
import type { ActivityRow, ExpenseRow, GroupData, Member, PaymentRow, Store } from "./types";

const KEY = "split-settle:demo:v1";
export const DEMO_ID = "demo-goa";

type Doc = { name: string; emoji: string; members: Member[]; expenses: ExpenseRow[]; payments: PaymentRow[]; activity: ActivityRow[]; seq: number; inviteToken: string };

const people: [string, string, string | null][] = [["me", "Arjun", "arjun@okhdfcbank"], ["kavya", "Kavya", "kavya.r@oksbi"], ["rohan", "Rohan", null], ["priya", "Priya", "priya@ybl"]];
/** Demo dates are relative to today, so the trip always looks like it just happened. */
const day = (d: number) => {
  const t = new Date(Date.now() - (22 - d) * 864e5);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

function seed(): Doc {
  const members: Member[] = people.map(([id, name, upi]) => ({ id, name, upi, isAdmin: id === "me", isMe: id === "me", joined: id !== "rohan" }));
  const all = members.map((m) => m.id);
  const items: [string, number, string, string[] | Record<string, number>, number, string][] = [
    ["Flights BLR → GOI", 2196000, "me", all, 18, "travel"],
    ["Villa in Assagao, 3 nights", 3600000, "kavya", all, 18, "stay"],
    ["Airport taxi", 180000, "rohan", all, 18, "transport"],
    ["Dinner at Thalassa", 684000, "priya", all, 18, "food"],
    ["Scooters × 2", 240000, "me", ["me", "kavya"], 19, "transport"],
    ["Groceries & water", 132000, "kavya", all, 19, "groceries"],
    ["Fish thali lunch", 96000, "rohan", ["rohan", "priya", "me"], 19, "food"],
    ["Club entry", 600000, "priya", { me: 1, kavya: 1, priya: 1, rohan: 1 }, 20, "fun"],
    ["Breakfast at Artjuna", 118000, "me", all, 20, "food"],
    ["Parasailing", 450000, "kavya", ["kavya", "priya", "me"], 21, "fun"],
  ];
  const expenses: ExpenseRow[] = items.map(([description, amount, paidBy, split, d, category], i) => {
    const isShares = !Array.isArray(split);
    const r = computeSplit(amount, isShares ? { kind: "shares", shares: split as Record<string, number> } : { kind: "equal", members: split as string[] });
    if (!r.ok) throw new Error(r.error);
    return { id: `e${i}`, description, amount, paidBy, splitKind: (isShares ? "shares" : "equal") as ExpenseRow["splitKind"], splitInput: split, shares: r.shares, date: day(d), category, createdBy: paidBy, createdAt: `${day(d)}T12:00:00Z`, deletedAt: null, source: "app" as const };
  }).reverse();
  const payments: PaymentRow[] = [{ id: "p0", from: "rohan", to: "kavya", amount: 300000, method: "upi", recordedBy: "rohan", date: day(22), createdAt: `${day(22)}T09:00:00Z`, deletedAt: null }];
  const activity: ActivityRow[] = [
    { id: 3, actor: "rohan", kind: "settlements.added", subject: "p0", before: null, after: { amount: 300000, from_member: "rohan", to_member: "kavya" }, at: `${day(22)}T09:00:00Z` },
    { id: 2, actor: "kavya", kind: "expenses.added", subject: "e9", before: null, after: { description: "Parasailing", amount: 450000 }, at: `${day(21)}T12:00:00Z` },
    { id: 1, actor: "me", kind: "group.created", subject: null, before: null, after: null, at: `${day(17)}T08:00:00Z` },
  ];
  return { name: "Goa trip", emoji: "🏖️", members, expenses, payments, activity, seq: 4, inviteToken: "demo" };
}

let cache: Doc | null = null;
const listeners = new Set<() => void>();
const storage = {
  get: async () => (Platform.OS === "web" ? (typeof window === "undefined" ? null : window.localStorage.getItem(KEY)) : AsyncStorage.getItem(KEY)),
  set: async (v: string) => { if (Platform.OS === "web") { if (typeof window !== "undefined") window.localStorage.setItem(KEY, v); } else await AsyncStorage.setItem(KEY, v); },
  del: async () => { if (Platform.OS === "web") { if (typeof window !== "undefined") window.localStorage.removeItem(KEY); } else await AsyncStorage.removeItem(KEY); },
};

async function read(): Promise<Doc | null> {
  if (cache) return cache;
  try { const raw = await storage.get(); cache = raw ? JSON.parse(raw) : null; } catch { cache = null; }
  return cache;
}
async function write(fn: (d: Doc) => void, log?: Omit<ActivityRow, "id" | "at" | "actor">) {
  const d = (await read()) ?? seed();
  fn(d);
  if (log) d.activity.unshift({ ...log, id: ++d.seq, actor: "me", at: new Date().toISOString() });
  cache = d;
  await storage.set(JSON.stringify(d));
  listeners.forEach((l) => l());
}
const need = async () => { const d = await read(); if (!d) throw new Error("The demo was reset."); return d; };

export const demoExists = async () => !!(await read());
export const startDemo = async () => { if (!(await read())) await write(() => {}); };
export const resetDemo = async () => { cache = null; await storage.del(); listeners.forEach((l) => l()); };

export const demo: Store = {
  async listGroups() { return []; },
  async loadGroup() {
    const d = await need();
    // Fresh copies: screens memoise on identity, and the stored doc is mutated in place.
    const c = JSON.parse(JSON.stringify(d)) as Doc;
    return { id: DEMO_ID, name: c.name, emoji: c.emoji, demo: true, me: "me", isAdmin: true, members: c.members, expenses: c.expenses, payments: c.payments, activity: c.activity } satisfies GroupData;
  },
  async createGroup() { throw new Error("Not in the demo"); },
  async addMember(_g, name) {
    await write((d) => { d.members.push({ id: `m${++d.seq}`, name: name.trim(), upi: null, isAdmin: false, isMe: false, joined: false }); }, { kind: "member.added", subject: null, before: null, after: { name } });
  },
  async saveExpense(_g, x, id) {
    let before: ExpenseRow | undefined;
    await write((d) => {
      const now = new Date().toISOString();
      if (id) {
        const i = d.expenses.findIndex((e) => e.id === id);
        before = d.expenses[i];
        d.expenses[i] = { ...d.expenses[i]!, ...x };
      } else d.expenses.unshift({ ...x, id: `e${++d.seq}`, createdBy: "me", createdAt: now, deletedAt: null, source: "app" });
    }, { kind: id ? "expenses.edited" : "expenses.added", subject: id ?? null, before: before ? { description: before.description, amount: before.amount } : null, after: { description: x.description, amount: x.amount } });
  },
  async setExpenseDeleted(_g, id, del) {
    const desc = (await need()).expenses.find((x) => x.id === id)?.description ?? "";
    await write((d) => { const e = d.expenses.find((x) => x.id === id)!; e.deletedAt = del ? new Date().toISOString() : null; },
      { kind: del ? "expenses.deleted" : "expenses.restored", subject: id, before: null, after: { description: desc } });
  },
  async recordPayment(_g, p) {
    await write((d) => { d.payments.unshift({ ...p, id: `p${++d.seq}`, recordedBy: "me", date: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), deletedAt: null }); },
      { kind: "settlements.added", subject: null, before: null, after: { amount: p.amount, from_member: p.from, to_member: p.to } });
  },
  async setPaymentDeleted(_g, id, del) {
    await write((d) => { const p = d.payments.find((x) => x.id === id)!; p.deletedAt = del ? new Date().toISOString() : null; }, { kind: del ? "settlements.deleted" : "settlements.restored", subject: id, before: null, after: null });
  },
  async updateMember(_g, id, patch) {
    await write((d) => { const m = d.members.find((x) => x.id === id)!; if (patch.name !== undefined) m.name = patch.name.trim(); if (patch.upi !== undefined) m.upi = patch.upi || null; });
  },
  async renameGroup(_g, name, emoji) { await write((d) => { d.name = name.trim(); d.emoji = emoji; }); },
  async inviteLinks() {
    const d = await need();
    return { group: "demo", people: d.members.filter((m) => !m.joined).map((m) => ({ memberId: m.id, name: m.name, token: `demo-${m.id}` })) };
  },
  async rotateInvite() {},
  async unlinkMember(_g, id) { await write((d) => { const m = d.members.find((x) => x.id === id)!; m.joined = false; }); },
  subscribe(_g, fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
