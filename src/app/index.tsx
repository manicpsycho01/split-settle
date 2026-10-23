import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, useWindowDimensions, View } from "react-native";
import { Appear } from "@/components/Appear";
import { Logo } from "@/components/Brand";
import { useMounted } from "@/hooks/use-mounted";
import { Avatar, Button, Leader, Receipt, Row, Rule, Screen, Txt } from "@/components/ui";
import { DEMO_ID, demoExists } from "@/lib/demo";
import { rupees } from "@/lib/money";
import { remote } from "@/lib/remote";
import type { GroupSummary } from "@/lib/types";
import { font, useTheme } from "@/theme";

const HOW = [["Join with a link", "Send the group link on WhatsApp. Friends open it, type their name, and they're in. No app store, no password."],
                ["Fair to the paisa", "Split equally, by exact amounts, by shares or by percentage. Every split adds up exactly — no stray ₹0.01."],
                ["Pay in one tap", "Each suggested payment opens GPay, PhonePe or Paytm with the amount filled in. On a laptop, scan the QR."],
                ["Nothing goes missing", "Everyone sees changes live. Edits and deletes are logged with who made them, and can be undone."]];

const REPO = "https://github.com/manicpsycho01/split-settle";

export default function Home() {
  const t = useTheme();
  const mounted = useMounted();
  const { width: w } = useWindowDimensions();
  const width = mounted ? w : 390;
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [hasDemo, setHasDemo] = useState(false);

  useFocusEffect(useCallback(() => {
    let on = true;
    void (async () => {
      const [g, d] = await Promise.all([remote.listGroups().catch(() => []), demoExists()]);
      if (on) { setGroups(g); setHasDemo(d); }
    })();
    return () => { on = false; };
  }, []));

  // Only real groups switch home to "Your groups" — someone who has just tried the demo still needs the pitch.
  const anyGroups = (groups?.length ?? 0) > 0;
  const wide = width >= 900;
  const hero = width < 380 ? 40 : width < 900 ? 50 : 64;

  return (
    <Screen width={!anyGroups && wide ? 1120 : undefined}>
      <Row style={{ minHeight: 56, justifyContent: "space-between" }}>
        <Logo />
        {anyGroups && <Button small kind="ghost" title="+ New group" onPress={() => router.push("/new")} />}
      </Row>

      {anyGroups ? (
        <View style={{ marginTop: 18, gap: 10 }}>
          <Txt v="title" accessibilityRole="header">Your groups</Txt>
          {(groups ?? []).map((g, i) => <GroupCard key={g.id} g={g} i={i} />)}
          {hasDemo && <GroupCard g={{ id: DEMO_ID, name: "Goa trip", emoji: "🏖️", myBalance: 0, people: 4, demo: true }} i={(groups ?? []).length} />}
          <Row gap={10} style={{ marginTop: 10, flexWrap: "wrap" }}>
            <Button title="Start a group" onPress={() => router.push("/new")} style={{ flexGrow: 1 }} />
            <Button kind="ghost" title="Import from Splitwise" onPress={() => router.push("/import")} style={{ flexGrow: 1 }} />
          </Row>
          <View style={{ marginTop: 26, gap: 14 }}>
            <Txt v="label">How it works</Txt>
            {HOW.map(([h, b]) => (
              <View key={h} style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 10, height: 10, marginTop: 6, backgroundColor: t.yellow, borderWidth: 1.5, borderColor: t.ink }} />
                <View style={{ flex: 1 }}><Txt v="h2">{h}</Txt><Txt v="small" style={{ marginTop: 3, color: t.ink2, fontSize: 15, lineHeight: 22 }}>{b}</Txt></View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: wide ? 48 : 22, flexDirection: wide ? "row" : "column", gap: wide ? 64 : 0, alignItems: "flex-start" }}>
          <View style={{ flex: wide ? 1.1 : undefined, width: wide ? undefined : "100%" }}>
            <Appear duration={500}>
              <Txt v="label">For trips, flats & dinners · free · no sign-up</Txt>
              <Txt v="display" accessibilityRole="header" style={{ marginTop: 12, fontSize: hero, lineHeight: hero * 1.0 }}>
                Split the bill.{"\n"}Settle in one{" "}
                <Txt v="display" style={{ fontSize: hero, lineHeight: hero * 1.0, backgroundColor: t.yellow, color: t.onYellow }}>UPI tap.</Txt>
              </Txt>
              <Txt style={{ marginTop: 14, color: t.ink2, fontSize: 17, lineHeight: 25, maxWidth: 520 }}>
                Add what everyone paid. Split & Settle works out who owes whom — to the paisa — and turns it into UPI payments your friends can make in a tap.
              </Txt>
            </Appear>

            <Appear delay={120} duration={500} style={{ marginTop: 22, gap: 10, maxWidth: 520 }}>
              <Button title="Start a group" onPress={() => router.push("/new")} testID="start" />
              <Row gap={10} style={{ flexWrap: "wrap" }}>
                <Button kind="ghost" title={hasDemo ? "Continue the demo" : "Try the demo"} onPress={() => router.push("/demo")} style={{ flexGrow: 1, flexBasis: 160 }} />
                <Button kind="ghost" title="Import from Splitwise" onPress={() => router.push("/import")} style={{ flexGrow: 1, flexBasis: 160 }} />
              </Row>
            </Appear>

            {!wide && <Appear delay={220} duration={500} style={{ marginTop: 34 }}><SampleReceipt /></Appear>}

            <View style={{ marginTop: 34, gap: 18, maxWidth: 560 }}>
              {HOW.map(([h, b]) => (
                <View key={h} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 10, height: 10, marginTop: 6, backgroundColor: t.yellow, borderWidth: 1.5, borderColor: t.ink }} />
                  <View style={{ flex: 1 }}>
                    <Txt v="h2">{h}</Txt>
                    <Txt v="small" style={{ marginTop: 3, color: t.ink2, fontSize: 15, lineHeight: 22 }}>{b}</Txt>
                  </View>
                </View>
              ))}
            </View>
          </View>
          {wide && (
            <Appear delay={180} duration={600} style={{ flex: 1, maxWidth: 460, marginTop: 8 }}>
              <SampleReceipt />
            </Appear>
          )}
        </View>
      )}

      <Rule style={{ marginTop: 40 }} />
      <View style={{ gap: 6 }}>
        <Txt v="small">Payments happen in your UPI app — Split & Settle never touches your money or bank details.</Txt>
        <Row gap={14} style={{ flexWrap: "wrap" }}>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(REPO)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Txt v="small" style={{ textDecorationLine: "underline" }}>Source code on GitHub</Txt>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL("https://aravind-portfolio-theta.vercel.app")} style={{ minHeight: 44, justifyContent: "center" }}>
            <Txt v="small" style={{ textDecorationLine: "underline" }}>Built by Aravind Srinivasan</Txt>
          </Pressable>
        </Row>
      </View>
    </Screen>
  );
}

function GroupCard({ g, i }: { g: GroupSummary; i: number }) {
  const t = useTheme();
  const b = g.myBalance;
  return (
    <Appear delay={i * 50} duration={350}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${g.name}${g.demo ? " (demo)" : ""}`} onPress={() => router.push(`/group?id=${g.id}`)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ backgroundColor: t.card, borderRadius: 4, borderWidth: 1.5, borderColor: hovered ? t.ink : t.line2, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 })}>
        <View style={{ width: 44, height: 44, borderRadius: 4, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}><Txt style={{ fontSize: 22 }}>{g.emoji}</Txt></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="h2" numberOfLines={1}>{g.name}</Txt>
          <Txt v="small">{g.demo ? "Demo · saved on this device" : `${g.people} ${g.people === 1 ? "person" : "people"}`}</Txt>
        </View>
        {!g.demo && (
          <View style={{ alignItems: "flex-end" }}>
            <Txt v="label" color={b > 0 ? t.green : b < 0 ? t.red : t.muted}>{b > 0 ? "you get" : b < 0 ? "you owe" : "settled"}</Txt>
            {b !== 0 && <Txt v="amount" color={b > 0 ? t.green : t.red}>{rupees(Math.abs(b))}</Txt>}
          </View>
        )}
      </Pressable>
    </Appear>
  );
}

/** The hero illustration is a real receipt: a small group, its lines, and the one payment that settles it. */
function SampleReceipt() {
  const t = useTheme();
  return (
    <Receipt torn>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt v="label">Goa trip · 4 people</Txt>
        <Txt v="label">3 nights</Txt>
      </Row>
      <Rule dashed style={{ marginVertical: 10 }} />
      <Leader left="Flights BLR → GOI" right="₹21,960" sub="Arjun paid · split 4 ways" />
      <Leader left="Villa, 3 nights" right="₹36,000" sub="Kavya paid · split 4 ways" />
      <Leader left="Dinner at Thalassa" right="₹6,840" sub="Priya paid · split 4 ways" />
      <Rule dashed style={{ marginVertical: 10 }} />
      <Leader left="Total" right="₹64,800" strong />
      <View style={{ marginTop: 14, backgroundColor: t.bg, borderRadius: 4, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Avatar name="Rohan" size={32} />
        <Txt style={{ flex: 1, fontFamily: font.medium }}>Rohan pays Kavya</Txt>
        <View style={{ backgroundColor: t.yellow, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 }}>
          <Txt style={{ fontFamily: font.black, color: t.onYellow }}>₹16,200 · UPI</Txt>
        </View>
      </View>
    </Receipt>
  );
}
