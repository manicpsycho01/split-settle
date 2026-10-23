import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useMounted } from "@/hooks/use-mounted";

/** Wide enough for two columns (after mount, so the pre-rendered HTML matches the first render). */
export function useWide(min = 1000) {
  const mounted = useMounted();
  const { width } = useWindowDimensions();
  return mounted && width >= min;
}

export const WIDE_MAX = 1180;

/** Two columns side by side on wide screens; stacked on phones and tablets. */
export function Columns({ wide, left, right, leftWidth = 420, gap = 40 }: { wide: boolean; left: ReactNode; right: ReactNode; leftWidth?: number; gap?: number }) {
  if (!wide) return <View style={{ gap: 18 }}>{left}{right}</View>;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap }}>
      <View style={{ width: leftWidth, flexShrink: 0, gap: 14 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 14 }}>{right}</View>
    </View>
  );
}
