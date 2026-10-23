import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { TopBar } from "@/components/Brand";
import { Columns, useWide } from "@/components/Columns";
import { Button, Field, Row, Screen, Tap, toast, Txt } from "@/components/ui";
import { remote } from "@/lib/remote";
import { rememberName, rememberedName } from "@/lib/util";
import { font, useTheme } from "@/theme";

const EMOJI = ["🛺", "🏖️", "🏔️", "🏠", "🍽️", "🎉", "✈️", "🚗"];

export default function NewGroup() {
  const t = useTheme();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI[0]!);
  const [me, setMe] = useState("");
  const [others, setOthers] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const wide = useWide(900);
  useEffect(() => { const n = rememberedName(); if (n) setMe((x) => x || n); }, []);
  const [tried, setTried] = useState(false);

  const cleanOthers = others.map((o) => o.trim()).filter(Boolean);
  const dup = new Set([me.trim().toLowerCase(), ...cleanOthers.map((o) => o.toLowerCase())]).size !== cleanOthers.length + 1;
  const errName = tried && !name.trim() ? "Give the group a name" : null;
  const errMe = tried && !me.trim() ? "Enter your name" : null;

  const create = async () => {
    setTried(true);
    if (!name.trim() || !me.trim() || dup) return;
    setBusy(true);
    try {
      const id = await remote.createGroup(name.trim(), emoji, me.trim(), cleanOthers);
      rememberName(me);
      router.replace(`/group?id=${id}&created=1`);
    } catch (e) { toast((e as Error).message); setBusy(false); }
  };

  const createBtn = <Button title="Create group" onPress={create} busy={busy} testID="create" />;

  return (
    <Screen width={wide ? 1000 : undefined} footer={wide ? undefined : createBtn}>
      <TopBar title="New group" />
      <View style={{ marginTop: 8 }}>
      <Columns wide={wide} leftWidth={420} gap={48}
        left={<View style={{ gap: 20 }}>

        <Field label="Group name" placeholder="Goa trip, Flat 4B, Friday dinners…" value={name} onChangeText={setName} maxLength={60} error={errName} autoFocus />
        <View style={{ gap: 6 }}>
          <Txt v="label">Icon</Txt>
          <Row gap={6} style={{ flexWrap: "wrap" }}>
            {EMOJI.map((e) => (
              <Pressable key={e} accessibilityRole="radio" accessibilityState={{ selected: e === emoji }} accessibilityLabel={`Icon ${e}`} onPress={() => setEmoji(e)}
                style={{ width: 46, height: 46, borderRadius: 4, borderWidth: 1.5, borderColor: e === emoji ? t.ink : t.line, backgroundColor: e === emoji ? t.yellow : t.card, alignItems: "center", justifyContent: "center" }}>
                <Txt style={{ fontSize: 22 }}>{e}</Txt>
              </Pressable>
            ))}
          </Row>
        </View>
        <Field label="Your name" placeholder="What friends call you" value={me} onChangeText={setMe} maxLength={40} error={errMe} />
        </View>}
        right={<View style={{ gap: 20 }}>
        <View style={{ gap: 8 }}>
          <Txt v="label">Who else? (you can add more later)</Txt>
          {others.map((o, i) => (
            <Row key={i} gap={8}>
              <Field label={`Friend ${i + 1}`} style={{ flex: 1 }} placeholder="Name" value={o} maxLength={40}
                onChangeText={(v) => setOthers((xs) => xs.map((x, k) => (k === i ? v : x)))} />
              {others.length > 1 && (
                <Tap label={`Remove friend ${i + 1}`} onPress={() => setOthers((xs) => xs.filter((_, k) => k !== i))} style={{ width: 44, height: 50, marginTop: 22, alignItems: "center", justifyContent: "center" }}>
                  <Txt v="h2" color={t.muted}>✕</Txt>
                </Tap>
              )}
            </Row>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setOthers((xs) => [...xs, ""])} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
            <Txt style={{ fontFamily: font.bold, textDecorationLine: "underline" }}>+ Add another friend</Txt>
          </Pressable>
          {tried && dup && <Txt v="small" color={t.red}>Two people have the same name — add an initial so you can tell them apart.</Txt>}
          <Txt v="small">Each friend gets their own invite link, so nobody can join as someone else.</Txt>
        </View>
                {wide && createBtn}
        </View>} />
      </View>
    </Screen>
  );
}
