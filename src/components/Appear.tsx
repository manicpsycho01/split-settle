import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";

/**
 * Rises into place on mount.
 * Web: a CSS keyframe (see +html.tsx) that `prefers-reduced-motion` switches off — the pre-rendered HTML
 * must never carry a hidden starting state, or users with reduced motion would see nothing.
 * Phones: Reanimated, which honours the system setting.
 */
export function Appear({ children, delay = 0, duration = 450, style, layout }: { children: ReactNode; delay?: number; duration?: number; style?: StyleProp<ViewStyle>; layout?: boolean }) {
  if (Platform.OS === "web") {
    return (
      <View {...({ dataSet: { rise: "1" } } as object)} style={[style, { animationDelay: `${delay}ms`, animationDuration: `${duration}ms` } as ViewStyle]}>
        {children}
      </View>
    );
  }
  return <Animated.View entering={FadeInDown.delay(delay).duration(duration)} layout={layout ? LinearTransition : undefined} style={style}>{children}</Animated.View>;
}
