import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Logo } from "@/components/Brand";
import { Avatar, Button, Empty, Field, Loading, Receipt, Row, Rule, Screen, toast, Txt } from "@/components/ui";
import { joinWithInvite, previewInvite } from "@/lib/remote";
import type { InvitePreview } from "@/lib/types";
import { rememberName, rememberedName } from "@/lib/util";
import { useTheme } from "@/theme";

export default function Join() {
  const t = useTheme();
  const { t: token } = useLocalSearchParams<{ t: string }>();
  const [p, setP] = useState<InvitePreview | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const n = rememberedName(); if (n) setName((x) => x || n); }, []);

  useEffect(() => {
    if (!token) { setP(null); return; }
    previewInvite(token).then((x) => { setP(x); if (x?.alreadyMember) router.replace(`/group?id=${x.groupId}`); }).catch((e) => { setErr((e as Error).message); setP(null); });
  }, [token]);

  if (p === undefined) return <Loading />;
  if (!p) return (
    <Screen>
      <Row style={{ minHeight: 56 }}><Logo /></Row>
      <View style={{ marginTop: 30 }}>
        <Empty title="This invite link doesn't work" body={err ?? "It may have been reset by the group admin, or already used. Ask for a fresh link."}>
          <Button kind="ghost" title="Go to Split & Settle" onPress={() => router.replace("/")} />
        </Empty>
      </View>
    </Screen>
  );

  const join = async () => {
    if (!p.forMember && !name.trim()) return;
    setBusy(true);
    try {
      const gid = await joinWithInvite(token!, p.forMember ? "" : name.trim());
      if (!p.forMember) rememberName(name);
      else rememberName(p.forMember.name);
      router.replace(`/group?id=${gid}`);
    } catch (e) { toast((e as Error).message); setBusy(false); }
  };

  return (
    <Screen footer={<Button title={p.forMember ? `Join as ${p.forMember.name}` : "Join group"} onPress={join} busy={busy} disabled={!p.forMember && !name.trim()} testID="join" />}>
      <Row style={{ minHeight: 56 }}><Logo /></Row>
      <View style={{ marginTop: 24 }}>
        <Txt v="label">You're invited to</Txt>
        <Txt v="display" accessibilityRole="header" style={{ marginTop: 8 }}>{p.emoji} {p.name}</Txt>
      </View>
      <Receipt torn style={{ marginTop: 18 }}>
        <Txt v="label">In this group</Txt>
        <Rule dashed style={{ marginVertical: 8 }} />
        {p.people.map((n, i) => (
          <Row key={`${n}-${i}`} gap={10} style={{ paddingVertical: 5 }}>
            <Avatar name={n} size={28} />
            <Txt style={{ flex: 1 }}>{n}{p.forMember?.name === n ? "  ← you" : ""}</Txt>
          </Row>
        ))}
      </Receipt>
      <View style={{ marginTop: 18, gap: 12 }}>
        {p.forMember ? (
          <Txt color={t.ink2}>This link was made for <Txt style={{ fontWeight: "700" }}>{p.forMember.name}</Txt>. If that's not you, ask whoever sent it for the group link instead.</Txt>
        ) : (
          <Field label="Your name" placeholder="What friends call you" value={name} onChangeText={setName} maxLength={40} autoFocus />
        )}
        <Txt v="small">No account needed. You'll stay signed in on this device — open the same link on another phone and you'll join as a new person, so stick to one device.</Txt>
      </View>
    </Screen>
  );
}
