/**
 * Splitwise group export ("Export as spreadsheet") → rows Split & Settle can import.
 *
 * The export has one column per person holding that person's NET effect for each row
 * (what they paid minus their share), plus a final "Total balance" row. Payer identity isn't
 * given directly, so each row is rebuilt so every net is reproduced exactly:
 *   · one person with a positive net → they paid; shares = cost − net for them, −net for the rest
 *   · several positive nets → one expense per payer, the debtors' amounts matched to payers in order
 *   · category "Payment" → a recorded payment from the positive person to the negative one
 * The import is checked against the export's own "Total balance" row before anything is saved.
 */
import Papa from "papaparse";
import { toPaise, type Paise } from "./money";

export type SwRow =
  | { kind: "expense"; date: string; description: string; amount: Paise; payer: number; shares: Record<number, Paise> }
  | { kind: "payment"; date: string; description: string; amount: Paise; from: number; to: number };

export type SwImport = { people: string[]; rows: SwRow[]; balances: Paise[]; currency: string; skipped: number; matchesTotals: boolean | null };

export class SplitwiseError extends Error {}

const money = (s: string): Paise | null => {
  const t = s.trim().replace(/,/g, "");
  if (t === "" ) return 0;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
};

export function parseSplitwise(text: string): SwImport {
  const rows = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false }).data;
  const head = rows.findIndex((r) => r[0]?.trim().toLowerCase() === "date" && r[1]?.trim().toLowerCase() === "description");
  if (head < 0) throw new SplitwiseError("This doesn't look like a Splitwise group export. In Splitwise, open the group → Settings → Export as spreadsheet.");
  const h = rows[head]!.map((x) => x.trim());
  const ci = (name: string) => h.findIndex((x) => x.toLowerCase() === name);
  const iCat = ci("category"), iCost = ci("cost"), iCur = ci("currency");
  if (iCost < 0 || iCur < 0) throw new SplitwiseError("The export is missing the Cost or Currency column.");
  const first = Math.max(iCat, iCost, iCur) + 1;
  const people = h.slice(first).filter(Boolean);
  if (people.length < 2) throw new SplitwiseError("The export needs at least two people.");
  if (people.length > 50) throw new SplitwiseError("Groups can have up to 50 people.");

  const out: SwRow[] = [];
  const bal: Paise[] = people.map(() => 0);
  let currency = "", skipped = 0, totals: Paise[] | null = null;

  for (const r of rows.slice(head + 1)) {
    if (!r.some((c) => c && c.trim())) continue;
    const desc = (r[1] ?? "").trim();
    const nets = people.map((_, k) => money(r[first + k] ?? ""));
    if (/^total balance$/i.test(desc)) { if (nets.every((n) => n !== null)) totals = nets as Paise[]; continue; }
    const date = (r[0] ?? "").trim().slice(0, 10);
    const cost = toPaise((r[iCost] ?? "").replace(/^-/, "")) ;
    const cur = (r[iCur] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || nets.some((n) => n === null)) { skipped++; continue; }
    if (cur) {
      if (currency && cur !== currency) throw new SplitwiseError(`This export mixes currencies (${currency} and ${cur}). Split & Settle works in one currency per group.`);
      currency = cur;
    }
    const n = nets as Paise[];
    if (n.reduce((a, b) => a + b, 0) !== 0 || n.every((x) => x === 0)) { skipped++; continue; }
    n.forEach((v, k) => { bal[k]! += v; });
    const pos = n.map((v, k) => ({ k, v })).filter((x) => x.v > 0);
    const neg = n.map((v, k) => ({ k, v: -v })).filter((x) => x.v > 0);
    const label = desc || "Splitwise expense";

    if (/^payment$/i.test((r[iCat] ?? "").trim())) {
      // A payment: the one who paid has +amount, the one who received −amount.
      for (const p of pos) {
        for (const q of neg) {
          const amt = Math.min(p.v, q.v);
          if (amt > 0) { out.push({ kind: "payment", date, description: label, amount: amt, from: p.k, to: q.k }); p.v -= amt; q.v -= amt; }
        }
      }
      continue;
    }
    if (pos.length === 1 && cost && cost >= pos[0]!.v) {
      const p = pos[0]!;
      const shares: Record<number, Paise> = {};
      if (cost - p.v > 0) shares[p.k] = cost - p.v;
      for (const q of neg) shares[q.k] = q.v;
      out.push({ kind: "expense", date, description: label, amount: cost, payer: p.k, shares });
      continue;
    }
    // Several payers (or no usable cost): one expense per payer, covered by the debtors in order.
    for (const p of pos) {
      const shares: Record<number, Paise> = {};
      let need = p.v;
      for (const q of neg) {
        if (!need) break;
        const amt = Math.min(need, q.v);
        if (amt > 0) { shares[q.k] = (shares[q.k] ?? 0) + amt; q.v -= amt; need -= amt; }
      }
      out.push({ kind: "expense", date, description: pos.length > 1 ? `${label} (paid by ${people[p.k]})` : label, amount: p.v, payer: p.k, shares });
    }
  }
  if (!out.length) throw new SplitwiseError("No expenses found in this export.");
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { people, rows: out, balances: bal, currency: currency || "INR", skipped, matchesTotals: totals ? totals.every((t, k) => t === bal[k]) : null };
}
