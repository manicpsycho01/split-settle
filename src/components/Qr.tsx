import QRCode from "qrcode-svg";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

/** A scannable QR code (black on white regardless of theme, so phone cameras read it). */
export function Qr({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const svg = new QRCode({ content: value, padding: 2, width: size, height: size, color: "#000000", background: "#ffffff", ecl: "M", join: true }).svg();
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, backgroundColor: "#fff", borderRadius: 4, overflow: "hidden" }}>
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  );
}
