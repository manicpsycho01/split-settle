import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { TopBar } from "@/components/Brand";
import { Avatar, Button, Field, Loading, Receipt, Row, Rule, Screen, Tabs, toast, Txt } from "@/components/ui";
import { computeSplit, rupees, toPaise, type SplitKind } from "@/lib/money";
import { useGroup } from "@/lib/useGroup";
import { category, dayLabel, today, yesterday } from "@/lib/util";
import { font, useTheme } from "@/theme";

export default function Expense() {
  const t = useTheme();
  const { group, id } = useLocalSearchParams<{ group: string; id?: string }>();
  const { data, store } = useGroup(group);
  const existing = data?.expenses.find((e) => e.id === id);

  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<SplitKind>("equal");
  const [included, setIncluded] = useState<string[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!data || ready) return;
    const everyone = data.members.map((m) => m.id);
    if (existing) {
      setAmount(String(existing.amount / 100));
      setDesc(existing.description);
      setPaidBy(existing.paidBy);
      setDate(existing.date);
      setKind(existing.splitKind);
      if (existing.splitKind === "equal") setIncluded(Object.keys(existing.shares));
      else {
        setIncluded(everyone);
        const inp = existing.splitInput as Record<string, number>;
        setVals(Object.fromEntries(Object.entries(existing.splitKind === "exact" ? existing.shares : inp).map(([k, v]) => [k, existing.splitKind === "exact" ? String(v / 100) : String(v)])));
      }
    } else {
      setPaidBy(data.me || everyone[0]!);
      setIncluded(everyone);
    }
    setReady(true);
  }, [data, existing, ready]);

  const paise = toPaise(amount);
  const split = useMemo(() => {
    if (!paise) return null;
    if (kind === "equal") return computeSplit(paise, { kind, members: included });
    const nums = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v.replace(/,/g, "")) || 0]));
    if (kind === "exact") return computeSplit(paise, { kind, amounts: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, toPaise(v) ?? 0])) });
    if (kind === "shares") return computeSplit(paise, { kind, shares: nums });
    return computeSplit(paise, { kind, percents: nums });
  }, [paise, kind, included, vals]);

  if (!data || !store) return <Loading />;
  const canEdit = !existing || existing.createdBy === data.me || data.isAdmin;
  const name = (m: string) => data.members.find((x) => x.id === m)?.name ?? "";

  const save = async () => {
    setTried(true);
    if (!paise || !desc.trim() || !split?.ok) return;
    setBusy(true);
    try {
      const splitInput = kind === "equal" ? included : Object.fromEntries(Object.entries(vals).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, kind === "exact" ? toPaise(v) ?? 0 : Number(v)]));
      await store.saveExpense(data.id, { description: desc.trim(), amount: paise, paidBy, splitKind: kind, splitInput, shares: split.shares, date, category: category(desc) }, existing?.id);
      toast(existing ? "Expense updated." : "Expense added.");
      router.back();
    } catch (e) { toast((e as Error).message); setBusy(false); }
  };
  const remove = async () => {
    if (!existing) return;
    try { await store.setExpenseDeleted(data.id, existing.id, true); toast("Deleted. You can restore it from the expenses list."); router.back(); }
    catch (e) { toast((e as Error).message); }
  };

  const setVal = (k: string, v: string) => setVals((x) => ({ ...x, [k]: v }));
  const exactLeft = kind === "exact" && paise ? paise - Object.values(vals).reduce((s, v) => s + (toPaise(v) ?? 0), 0) : 0;

  return (
    <Screen footer={canEdit ? <Button title={existing ? "Save changes" : "Add expense"} onPress={save} busy={busy} testID="save-expense" /> : undefined}>
      <TopBar title={existing ? "Edit expense" : "Add expense"} />
      {!canEdit && <Receipt><Txt v="small">Only the person who added this expense or the group admin can change it.</Txt></Receipt>}

      <View pointerEvents={canEdit ? "auto" : "none"} style={{ gap: 18, opacity: canEdit ? 1 : 0.6 }}>
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <Txt v="label">Amount</Txt>
          <Row gap={2} style={{ marginTop: 4 }}>
            <Txt style={{ fontFamily: font.black, fontSize: 44, color: t.muted }}>₹</Txt>
            <TextInput
              accessibilityLabel="Amount in rupees"
              testID="amount"
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^\d.,]/g, ""))}
              placeholder="0"
              placeholderTextColor={t.muted}
              keyboardType="decimal-pad"
              autoFocus={!existing}
              style={[{ fontFamily: font.black, fontSize: 52, color: t.ink, width: Math.min(300, Math.max(1, amount.length) * 31 + 16), textAlign: "left", paddingVertical: 4 }, { outlineStyle: "none" } as object]}
            />
          </Row>
          {tried && !paise && <Txt v="small" color={t.red}>Enter the amount</Txt>}
        </View>

        <Field label="What was it for?" placeholder="Dinner, cab, groceries…" value={desc} onChangeText={setDesc} maxLength={80} error={tried && !desc.trim() ? "Add a short description" : null} />

        <View style={{ gap: 8 }}>
          <Txt v="label">Paid by</Txt>
          <Row gap={6} style={{ flexWrap: "wrap" }}>
            {data.members.map((m) => (
              <Chip key={m.id} on={paidBy === m.id} onPress={() => setPaidBy(m.id)} label={m.isMe ? "You" : m.name} role="radio" />
            ))}
          </Row>
        </View>

        <View style={{ gap: 8 }}>
          <Txt v="label">When</Txt>
          <Row gap={6} style={{ flexWrap: "wrap" }}>
            <Chip on={date === today()} onPress={() => setDate(today())} label="Today" role="radio" />
            <Chip on={date === yesterday()} onPress={() => setDate(yesterday())} label="Yesterday" role="radio" />
            <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} style={{ flexGrow: 1, minWidth: 150 }}
              error={!/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Use YYYY-MM-DD" : null} hint={dayLabel(date)} />
          </Row>
        </View>

        <View style={{ gap: 10 }}>
          <Txt v="label">Split</Txt>
          <Tabs<SplitKind> value={kind} onChange={(k) => { setKind(k); if (k !== "equal") setVals({}); }} items={[{ id: "equal", label: "Equally" }, { id: "exact", label: "Amounts" }, { id: "shares", label: "Shares" }, { id: "percent", label: "%" }]} />
          <Receipt>
            {data.members.map((m) => {
              const share = split?.ok ? split.shares[m.id] ?? 0 : null;
              return (
                <Row key={m.id} gap={10} style={{ paddingVertical: 6, minHeight: 50 }}>
                  <Avatar name={m.name} size={30} />
                  <Txt style={{ flex: 1, fontFamily: font.medium }} numberOfLines={1}>{m.isMe ? `${m.name} (you)` : m.name}</Txt>
                  {kind === "equal" ? (
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: included.includes(m.id) }} accessibilityLabel={`Include ${m.name}`}
                      onPress={() => setIncluded((xs) => (xs.includes(m.id) ? xs.filter((x) => x !== m.id) : [...xs, m.id]))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                      <Txt style={{ fontFamily: font.mono, fontSize: 14, color: included.includes(m.id) ? t.ink : t.muted }}>{included.includes(m.id) && share !== null ? rupees(share) : "—"}</Txt>
                      <View style={{ width: 24, height: 24, borderRadius: 3, borderWidth: 1.5, borderColor: t.ink, backgroundColor: included.includes(m.id) ? t.ink : "transparent", alignItems: "center", justifyContent: "center" }}>
                        {included.includes(m.id) && <Txt style={{ color: t.bg, fontFamily: font.black, fontSize: 14 }}>✓</Txt>}
                      </View>
                    </Pressable>
                  ) : (
                    <Row gap={6}>
                      {kind !== "exact" && share !== null && <Txt v="mono" color={t.muted}>{rupees(share)}</Txt>}
                      <TextInput
                        accessibilityLabel={`${kind === "exact" ? "Amount" : kind === "shares" ? "Shares" : "Percent"} for ${m.name}`}
                        value={vals[m.id] ?? ""}
                        onChangeText={(v) => setVal(m.id, v.replace(/[^\d.]/g, ""))}
                        keyboardType="decimal-pad"
                        placeholder={kind === "exact" ? "₹0" : kind === "shares" ? "0" : "0%"}
                        placeholderTextColor={t.muted}
                        style={[{ width: 92, minHeight: 44, borderWidth: 1.5, borderColor: t.line, borderRadius: 4, paddingHorizontal: 10, fontFamily: font.mono, fontSize: 15, color: t.ink, textAlign: "right", backgroundColor: t.bg }, { outlineStyle: "none" } as object]}
                      />
                    </Row>
                  )}
                </Row>
              );
            })}
            <Rule dashed style={{ marginVertical: 8 }} />
            <Txt v="small" testID="split-status" color={split && !split.ok ? t.red : t.ink2}>
              {!paise ? "Enter an amount to see the split." : split?.ok
                ? kind === "equal" ? `${included.length} ${included.length === 1 ? "person" : "people"} · ${rupees(Math.floor(paise / Math.max(1, included.length)))} each${paise % Math.max(1, included.length) ? " (paise rounded fairly)" : ""}` : "Adds up exactly."
                : kind === "exact" && exactLeft > 0 ? `${rupees(exactLeft)} left to assign` : split?.error}
            </Txt>
          </Receipt>
        </View>

        {existing && canEdit && (
          <View style={{ gap: 8 }}>
            <Rule />
            <Txt v="small">Added by {name(existing.createdBy)}{existing.source === "splitwise" ? " (imported from Splitwise)" : ""}.</Txt>
            <Button kind="danger" title="Delete expense" onPress={remove} />
          </View>
        )}
      </View>
    </Screen>
  );
}

function Chip({ on, onPress, label, role }: { on: boolean; onPress: () => void; label: string; role: "radio" | "button" }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole={role} accessibilityState={{ selected: on, checked: on }} accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1.5, borderColor: on ? t.ink : t.line, backgroundColor: on ? t.black : t.card, justifyContent: "center" }}>
      <Txt style={{ fontFamily: on ? font.bold : font.medium, color: on ? t.onBlack : t.ink }}>{label}</Txt>
    </Pressable>
  );
}
