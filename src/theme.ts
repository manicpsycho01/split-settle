/**
 * Split & Settle's look: an Indian auto-rickshaw and the bill you split in it.
 * Black body, auto-yellow for the one thing to do on each screen, deep auto-green for money coming
 * back to you, red for money you owe; receipts on warm paper with dotted leaders and torn edges.
 * Archivo for words and big totals, Martian Mono for receipt lines.
 */
import { createContext, useContext } from "react";

export type Palette = {
  bg: string;
  card: string;
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  line2: string;
  yellow: string;
  onYellow: string;
  green: string;
  greenSoft: string;
  red: string;
  redSoft: string;
  black: string;
  onBlack: string;
  scrim: string;
};

export const light: Palette = {
  bg: "#ECE9E1",
  card: "#FFFDF7",
  ink: "#141412",
  ink2: "#3A3833",
  muted: "#6B675E",
  line: "rgba(20,20,18,0.16)",
  line2: "rgba(20,20,18,0.07)",
  yellow: "#FFC81E",
  onYellow: "#141412",
  green: "#17663F",
  greenSoft: "#DCEBDF",
  red: "#B92B27",
  redSoft: "#F6DEDB",
  black: "#141412",
  onBlack: "#FFFDF7",
  scrim: "rgba(20,20,18,0.45)",
};

export const dark: Palette = {
  bg: "#0E0E0D",
  card: "#1A1A17",
  ink: "#F3F0E7",
  ink2: "#D3CFC3",
  muted: "#9C978B",
  line: "rgba(243,240,231,0.16)",
  line2: "rgba(243,240,231,0.07)",
  yellow: "#FFD02E",
  onYellow: "#141412",
  green: "#63C68E",
  greenSoft: "#16281D",
  red: "#FF7A70",
  redSoft: "#341716",
  black: "#F3F0E7",
  onBlack: "#141412",
  scrim: "rgba(0,0,0,0.6)",
};

export const font = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  black: "Archivo_800ExtraBold",
  mono: "MartianMono_400Regular",
  monoBold: "MartianMono_600SemiBold",
};

export const radius = 4;
export const maxWidth = 600;

export const ThemeContext = createContext<Palette>(light);
export const useTheme = () => useContext(ThemeContext);
