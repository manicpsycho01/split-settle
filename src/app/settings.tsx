import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { TopBar } from "@/components/Brand";
import { Avatar, Button, Field, Loading, Receipt, Row, Rule, Screen, toast, Txt } from "@/components/ui";
import { resetDemo } from "@/lib/demo";
import { isVpa } from "@/lib/money";
import { useGroup } from "@/lib/useGroup";
import { font, useTheme } from "@/theme";

export default function Settings() {
  const t = useTheme();
  const { group } = useLocalSearchParams<{ group: string }>();
  const { data, store } = useGroup(group);
  const me = data?.members.find((m) => m.id === data.me);
  const [myName, setMyName] = useState("");
  const [upi, setUpi] = useState("");
  const [gName, setGName] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (me) { setMyName(me.name); setUpi(me.upi ?? ""); } if (data) setGName(data.name); }, [me?.id, data?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !store) return <Loading />;

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); toast(ok); } catch (e) { toast((e as Error).message); }
    setBusy(null);
  };
  const upiErr = upi.trim() && !isVpa(upi) ? "That doesn't look like a UPI ID (like name@okaxis or 98xxxxxx10@ybl)" : null;

  return (
    <Screen>
      <TopBar title="Group settings" />
      {me && (
        <View style={{ gap: 12 }}>
          <Txt v="h2" accessibilityRole="header">You</Txt>
          <Field label="Your name" value={myName} onChangeText={setMyName} maxLength={40} />
          <Field label="Your UPI ID" value={upi} onChangeText={setUpi} autoCapitalize="none" autoCorrect={false} placeholder="name@okaxis" error={upiErr}
            hint="So friends can pay you back in one tap. It's only shown to people in this group." />
          <Button kind="dark" title="Save" busy={busy === "me"} disabled={!!upiErr || !myName.trim()}
            onPress={() => run("me", () => store.updateMember(data.id, me.id, { name: myName, upi: upi.trim() || null }), "Saved.")} />
        </View>
      )}

      <Rule style={{ marginVertical: 22 }} />
      <Txt v="h2" accessibilityRole="header">People</Txt>
      <Receipt style={{ marginTop: 10 }}>
        {data.members.map((m) => (
          <Row key={m.id} gap={10} style={{ paddingVertical: 7, minHeight: 48 }}>
            <Avatar name={m.name} size={32} dim={!m.joined} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt numberOfLines={1} style={{ fontFamily: font.semibold }}>{m.name}{m.isMe ? " (you)" : ""}</Txt>
              <Txt v="small" numberOfLines={1}>{m.isAdmin ? "Admin · " : ""}{m.joined ? "Joined" : "Hasn't joined yet"}{m.upi ? ` · ${m.upi}` : ""}</Txt>
            </View>
            {data.isAdmin && m.joined && !m.isAdmin && !data.demo && (
              <Button small kind="ghost" title="Unlink" accessibilityLabel={`Unlink ${m.name}`} onPress={() => run(`u${m.id}`, () => store.unlinkMember(data.id, m.id), `${m.name} unlinked — send them a new personal link.`)} />
            )}
          </Row>
        ))}
      </Receipt>
      <Row gap={8} style={{ marginTop: 10, alignItems: "flex-end" }}>
        <Field label="Add a person" placeholder="Name" value={newPerson} onChangeText={setNewPerson} maxLength={40} style={{ flex: 1 }} />
        <Button kind="dark" title="Add" disabled={!newPerson.trim()} busy={busy === "add"} onPress={() => run("add", async () => { await store.addMember(data.id, newPerson); setNewPerson(""); }, "Added. Send them their invite link.")} />
      </Row>
      {data.isAdmin && <Txt v="small" style={{ marginTop: 8 }}>“Unlink” is for when someone joined as the wrong person: their expenses stay, and they get a fresh personal link.</Txt>}

      {data.isAdmin && (
        <>
          <Rule style={{ marginVertical: 22 }} />
          <Txt v="h2" accessibilityRole="header">Group</Txt>
          <Field label="Group name" value={gName} onChangeText={setGName} maxLength={60} style={{ marginTop: 10 }} />
          <Button kind="dark" title="Rename" style={{ marginTop: 10 }} disabled={!gName.trim() || gName === data.name} busy={busy === "g"} onPress={() => run("g", () => store.renameGroup(data.id, gName, data.emoji), "Renamed.")} />
        </>
      )}

      {data.demo && (
        <>
          <Rule style={{ marginVertical: 22 }} />
          <Button kind="danger" title="Reset the demo" onPress={async () => { await resetDemo(); toast("Demo reset."); router.replace("/"); }} />
        </>
      )}
      <Txt v="small" style={{ marginTop: 22, color: t.muted }}>Everyone in a group can add expenses and record payments. Only the person who added an expense, or the admin, can edit or delete it — and every change shows up in Activity.</Txt>
    </Screen>
  );
}
