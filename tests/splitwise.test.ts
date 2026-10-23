import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSplitwise } from "../src/lib/splitwise";

const csv = readFileSync("tests/fixtures/splitwise-goa.csv", "utf8");

describe("Splitwise export import", () => {
  const r = parseSplitwise(csv);
  it("reads people and every row", () => {
    expect(r.people).toEqual(["Asha Rao", "Bilal Khan", "Chetan Iyer", "Divya Menon"]);
    expect(r.currency).toBe("INR");
    expect(r.skipped).toBe(0);
  });
  it("rebuilds single-payer expenses with exact shares", () => {
    const f = r.rows.find((x) => x.description === "Flights to Goa")!;
    expect(f).toEqual({ kind: "expense", date: "2026-09-02", description: "Flights to Goa", amount: 2400000, payer: 0, shares: { 0: 600000, 1: 600000, 2: 600000, 3: 600000 } });
    const g = r.rows.find((x) => x.description === "Groceries")!;
    expect(g.kind === "expense" && Object.values(g.shares).reduce((a, b) => a + b, 0)).toBe(199999);
  });
  it("splits a two-payer row into one expense per payer", () => {
    expect(r.rows.filter((x) => x.description.startsWith("Villa")).map((x) => x.description)).toEqual(["Villa (split payment) (paid by Asha Rao)", "Villa (split payment) (paid by Bilal Khan)"]);
  });
  it("turns Payment rows into recorded payments", () => {
    expect(r.rows.find((x) => x.kind === "payment")).toMatchObject({ amount: 500000, from: 1, to: 0 });
  });
  it("reproduces Splitwise's own Total balance row exactly", () => {
    expect(r.matchesTotals).toBe(true);
    expect(r.balances).toEqual([1998333, 928333, -1421666, -1505000]);
  });
  it("explains a wrong file and refuses mixed currencies", () => {
    expect(() => parseSplitwise("name,email\na,b")).toThrow(/Export as spreadsheet/);
    expect(() => parseSplitwise(csv.replace("1200.00,INR", "1200.00,USD"))).toThrow(/mixes currencies/);
  });
});

it("flags an export whose rows don't add up to its Total balance row", () => {
  const bad = readFileSync("tests/fixtures/splitwise-goa.csv", "utf8").replace("19983.33,9283.33", "19000.00,10266.66");
  expect(parseSplitwise(bad).matchesTotals).toBe(false);
});
