import { useCallback, useEffect, useMemo, useState } from "react";
import { balances, settleUp, type Transfer } from "./money";
import { storeFor } from "./store";
import type { GroupData } from "./types";

export function useGroup(id: string | undefined) {
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    try { setData(await storeFor(id).loadGroup(id)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void reload();
    return storeFor(id).subscribe(id, () => void reload());
  }, [id, reload]);

  const derived = useMemo(() => {
    if (!data) return null;
    const live = data.expenses.filter((e) => !e.deletedAt);
    const pays = data.payments.filter((p) => !p.deletedAt);
    const bal = balances(data.members.map((m) => m.id), live.map((e) => ({ id: e.id, amount: e.amount, paidBy: e.paidBy, shares: e.shares })), pays.map((p) => ({ id: p.id, from: p.from, to: p.to, amount: p.amount })));
    const suggestions: Transfer[] = settleUp(bal);
    const total = live.reduce((s, e) => s + e.amount, 0);
    const myShare = live.reduce((s, e) => s + (e.shares[data.me] ?? 0), 0);
    const name = (mid: string) => data.members.find((m) => m.id === mid)?.name ?? "Someone";
    return { live, pays, bal, suggestions, total, myShare, myBalance: bal[data.me] ?? 0, name };
  }, [data]);

  return { data, derived, error, reload, store: id ? storeFor(id) : null };
}
