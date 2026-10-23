import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Appear } from "@/components/Appear";
import { IconButton, TopBar } from "@/components/Brand";
import { Columns, useWide, WIDE_MAX } from "@/components/Columns";
import { Qr } from "@/components/Qr";
import { Avatar, Button, Empty, Field, Loading, Receipt, Row, Rule, Screen, Sheet, Tabs, toast, Txt } from "@/components/ui";
import { rupees, toPaise, upiLink, type Transfer } from "@/lib/money";
import { useGroup } from "@/lib/useGroup";
import type { ExpenseRow, GroupData, Member } from "@/lib/types";
import { ago, copy, dayLabel, describe, isPhoneWeb, share, whatsapp } from "@/lib/util";
import { font, useTheme } from "@/theme";

type Tab = "expenses" | "balances" | "settle" | "activity";

export default function Group() {
  const t = useTheme();
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  const { data, derived, error, store } = useGroup(id);
  const [tab, setTab] = useState<Tab>("expenses");
  const [pay, setPay] = useState<Transfer | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const wide = useWide();

  useEffect(() => { if (created) toast("Group created. Send everyone their invite link."); }, [created]);

  if (error) return <Screen><TopBar /><Empty title="Can't open this group" body={error}><Button kind="ghost" title="Go home" onPress={() => router.replace("/")} /></Empty></Screen>;
  if (!data || !derived || !store) return <Loading />;
  const g = data, d = derived;
  const me = g.members.find((m) => m.id === g.me);
  const notJoined = g.members.filter((m) => !m.joined).length;

  const addBtn = <Button title="+ Add expense" onPress={() => router.push(`/expense?group=${g.id}`)} testID="add-expense" />;
  const summary = (
    <>
      {g.demo && (
        <View style={{ backgroundColor: t.yellow, borderRadius: 4, padding: 10 }}>
          <Txt style={{ color: t.onYellow, fontFamily: font.medium, fontSize: 14.5 }}>Demo group — saved only on this device. Add, edit and settle freely.</Txt>
        </View>
      )}
      <Receipt torn testID="summary">
        <Txt v="label">{d.myBalance > 0 ? "You get back" : d.myBalance < 0 ? "You owe" : "Your balance"}</Txt>
        <Txt v="display" color={d.myBalance > 0 ? t.green : d.myBalance < 0 ? t.red : t.ink} style={{ marginTop: 6, fontVariant: ["tabular-nums"] }}>
          {d.myBalance === 0 ? "All settled" : rupees(Math.abs(d.myBalance))}
        </Txt>
        <Rule dashed style={{ marginVertical: 10 }} />
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: 4 }}>
          <Txt v="small">Group spend <Txt v="small" color={t.ink} style={{ fontFamily: font.monoBold }}>{rupees(d.total)}</Txt></Txt>
          <Txt v="small">Your share <Txt v="small" color={t.ink} style={{ fontFamily: font.monoBold }}>{rupees(d.myShare)}</Txt></Txt>
        </Row>
        {notJoined > 0 && (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/invite?group=${g.id}`)} style={{ marginTop: 10, minHeight: 44, justifyContent: "center" }}>
            <Txt v="small" style={{ textDecorationLine: "underline" }}>{notJoined} {notJoined === 1 ? "person hasn't" : "people haven't"} joined yet — send invite links</Txt>
          </Pressable>
        )}
      </Receipt>
      {wide && addBtn}
      {wide && (
        <Receipt>
          <Txt v="label" style={{ marginBottom: 4 }}>People · {g.members.length}</Txt>
          {g.members.map((m) => (
            <Row key={m.id} gap={10} style={{ paddingVertical: 6 }}>
              <Avatar name={m.name} size={28} dim={!m.joined} />
              <Txt style={{ flex: 1, fontFamily: font.medium }} numberOfLines={1}>{m.isMe ? `${m.name} (you)` : m.name}</Txt>
              <Txt v="small" style={{ fontFamily: font.mono, fontSize: 13, color: (d.bal[m.id] ?? 0) > 0 ? t.green : (d.bal[m.id] ?? 0) < 0 ? t.red : t.muted }}>
                {(d.bal[m.id] ?? 0) === 0 ? "settled" : rupees(d.bal[m.id] ?? 0, { sign: true })}
              </Txt>
            </Row>
          ))}
        </Receipt>
      )}
    </>
  );
  const body = (
    <>
      <Tabs<Tab> value={tab} onChange={setTab} items={[
        { id: "expenses", label: "Expenses" }, { id: "balances", label: "Balances" }, { id: "settle", label: "Settle up" }, { id: "activity", label: "Activity" },
      ]} />
      <View>
        {tab === "expenses" && <Expenses g={g} rows={d.live} name={d.name} />}
        {tab === "expenses" && g.expenses.some((e) => e.deletedAt) && (
          <View style={{ marginTop: 18 }}>
            <Pressable accessibilityRole="button" onPress={() => setShowDeleted((x) => !x)} style={{ minHeight: 44, justifyContent: "center" }}>
              <Txt v="small" style={{ textDecorationLine: "underline" }}>{showDeleted ? "Hide" : "Show"} deleted expenses ({g.expenses.filter((e) => e.deletedAt).length})</Txt>
            </Pressable>
            {showDeleted && g.expenses.filter((e) => e.deletedAt).map((e) => (
              <Row key={e.id} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                <Txt v="small" style={{ flex: 1, textDecorationLine: "line-through" }} numberOfLines={1}>{e.description} · {rupees(e.amount)}</Txt>
                <Button small kind="ghost" title="Restore" onPress={async () => { try { await store.setExpenseDeleted(g.id, e.id, false); toast("Restored."); } catch (x) { toast((x as Error).message); } }} />
              </Row>
            ))}
          </View>
        )}
        {tab === "balances" && <Balances g={g} bal={d.bal} />}
        {tab === "settle" && <Settle g={g} suggestions={d.suggestions} name={d.name} onPay={setPay} store={store} />}
        {tab === "activity" && <Activity g={g} />}
      </View>
    </>
  );

  return (
    <Screen width={wide ? WIDE_MAX : undefined} footer={wide ? undefined : addBtn}>
      <TopBar
        onBack={() => router.replace("/")}
        title={<Row gap={8} style={{ flexShrink: 1 }}><Txt style={{ fontSize: 22 }}>{g.emoji}</Txt><Txt v="h2" numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">{g.name}</Txt></Row>}
        right={<>
          <IconButton label="Invite people" glyph="Invite" onPress={() => router.push(`/invite?group=${g.id}`)} />
          <IconButton label="Group settings" glyph="•••" onPress={() => router.push(`/settings?group=${g.id}`)} />
        </>}
      />
      <View style={{ marginTop: 4 }}>
        <Columns wide={wide} leftWidth={400} left={summary} right={body} />
      </View>

      <PaySheet g={g} transfer={pay} onClose={() => setPay(null)} me={me} onRecord={async (amount, method) => {
        if (!pay) return;
        try { await store.recordPayment(g.id, { from: pay.from, to: pay.to, amount, method }); toast(`Recorded: ${d.name(pay.from)} paid ${d.name(pay.to)} ${rupees(amount)}.`); setPay(null); }
        catch (e) { toast((e as Error).message); }
      }} />
    </Screen>
  );
}

// ---------- expenses ----------
function Expenses({ g, rows, name }: { g: GroupData; rows: ExpenseRow[]; name: (id: string) => string }) {
  const t = useTheme();
  const byDay = useMemo(() => {
    const m = new Map<string, ExpenseRow[]>();
    for (const e of rows) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m];
  }, [rows]);
  if (!rows.length) return <Empty title="No expenses yet" body="Add the first one — the cab, the dinner, the deposit." />;
  return (
    <View style={{ gap: 14 }}>
      {byDay.map(([day, list]) => (
        <View key={day}>
          <Txt v="label" style={{ marginBottom: 6 }}>{dayLabel(day)}</Txt>
          <View style={{ backgroundColor: t.card, borderRadius: 4, borderWidth: 1, borderColor: t.line2 }}>
            {list.map((e, i) => {
              const mine = e.shares[g.me] ?? 0;
              const iPaid = e.paidBy === g.me;
              const lent = iPaid ? e.amount - mine : 0;
              const status = iPaid ? (lent > 0 ? { k: "you lent", v: lent, c: t.green } : null) : mine > 0 ? { k: "you owe", v: mine, c: t.red } : null;
              return (
                <Appear key={e.id} delay={i * 25} duration={250} layout>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${e.description}, ${rupees(e.amount)}, paid by ${iPaid ? "you" : name(e.paidBy)}`} onPress={() => router.push(`/expense?group=${g.id}&id=${e.id}`)}
                    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderStyle: "dashed", borderColor: t.line, backgroundColor: hovered ? t.bg : "transparent" })}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt numberOfLines={1} style={{ fontFamily: font.semibold }}>{e.description}</Txt>
                      <Txt v="small" numberOfLines={1}>{iPaid ? "You" : name(e.paidBy)} paid {rupees(e.amount)}{e.source === "splitwise" ? " · from Splitwise" : ""}</Txt>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {status ? (<><Txt v="label" color={status.c}>{status.k}</Txt><Txt style={{ fontFamily: font.monoBold, fontSize: 14.5, color: status.c }}>{rupees(status.v)}</Txt></>) : <Txt v="label">not involved</Txt>}
                    </View>
                  </Pressable>
                </Appear>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------- balances ----------
function Balances({ g, bal }: { g: GroupData; bal: Record<string, number> }) {
  const t = useTheme();
  const max = Math.max(1, ...Object.values(bal).map(Math.abs));
  const sorted = [...g.members].sort((a, b) => (bal[b.id] ?? 0) - (bal[a.id] ?? 0));
  return (
    <Receipt>
      <Txt v="label" style={{ marginBottom: 6 }}>Who's up, who's down</Txt>
      {sorted.map((m) => {
        const v = bal[m.id] ?? 0;
        return (
          <View key={m.id} style={{ paddingVertical: 9, gap: 6 }}>
            <Row gap={10}>
              <Avatar name={m.name} size={32} dim={!m.joined} />
              <Txt style={{ flex: 1, fontFamily: font.semibold }} numberOfLines={1}>{m.isMe ? `${m.name} (you)` : m.name}</Txt>
              <Txt style={{ fontFamily: font.monoBold, fontSize: 14.5, color: v > 0 ? t.green : v < 0 ? t.red : t.muted }}>{v === 0 ? "settled" : `${v > 0 ? "gets" : "owes"} ${rupees(Math.abs(v))}`}</Txt>
            </Row>
            <View style={{ height: 6, flexDirection: "row" }} aria-hidden>
              <View style={{ flex: 1, alignItems: "flex-end" }}>{v < 0 && <View style={{ width: `${(Math.abs(v) / max) * 100}%`, height: 6, backgroundColor: t.red, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }} />}</View>
              <View style={{ width: 2, backgroundColor: t.line }} />
              <View style={{ flex: 1 }}>{v > 0 && <View style={{ width: `${(v / max) * 100}%`, height: 6, backgroundColor: t.green, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />}</View>
            </View>
          </View>
        );
      })}
    </Receipt>
  );
}

// ---------- settle up ----------
function Settle({ g, suggestions, name, onPay, store }: { g: GroupData; suggestions: Transfer[]; name: (id: string) => string; onPay: (t: Transfer) => void; store: NonNullable<ReturnType<typeof useGroup>["store"]> }) {
  const t = useTheme();
  const remind = async (tr: Transfer) => {
    const to = g.members.find((m) => m.id === tr.to)!;
    const text = `Hi ${name(tr.from)}, settling up “${g.name}” on Split & Settle: you owe ${to.isMe ? "me" : to.name} ${rupees(tr.amount)}.${to.upi ? ` UPI: ${to.upi}` : ""}`;
    const r = await share(text);
    if (r === "copied") toast("Reminder copied — paste it in WhatsApp.");
  };
  const pays = g.payments.filter((p) => !p.deletedAt);
  return (
    <View style={{ gap: 14 }}>
      {suggestions.length ? (
        <Receipt torn>
          <Txt v="label">Suggested payments</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>The fewest payments that settle everyone. Pay outside the app, then record it here.</Txt>
          <Rule dashed style={{ marginVertical: 10 }} />
          {suggestions.map((s) => {
            const fromMe = s.from === g.me, toMe = s.to === g.me;
            return (
              <View key={`${s.from}-${s.to}`} style={{ paddingVertical: 8, gap: 8 }} testID="suggestion">
                <Row gap={8}>
                  <Avatar name={name(s.from)} size={30} />
                  <Txt style={{ flex: 1, fontFamily: font.medium }} numberOfLines={2}>
                    {fromMe ? "You pay" : `${name(s.from)} pays`} {toMe ? "you" : name(s.to)}
                  </Txt>
                  <Txt style={{ fontFamily: font.black, fontSize: 17, fontVariant: ["tabular-nums"] }}>{rupees(s.amount)}</Txt>
                </Row>
                <Row gap={8} style={{ flexWrap: "wrap" }}>
                  {fromMe ? <Button small title="Pay with UPI" onPress={() => onPay(s)} style={{ flexGrow: 1 }} />
                    : <Button small kind="ghost" title={toMe ? "Record payment received" : "Record payment"} onPress={() => onPay(s)} style={{ flexGrow: 1 }} />}
                  {!fromMe && <Button small kind="ghost" title="Send reminder" onPress={() => void remind(s)} style={{ flexGrow: 1 }} />}
                </Row>
              </View>
            );
          })}
        </Receipt>
      ) : <Empty title="Everyone is settled up" body="No payments needed. Nice." />}

      {pays.length > 0 && (
        <View>
          <Txt v="label" style={{ marginBottom: 6 }}>Recorded payments</Txt>
          {pays.map((p) => (
            <Row key={p.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderStyle: "dashed", borderColor: t.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1} style={{ fontFamily: font.medium }}>{name(p.from)} → {name(p.to)}</Txt>
                <Txt v="small" numberOfLines={1}>{dayLabel(p.date)} · {p.method === "upi" ? "UPI" : p.method === "cash" ? "Cash" : "Other"} · recorded by {p.recordedBy === g.me ? "you" : name(p.recordedBy)}</Txt>
              </View>
              <Txt style={{ fontFamily: font.monoBold, fontSize: 14.5, marginRight: 4 }}>{rupees(p.amount)}</Txt>
              <Button small kind="ghost" title="Undo" accessibilityLabel={`Undo payment ${name(p.from)} to ${name(p.to)}`} onPress={async () => { try { await store.setPaymentDeleted(g.id, p.id, true); toast("Payment undone."); } catch (e) { toast((e as Error).message); } }} />
            </Row>
          ))}
        </View>
      )}
    </View>
  );
}

function PaySheet({ g, transfer, onClose, onRecord, me }: { g: GroupData; transfer: Transfer | null; onClose: () => void; onRecord: (amount: number, method: "upi" | "cash" | "other") => Promise<void>; me?: Member }) {
  const t = useTheme();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (transfer) setAmount((transfer.amount / 100).toFixed(2).replace(/\.00$/, "")); }, [transfer]);
  if (!transfer) return null;
  const to = g.members.find((m) => m.id === transfer.to);
  const from = g.members.find((m) => m.id === transfer.from);
  const paise = toPaise(amount);
  const fromMe = transfer.from === me?.id;
  const link = to?.upi && paise ? upiLink({ vpa: to.upi, name: to.name, amount: paise, note: `${g.name} · Split & Settle` }) : null;
  const record = async (m: "upi" | "cash" | "other") => { if (!paise) return; setBusy(m); await onRecord(paise, m); setBusy(null); };
  return (
    <Sheet open onClose={onClose} title={fromMe ? `Pay ${to?.name}` : `${from?.name} → ${to?.name}`}>
      <View style={{ gap: 14 }}>
        <Field label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={amount && !paise ? "Enter an amount" : null} inputStyle={{ fontFamily: font.black, fontSize: 24 }} />
        {fromMe && (to?.upi ? (
          <View style={{ gap: 10 }}>
            {isPhoneWeb() ? (
              <Button title={`Open UPI app · ${paise ? rupees(paise) : ""}`} onPress={() => link && void Linking.openURL(link)} disabled={!link} />
            ) : (
              <Row gap={14} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                {link && <Qr value={link} size={168} label={`UPI QR code to pay ${to.name}`} />}
                <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
                  <Txt style={{ fontFamily: font.semibold }}>Scan with any UPI app</Txt>
                  <Txt v="small">GPay, PhonePe, Paytm or BHIM — the amount and note are filled in.</Txt>
                </View>
              </Row>
            )}
            <Row gap={8}>
              <Txt v="mono" style={{ flex: 1 }} numberOfLines={1} selectable>{to.upi}</Txt>
              <Button small kind="ghost" title="Copy UPI ID" onPress={async () => { await copy(to.upi!); toast("UPI ID copied."); }} />
            </Row>
          </View>
        ) : (
          <View style={{ backgroundColor: t.bg, padding: 12, borderRadius: 4, gap: 8 }}>
            <Txt v="small" style={{ color: t.ink2 }}>{to?.name} hasn't added a UPI ID yet, so there's no payment link. Pay them directly, or ask them to add it in group settings.</Txt>
            <Button small kind="ghost" title={`Ask ${to?.name} for their UPI ID`} onPress={() => whatsapp(`Hey ${to?.name}, can you add your UPI ID in our “${g.name}” group on Split & Settle (group settings → Your UPI ID)? I want to pay you back.`)} />
          </View>
        ))}
        <Rule dashed style={{ marginVertical: 2 }} />
        <Txt v="small">{fromMe ? "After you've paid, record it so everyone's balance updates." : `Record it once ${to?.isMe ? "you've received it" : "it's been paid"}. Everyone sees who recorded it, and it can be undone.`}</Txt>
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Button title="Record UPI payment" kind="dark" onPress={() => void record("upi")} busy={busy === "upi"} disabled={!paise} style={{ flexGrow: 1 }} />
          <Button title="Paid in cash" kind="ghost" onPress={() => void record("cash")} busy={busy === "cash"} disabled={!paise} style={{ flexGrow: 1 }} />
        </Row>
        <Txt v="small">Split & Settle can't see your bank — a recorded payment is what you tell the group.</Txt>
      </View>
    </Sheet>
  );
}

// ---------- activity ----------
function Activity({ g }: { g: GroupData }) {
  if (!g.activity.length) return <Empty title="Nothing yet" />;
  return (
    <Receipt>
      {g.activity.map((a, i) => (
        <View key={a.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderStyle: "dashed", borderColor: "rgba(127,127,127,0.25)" }}>
          <Txt style={{ fontSize: 15 }}>{describe(a, g)}</Txt>
          <Txt v="label" style={{ marginTop: 2 }}>{ago(a.at)}</Txt>
        </View>
      ))}
    </Receipt>
  );
}

