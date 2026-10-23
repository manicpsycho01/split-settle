import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { font, useTheme } from "@/theme";
import { Row, Tap, Txt } from "./ui";

/** The mark: a receipt torn diagonally — one bill, two halves. */
export function Mark({ size = 30 }: { size?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <Rect x="0" y="0" width="32" height="32" rx="4" fill={t.yellow} />
      <Path d="M8 6h9l-4 10 4 10H8z" fill="#141412" />
      <Path d="M19 6h5v20h-5l4-10z" fill="#141412" opacity={0.55} />
    </Svg>
  );
}

export function Logo() {
  const t = useTheme();
  return (
    <Row gap={9}>
      <Mark />
      <Text style={{ fontFamily: font.black, fontSize: 19, letterSpacing: -0.5, color: t.ink }}>Split <Text style={{ color: t.muted }}>&</Text> Settle</Text>
    </Row>
  );
}

/** Top bar: back on the left, a title, actions on the right. */
export function TopBar({ title, back = true, right, onBack }: { title?: ReactNode; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  const t = useTheme();
  return (
    <Row style={{ minHeight: 52, justifyContent: "space-between", marginBottom: 6 }}>
      <Row gap={4} style={{ flexShrink: 1 }}>
        {back && (
          <Tap label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -10 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 22, color: t.ink }}>←</Text>
          </Tap>
        )}
        {typeof title === "string" ? <Txt v="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Txt> : title}
      </Row>
      <Row gap={6}>{right}</Row>
    </Row>
  );
}

export function IconButton({ label, glyph, onPress, testID }: { label: string; glyph: string; onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ hovered }: { pressed: boolean; hovered?: boolean }) => ({ minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1.5, borderColor: hovered ? t.ink : t.line, alignItems: "center", justifyContent: "center" })}>
      <View><Text style={{ fontFamily: font.bold, fontSize: 14, color: t.ink }}>{glyph}</Text></View>
    </Pressable>
  );
}
