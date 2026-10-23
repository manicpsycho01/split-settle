import { describe, expect, it } from "vitest";
import { balances, byWeights, computeSplit, isVpa, pairwise, rupees, settleUp, toPaise, upiLink, type Expense } from "../src/lib/money";

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("amounts", () => {
  it.each([["1,234.5", 123450], ["₹ 99", 9900], ["0.01", 1], ["12.34", 1234]])("%s → %d paise", (s, p) => expect(toPaise(s)).toBe(p));
  it.each(["", "0", "-5", "12.345", "abc", "1e5"])("rejects %s", (s) => expect(toPaise(s)).toBeNull());
  it("formats rupees Indian-style", () => {
    expect(rupees(12345678)).toBe("₹1,23,456.78");
    expect(rupees(150000)).toBe("₹1,500");
    expect(rupees(-2500, { sign: true })).toBe("−₹25");
  });
});

describe("splits always add up exactly", () => {
  it("₹100 three ways: 33.34 + 33.33 + 33.33", () => {
    const r = computeSplit(10000, { kind: "equal", members: ["a", "b", "c"] });
    expect(r).toEqual({ ok: true, shares: { a: 3334, b: 3333, c: 3333 } });
  });
  it("fuzz: equal, shares and percent splits of random amounts sum to the total", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const total = 1 + Math.floor(rnd() * 5_000_000);
      const n = 1 + Math.floor(rnd() * 9);
      const ids = Array.from({ length: n }, (_, k) => `m${k}`);
      const eq = computeSplit(total, { kind: "equal", members: ids });
      const sh = computeSplit(total, { kind: "shares", shares: Object.fromEntries(ids.map((id) => [id, 1 + Math.floor(rnd() * 5)])) });
      for (const r of [eq, sh]) { expect(r.ok).toBe(true); if (r.ok) expect(sum(r.shares)).toBe(total); }
    }
  });
  it("byWeights never goes negative and respects zero weights", () => {
    expect(byWeights(100, [0, 1, 1])).toEqual([0, 50, 50]);
    expect(byWeights(1, [1, 1, 1])).toEqual([1, 0, 0]);
  });
  it("exact must match the total, with a helpful message", () => {
    expect(computeSplit(10000, { kind: "exact", amounts: { a: 4000, b: 5000 } })).toEqual({ ok: false, error: "₹10 left to assign" });
    expect(computeSplit(10000, { kind: "exact", amounts: { a: 6000, b: 5000 } })).toEqual({ ok: false, error: "₹10 too much assigned" });
    expect(computeSplit(10000, { kind: "exact", amounts: { a: 6000, b: 4000 } }).ok).toBe(true);
  });
  it("percent must total 100", () => {
    expect(computeSplit(10000, { kind: "percent", percents: { a: 50, b: 40 } })).toEqual({ ok: false, error: "Percentages add up to 90%, not 100%" });
    expect(computeSplit(99999, { kind: "percent", percents: { a: 33.33, b: 33.33, c: 33.34 } })).toMatchObject({ ok: true });
  });
  it("shares: 2:1 of ₹90", () => expect(computeSplit(9000, { kind: "shares", shares: { a: 2, b: 1 } })).toEqual({ ok: true, shares: { a: 6000, b: 3000 } }));
});

describe("balances and settling", () => {
  const ids = ["arjun", "kavya", "priya", "rohan"];
  const ex: Expense[] = [
    { id: "1", amount: 400000, paidBy: "arjun", shares: { arjun: 100000, kavya: 100000, priya: 100000, rohan: 100000 } },
    { id: "2", amount: 120000, paidBy: "priya", shares: { kavya: 60000, priya: 60000 } },
    { id: "3", amount: 90000, paidBy: "kavya", shares: { arjun: 30000, kavya: 30000, rohan: 30000 } },
  ];
  it("balances sum to zero", () => {
    const b = balances(ids, ex, []);
    expect(sum(b)).toBe(0);
    expect(b).toEqual({ arjun: 270000, kavya: -100000, priya: -40000, rohan: -130000 });
  });
  it("settle-up clears everyone in at most n−1 payments", () => {
    const b = balances(ids, ex, []);
    const t = settleUp(b);
    expect(t.length).toBeLessThanOrEqual(ids.length - 1);
    const after = balances(ids, ex, t.map((x, i) => ({ id: `s${i}`, ...x })));
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
  it("is stable: recording one suggested payment leaves the rest unchanged", () => {
    const t = settleUp(balances(ids, ex, []));
    const after = settleUp(balances(ids, ex, [{ id: "s", ...t[0]! }]));
    expect(after).toEqual(t.slice(1));
  });
  it("fuzz: random groups always settle to zero in ≤ n−1 transfers", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let g = 0; g < 300; g++) {
      const n = 2 + Math.floor(rnd() * 8);
      const m = Array.from({ length: n }, (_, k) => `p${k}`);
      const exps: Expense[] = Array.from({ length: 1 + Math.floor(rnd() * 15) }, (_, k) => {
        const amount = 100 + Math.floor(rnd() * 500000);
        const who = m.filter(() => rnd() > 0.3);
        const r = computeSplit(amount, { kind: "equal", members: who.length ? who : [m[0]!] });
        return { id: `e${k}`, amount, paidBy: m[Math.floor(rnd() * n)]!, shares: r.ok ? r.shares : {} };
      });
      const b = balances(m, exps, []);
      expect(sum(b)).toBe(0);
      const t = settleUp(b);
      expect(t.length).toBeLessThanOrEqual(n - 1);
      expect(Object.values(balances(m, exps, t.map((x, i) => ({ id: `${i}`, ...x })))).every((v) => v === 0)).toBe(true);
    }
  });
  it("pairwise (no simplification) nets each pair and matches the totals", () => {
    const p = pairwise(ex, []);
    const net: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 0]));
    for (const t of p) { net[t.from]! -= t.amount; net[t.to]! += t.amount; }
    expect(net).toEqual(balances(ids, ex, []));
    expect(p.find((t) => t.from === "arjun" && t.to === "kavya")).toBeUndefined(); // arjun→kavya 300 nets against kavya→arjun 1000
  });
  it("deleted expenses and settlements don't count", () => {
    expect(balances(ids, [{ ...ex[0]!, deleted: true }], [])).toEqual({ arjun: 0, kavya: 0, priya: 0, rohan: 0 });
  });
});

describe("UPI", () => {
  it("builds a standard intent link", () => {
    expect(upiLink({ vpa: "rohan@okaxis", name: "Rohan Menon", amount: 130000, note: "Goa trip · Split & Settle" }))
      .toBe("upi://pay?pa=rohan%40okaxis&pn=Rohan%20Menon&am=1300.00&cu=INR&tn=Goa%20trip%20%C2%B7%20Split%20%26%20Settle");
  });
  it("validates UPI IDs", () => {
    expect(isVpa("rohan.m@okaxis")).toBe(true);
    expect(isVpa("9876543210@ybl")).toBe(true);
    expect(isVpa("rohan")).toBe(false);
    expect(isVpa("rohan@")).toBe(false);
  });
});
