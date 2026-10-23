import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, useFonts } from "@expo-google-fonts/archivo";
import { MartianMono_400Regular, MartianMono_600SemiBold } from "@expo-google-fonts/martian-mono";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastHost } from "@/components/ui";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { dark, light, ThemeContext } from "@/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = scheme === "dark" ? dark : light;
  const [loaded, error] = useFonts({ Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, MartianMono_400Regular, MartianMono_600SemiBold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);

  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={t}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: "slide_from_right" }}>
          <Stack.Screen name="expense" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack>
        <ToastHost />
      </ThemeContext.Provider>
    </SafeAreaProvider>
  );
}
