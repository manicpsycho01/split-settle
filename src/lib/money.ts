/**
 * All money is integer paise. Splits always add up to the amount exactly (largest-remainder rounding),
 * balances always sum to zero, and settle-up suggestions are stable: recording one suggested payment
 * doesn't reshuffle the others (ordering approach from Spliit, MIT).
 */

export type SplitKind = "equal" | "exact" | "shares" | "percent";
export type Paise = number;

/** "1,234.5" / "₹ 99" / "12.345" → paise, or null if it isn't a positive amount. */
export function toPaise(input: string): Paise | null {
  const s = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [r, p = ""] = s.split(".");
  const v = Number(r) * 100 + Number((p + "00").slice(0, 2));
  return v > 0 && v <= 100_000_000_00 ? v : null;
}

export function rupees(p: Paise, opts: { sign?: boolean; paise?: "auto" | "always" | "never" } = {}): string {
  const abs = Math.abs(p);
  const showPaise = opts.paise === "always" || (opts.paise !== "never" && abs % 100 !== 0);
  const body = (abs / 100).toLocaleString("en-IN", { minimumFractionDigits: showPaise ? 2 : 0, maximumFractionDigits: showPaise ? 2 : 0 });
  const sign = opts.sign ? (p > 0 ? "+" : p < 0 ? "−" : "") : p < 0 ? "−" : "";
  return `${sign}₹${body}`;
}

/** Splits `total` by integer weights; remainders go to the largest fractional parts, ties by order. */
export function byWeights(total: Paise, weights: number[]): Paise[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("Nobody to split between");
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).filter((x) => weights[x.i]! > 0).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k]!.i]!++;
  return out;
}

export type SplitInput =
  | { kind: "equal"; members: string[] }
  | { kind: "exact"; amounts: Record<string, Paise> }
  | { kind: "shares"; shares: Record<string, number> }
  | { kind: "percent"; percents: Record<string, number> };

export type SplitResult = { ok: true; shares: Record<string, Paise> } | { ok: false; error: string };

/** Turns a split choice into exact paise per member, or explains what's wrong. */
export function computeSplit(total: Paise, input: SplitInput): SplitResult {
  if (!(total > 0)) return { ok: false, error: "Enter an amount" };
  const zip = (ids: string[], vals: Paise[]) => Object.fromEntries(ids.map((id, i) => [id, vals[i]!]).filter(([, v]) => (v as number) > 0));
  switch (input.kind) {
    case "equal": {
      if (!input.members.length) return { ok: false, error: "Pick at least one person" };
      return { ok: true, shares: zip(input.members, byWeights(total, input.members.map(() => 1))) };
    }
    case "exact": {
      const ids = Object.keys(input.amounts).filter((k) => input.amounts[k]! > 0);
      const sum = ids.reduce((s, k) => s + input.amounts[k]!, 0);
      if (!ids.length) return { ok: false, error: "Enter who owes what" };
      if (sum !== total) return { ok: false, error: sum < total ? `${rupees(total - sum)} left to assign` : `${rupees(sum - total)} too much assigned` };
      return { ok: true, shares: Object.fromEntries(ids.map((k) => [k, input.amounts[k]!])) };
    }
    case "shares": {
      const ids = Object.keys(input.shares).filter((k) => input.shares[k]! > 0);
      if (!ids.length) return { ok: false, error: "Give at least one person a share" };
      if (ids.some((k) => !Number.isInteger(input.shares[k]!))) return { ok: false, error: "Shares must be whole numbers" };
      return { ok: true, shares: zip(ids, byWeights(total, ids.map((k) => input.shares[k]!))) };
    }
    case "percent": {
      const ids = Object.keys(input.percents).filter((k) => input.percents[k]! > 0);
      const sum = Math.round(ids.reduce((s, k) => s + input.percents[k]!, 0) * 100) / 100;
      if (!ids.length) return { ok: false, error: "Enter percentages" };
      if (sum !== 100) return { ok: false, error: `Percentages add up to ${sum}%, not 100%` };
      return { ok: true, shares: zip(ids, byWeights(total, ids.map((k) => Math.round(input.percents[k]! * 100)))) };
    }
  }
}

export type Expense = { id: string; amount: Paise; paidBy: string; shares: Record<string, Paise>; deleted?: boolean };
export type Settlement = { id: string; from: string; to: string; amount: Paise; deleted?: boolean };
export type Transfer = { from: string; to: string; amount: Paise };

/** Net per member: positive = should get money back, negative = owes. Always sums to 0. */
export function balances(memberIds: string[], expenses: Expense[], settlements: Settlement[]): Record<string, Paise> {
  const b: Record<string, Paise> = Object.fromEntries(memberIds.map((m) => [m, 0]));
  const add = (m: string, v: Paise) => { b[m] = (b[m] ?? 0) + v; };
  for (const e of expenses) {
    if (e.deleted) continue;
    add(e.paidBy, e.amount);
    for (const [m, s] of Object.entries(e.shares)) add(m, -s);
  }
  for (const s of settlements) {
    if (s.deleted) continue;
    add(s.from, s.amount);
    add(s.to, -s.amount);
  }
  return b;
}

/**
 * Settle-up: at most n−1 payments. Creditors and debtors are each kept in a stable order
 * (by id), and the largest remaining debtor pays the largest remaining creditor.
 */
export function settleUp(bal: Record<string, Paise>): Transfer[] {
  const cred = Object.entries(bal).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debt = Object.entries(bal).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out: Transfer[] = [];
  const pick = (xs: { id: string; v: number }[]) => xs.reduce((best, x) => (x.v > best.v || (x.v === best.v && x.id < best.id) ? x : best));
  while (cred.some((c) => c.v > 0) && debt.some((d) => d.v > 0)) {
    const c = pick(cred.filter((x) => x.v > 0)), d = pick(debt.filter((x) => x.v > 0));
    const amt = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount: amt });
    c.v -= amt;
    d.v -= amt;
  }
  return out;
}

/** Pairwise debts without simplification: who owes whom, netted per pair, from each expense's payer. */
export function pairwise(expenses: Expense[], settlements: Settlement[]): Transfer[] {
  const owe = new Map<string, Paise>(); // "a→b" = a owes b
  const add = (a: string, b: string, v: Paise) => {
    if (a === b || !v) return;
    const fwd = `${a}→${b}`, back = `${b}→${a}`;
    const prev = owe.get(back) ?? 0;
    if (prev >= v) owe.set(back, prev - v);
    else { owe.delete(back); owe.set(fwd, (owe.get(fwd) ?? 0) + v - prev); }
  };
  for (const e of expenses) if (!e.deleted) for (const [m, s] of Object.entries(e.shares)) add(m, e.paidBy, s);
  for (const s of settlements) if (!s.deleted) add(s.to, s.from, s.amount);
  return [...owe].filter(([, v]) => v > 0).map(([k, v]) => { const [from, to] = k.split("→"); return { from: from!, to: to!, amount: v }; })
    .sort((a, b) => b.amount - a.amount);
}

/** UPI intent link (works with GPay, PhonePe, Paytm, BHIM…). Amount in rupees with 2 decimals. */
export function upiLink(p: { vpa: string; name: string; amount: Paise; note: string }) {
  const q = new URLSearchParams({ pa: p.vpa.trim(), pn: p.name, am: (p.amount / 100).toFixed(2), cu: "INR", tn: p.note.slice(0, 50) });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

export const isVpa = (s: string) => /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,64}$/.test(s.trim());
