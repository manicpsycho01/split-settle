import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { font, maxWidth, radius, useTheme } from "@/theme";

// ---------- text ----------
type Variant = "display" | "title" | "h2" | "body" | "small" | "label" | "mono" | "amount";
export function Txt({ v = "body", style, children, color, numberOfLines, selectable, accessibilityRole, testID }: {
  v?: Variant; style?: StyleProp<TextStyle>; children: ReactNode; color?: string; numberOfLines?: number; selectable?: boolean; accessibilityRole?: "header"; testID?: string;
}) {
  const t = useTheme();
  const base: Record<Variant, TextStyle> = {
    display: { fontFamily: font.black, fontSize: 44, lineHeight: 44, letterSpacing: -1.6 },
    title: { fontFamily: font.black, fontSize: 30, lineHeight: 32, letterSpacing: -0.9 },
    h2: { fontFamily: font.bold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
    body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
    small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
    label: { fontFamily: font.mono, fontSize: 11.5, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" },
    mono: { fontFamily: font.mono, fontSize: 14, lineHeight: 20 },
    amount: { fontFamily: font.black, fontSize: 18, lineHeight: 22, fontVariant: ["tabular-nums"] },
  };
  return (
    <Text
      testID={testID}
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[base[v], { color: color ?? (v === "label" || v === "small" ? t.muted : t.ink) }, style]}
    >
      {children}
    </Text>
  );
}

// ---------- layout ----------
export function Screen({ children, scroll = true, footer, width }: { children: ReactNode; scroll?: boolean; footer?: ReactNode; width?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inner = <View style={[s.column, width ? { maxWidth: width } : null, { paddingTop: insets.top + 8, paddingBottom: footer ? 120 : insets.bottom + 40 }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
      {footer && (
        <View testID="floating" pointerEvents="box-none" style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View pointerEvents="box-none" style={s.footerInner}>{footer}</View>
        </View>
      )}
    </View>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

// ---------- buttons ----------
type Kind = "primary" | "dark" | "ghost" | "danger";
export function Button({ title, onPress, kind = "primary", disabled, busy, icon, style, accessibilityLabel, testID, small }: {
  title: string; onPress?: () => void; kind?: Kind; disabled?: boolean; busy?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; testID?: string; small?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.yellow, dark: t.black, ghost: "transparent", danger: "transparent" }[kind];
  const fg = { primary: t.onYellow, dark: t.onBlack, ghost: t.ink, danger: t.red }[kind];
  const border = { primary: t.yellow, dark: t.black, ghost: t.line, danger: t.red }[kind];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : 1, transform: [{ translateY: pressed ? 1 : 0 }] },
        hovered && !disabled && (kind === "ghost" ? { borderColor: t.ink } : { opacity: 0.92 }),
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <Row gap={8}>
          {icon}
          <Text style={{ fontFamily: font.bold, fontSize: small ? 15 : 16, color: fg }}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function Tap({ children, onPress, label, style, testID, role = "button" }: { children: ReactNode; onPress: () => void; label: string; style?: PressableProps["style"]; testID?: string; role?: "button" | "link" | "tab" }) {
  return <Pressable testID={testID} accessibilityRole={role} accessibilityLabel={label} onPress={onPress} style={style}>{children}</Pressable>;
}

// ---------- inputs ----------
export function Field({ label, error, hint, style, inputStyle, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      <Txt v="label">{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        {...rest}
        style={[s.input, { color: t.ink, backgroundColor: t.card, borderColor: error ? t.red : focus ? t.ink : t.line }, Platform.OS === "web" && ({ outlineStyle: "none" } as object), inputStyle]}
      />
      {error ? <Txt v="small" color={t.red}>{error}</Txt> : hint ? <Txt v="small">{hint}</Txt> : null}
    </View>
  );
}

// ---------- receipt pieces ----------
/** Paper card; `torn` adds a zigzag bottom edge like a tear-off receipt. */
export function Receipt({ children, style, torn, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; torn?: boolean; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[{ marginBottom: torn ? 8 : 0 }, style]}>
      <View style={[s.receipt, { backgroundColor: t.card, borderColor: t.line2 }]}>{children}</View>
      {torn && <Zigzag color={t.card} />}
    </View>
  );
}
function Zigzag({ color }: { color: string }) {
  const [w, setW] = useState(0);
  const tooth = 12;
  const n = Math.ceil(w / tooth);
  let d = `M0 0 `;
  for (let i = 0; i < n; i++) d += `L${i * tooth + tooth / 2} 7 L${(i + 1) * tooth} 0 `;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 7, marginTop: -0.5 }} aria-hidden>
      {w > 0 && <Svg width={w} height={7}><Path d={d + `Z`} fill={color} /></Svg>}
    </View>
  );
}

/** "Label ........ ₹1,200" — a receipt line with a dotted leader. */
export function Leader({ left, right, rightColor, strong, sub }: { left: ReactNode; right: ReactNode; rightColor?: string; strong?: boolean; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <View style={{ flexShrink: 1 }}>{typeof left === "string" ? <Txt v={strong ? "h2" : "body"} numberOfLines={1}>{left}</Txt> : left}</View>
        <View style={{ flex: 1, minWidth: 16, borderBottomWidth: 1.5, borderStyle: "dotted", borderColor: t.line, marginBottom: 5 }} />
        <Text style={{ fontFamily: strong ? font.black : font.mono, fontSize: strong ? 18 : 14.5, color: rightColor ?? t.ink, fontVariant: ["tabular-nums"] }}>{right}</Text>
      </View>
      {sub ? <Txt v="small" style={{ marginTop: 2 }}>{sub}</Txt> : null}
    </View>
  );
}

export function Rule({ dashed, style }: { dashed?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ borderBottomWidth: 1, borderStyle: dashed ? "dashed" : "solid", borderColor: t.line, marginVertical: 12 }, style]} />;
}

// ---------- avatar ----------
const TILES = ["yellow", "green", "black", "red"] as const;
export function Avatar({ name, size = 36, dim }: { name: string; size?: number; dim?: boolean }) {
  const t = useTheme();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const k = TILES[h % TILES.length]!;
  const bg = { yellow: t.yellow, green: t.green, black: t.black, red: t.red }[k];
  const fg = { yellow: t.onYellow, green: t.onBlack === "#141412" ? "#141412" : "#FFFDF7", black: t.onBlack, red: "#FFFDF7" }[k];
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View aria-hidden style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: "center", justifyContent: "center", opacity: dim ? 0.45 : 1 }}>
      <Text style={{ fontFamily: font.black, fontSize: size * 0.4, color: fg }}>{initials || "?"}</Text>
    </View>
  );
}

// ---------- segmented tabs ----------
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={[s.tabs, { borderColor: t.line }]}>
      {items.map((i) => {
        const on = i.id === value;
        return (
          <Pressable key={i.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={i.label} onPress={() => onChange(i.id)}
            style={[s.tab, on && { backgroundColor: t.black }]}>
            <Text numberOfLines={1} style={{ fontFamily: on ? font.bold : font.medium, fontSize: 14.5, color: on ? t.onBlack : t.ink2 }}>{i.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- sheet ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]} />
      <View pointerEvents="box-none" style={s.sheetWrap}>
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(220)} accessibilityRole={"dialog" as never} aria-modal accessibilityLabel={title}
          style={[s.sheet, { backgroundColor: t.card, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <Txt v="h2" accessibilityRole="header">{title}</Txt>
            <Tap label="Close" onPress={onClose} style={s.close}><Txt v="h2">✕</Txt></Tap>
          </Row>
          <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------- toast ----------
let pushToast: ((m: string) => void) | null = null;
export const toast = (m: string) => pushToast?.(m);
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    pushToast = (m) => { setMsg(m); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 3200); };
    return () => { pushToast = null; };
  }, []);
  if (!msg) return null;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn} exiting={reduced ? undefined : FadeOut} pointerEvents="none" style={[s.toastWrap, { bottom: Math.max(insets.bottom, 16) + 84 }]}>
      <View accessibilityLiveRegion="polite" aria-live="polite" testID="toast" style={[s.toast, { backgroundColor: t.black }]}>
        <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: t.onBlack }}>{msg}</Text>
      </View>
    </Animated.View>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[s.empty, { borderColor: t.line }]}>
      <Txt v="h2" style={{ textAlign: "center" }}>{title}</Txt>
      {body && <Txt v="small" style={{ textAlign: "center", marginTop: 4 }}>{body}</Txt>}
      {children && <View style={{ marginTop: 14 }}>{children}</View>}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg, padding: 40 }}><ActivityIndicator color={t.ink} /></View>;
}

const s = StyleSheet.create({
  column: { width: "100%", maxWidth, alignSelf: "center", paddingHorizontal: 16, flexGrow: 1 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  footerInner: { width: "100%", maxWidth: maxWidth - 32, alignSelf: "center" },
  btn: { minHeight: 50, paddingHorizontal: 18, borderRadius: radius, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  btnSmall: { minHeight: 44, paddingHorizontal: 14 },
  input: { minHeight: 50, borderWidth: 1.5, borderRadius: radius, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 16 },
  receipt: { borderRadius: radius, borderWidth: 1, padding: 16 },
  tabs: { flexDirection: "row", borderWidth: 1.5, borderRadius: radius, padding: 3, gap: 3 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 2, paddingHorizontal: 6 },
  sheetWrap: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  sheet: { width: "100%", maxWidth, borderTopLeftRadius: 10, borderTopRightRadius: 10, padding: 18 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  toastWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  toast: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius, maxWidth: 520 },
  empty: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius, padding: 24, alignItems: "center" },
});
