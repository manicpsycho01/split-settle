import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { TopBar } from "@/components/Brand";
import { Qr } from "@/components/Qr";
import { Avatar, Button, Empty, Loading, Receipt, Row, Rule, Screen, toast, Txt } from "@/components/ui";
import type { InviteLinks } from "@/lib/types";
import { useGroup } from "@/lib/useGroup";
import { copy, inviteUrl, whatsapp } from "@/lib/util";
import { font } from "@/theme";

export default function Invite() {
  const { group } = useLocalSearchParams<{ group: string }>();
  const { data, store } = useGroup(group);
  const [links, setLinks] = useState<InviteLinks | null>(null);
  const load = useCallback(async () => { if (store && group) try { setLinks(await store.inviteLinks(group)); } catch (e) { toast((e as Error).message); } }, [store, group]);
  useEffect(() => { void load(); }, [load, data?.members.length]);
  if (!data || !links) return <Loading />;

  const groupUrl = inviteUrl(links.group);
  const msg = (who?: string) => `${who ? `Hi ${who}! ` : ""}Join “${data.name}” on Split & Settle to see what you owe and settle by UPI:`;
  const demoNote = data.demo ? "This is the demo — links here are examples and won't open a real group." : null;

  return (
    <Screen>
      <TopBar title="Invite people" />
      {demoNote && <Receipt style={{ marginBottom: 12 }}><Txt v="small">{demoNote}</Txt></Receipt>}

      {links.people.length > 0 && (
        <View style={{ gap: 10, marginBottom: 22 }}>
          <Txt v="h2" accessibilityRole="header">Personal links</Txt>
          <Txt v="small">Each link joins as that person, and works once — so nobody can join as someone else.</Txt>
          {links.people.map((p) => (
            <Receipt key={p.memberId}>
              <Row gap={10}>
                <Avatar name={p.name} size={34} />
                <Txt style={{ flex: 1, fontFamily: font.semibold }} numberOfLines={1}>{p.name}</Txt>
              </Row>
              <Row gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
                <Button small title="WhatsApp" onPress={() => whatsapp(`${msg(p.name)} ${inviteUrl(p.token)}`)} style={{ flexGrow: 1 }} accessibilityLabel={`Send ${p.name}'s link on WhatsApp`} />
                <Button small kind="ghost" title="Copy link" onPress={async () => { await copy(inviteUrl(p.token)); toast(`${p.name}'s link copied.`); }} style={{ flexGrow: 1 }} accessibilityLabel={`Copy ${p.name}'s link`} />
              </Row>
            </Receipt>
          ))}
        </View>
      )}

      <Txt v="h2" accessibilityRole="header">Group link</Txt>
      <Txt v="small" style={{ marginTop: 4 }}>For anyone not listed above — they join as a new person.</Txt>
      <Receipt torn style={{ marginTop: 10 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Qr value={groupUrl} size={190} label="QR code for the group invite link" />
          <Txt v="mono" selectable numberOfLines={1} style={{ fontSize: 12.5 }}>{groupUrl.replace(/^https?:\/\//, "")}</Txt>
        </View>
        <Rule dashed />
        <Row gap={8} style={{ flexWrap: "wrap" }}>
          <Button small title="Share on WhatsApp" onPress={() => whatsapp(`${msg()} ${groupUrl}`)} style={{ flexGrow: 1 }} />
          <Button small kind="ghost" title="Copy group link" onPress={async () => { await copy(groupUrl); toast("Group link copied."); }} style={{ flexGrow: 1 }} />
        </Row>
      </Receipt>

      {data.isAdmin && !data.demo && (
        <View style={{ marginTop: 18, gap: 6 }}>
          <Button small kind="ghost" title="Reset group link" onPress={async () => { try { await store!.rotateInvite(data.id); await load(); toast("New group link made. The old one no longer works."); } catch (e) { toast((e as Error).message); } }} />
          <Txt v="small">Use this if the link was shared somewhere it shouldn't be. People already in the group stay in.</Txt>
        </View>
      )}
      {!links.people.length && !links.group && <Empty title="No links" />}
    </Screen>
  );
}
