import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { TopBar } from "@/components/Brand";
import { Columns, useWide } from "@/components/Columns";
import { Avatar, Button, Field, Leader, Receipt, Row, Rule, Screen, toast, Txt } from "@/components/ui";
import { rupees } from "@/lib/money";
import { importSplitwise } from "@/lib/remote";
import { parseSplitwise, type SwImport } from "@/lib/splitwise";
import { font, useTheme } from "@/theme";

/**
 * Brings a Splitwise group across from Splitwise's own "Export as spreadsheet" file — no Splitwise login,
 * no tokens stored. The preview checks the rebuilt balances against the export's "Total balance" row.
 */
export default function Import() {
  const t = useTheme();
  const [sw, setSw] = useState<SwImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const wide = useWide(900);

  const pick = async () => {
    setErr(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "*/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    try {
      const text = Platform.OS === "web" && a.file ? await a.file.text() : await (await fetch(a.uri)).text();
      const parsed = parseSplitwise(text);
      setSw(parsed); setFileName(a.name); setName(a.name.replace(/_\d{4}-\d{2}-\d{2}.*$/, "").replace(/[_-]+/g, " ").replace(/\.csv$/i, "").trim() || "Imported group");
    } catch (e) { setSw(null); setErr((e as Error).message); }
  };

  const go = async () => {
    if (!sw || me === null || !name.trim()) return;
    setBusy(true);
    try {
      const id = await importSplitwise(name.trim(), sw.people[me]!, sw.people, sw.rows);
      router.replace(`/group?id=${id}`);
    } catch (e) { toast((e as Error).message); setBusy(false); }
  };

  const importBtn = sw ? <Button title={`Import ${sw.rows.length} entries`} onPress={go} busy={busy} disabled={me === null || !name.trim() || sw.matchesTotals === false} testID="do-import" /> : null;

  return (
    <Screen width={wide ? 1080 : undefined} footer={sw && !wide ? importBtn : undefined}>
      <TopBar title="Import from Splitwise" />
      <Columns wide={wide} leftWidth={420} gap={48}
        left={<View>
      <Txt color={t.ink2}>Bring a Splitwise group across, with everyone's balance exactly as it is in Splitwise. Your Splitwise login is never needed.</Txt>

      <Receipt style={{ marginTop: 16 }}>
        <Txt v="label">In Splitwise (on the website)</Txt>
        <Rule dashed style={{ marginVertical: 8 }} />
        {["Open the group", "Tap the gear icon → “Export as spreadsheet”", "Choose the downloaded .csv file here"].map((s, i) => (
          <Row key={s} gap={10} style={{ paddingVertical: 5, alignItems: "flex-start" }}>
            <Txt style={{ fontFamily: font.monoBold, width: 18 }}>{i + 1}</Txt>
            <Txt style={{ flex: 1 }}>{s}</Txt>
          </Row>
        ))}
      </Receipt>

      <Button kind={sw ? "ghost" : "primary"} title={sw ? `Change file (${fileName})` : "Choose Splitwise export (.csv)"} onPress={pick} style={{ marginTop: 14 }} testID="pick" />
      {err && <Txt v="small" color={t.red} style={{ marginTop: 10 }}>{err}</Txt>}

        </View>}
        right={<View>
      {sw ? (
        <View style={{ marginTop: wide ? 0 : 22, gap: 16 }}>
          <Receipt torn>
            <Txt v="label">Preview</Txt>
            <Rule dashed style={{ marginVertical: 8 }} />
            <Leader left="Expenses" right={String(sw.rows.filter((r) => r.kind === "expense").length)} />
            <Leader left="Payments" right={String(sw.rows.filter((r) => r.kind === "payment").length)} />
            {sw.skipped > 0 && <Leader left="Rows skipped (blank or unreadable)" right={String(sw.skipped)} />}
            <Rule dashed style={{ marginVertical: 8 }} />
            {sw.people.map((p, i) => <Leader key={p} left={p} right={sw.balances[i] === 0 ? "settled" : `${sw.balances[i]! > 0 ? "gets" : "owes"} ${rupees(Math.abs(sw.balances[i]!))}`} rightColor={sw.balances[i]! > 0 ? t.green : sw.balances[i]! < 0 ? t.red : t.muted} />)}
            <View style={{ marginTop: 10, padding: 10, borderRadius: 4, backgroundColor: sw.matchesTotals === false ? t.redSoft : t.greenSoft }}>
              <Txt v="small" color={sw.matchesTotals === false ? t.red : t.green} testID="totals-check">
                {sw.matchesTotals === true ? "✓ Matches Splitwise's own “Total balance” row exactly." : sw.matchesTotals === false ? "These balances don't match the export's Total balance row — the file may be edited or incomplete." : "No Total balance row to check against, but every row adds up."}
              </Txt>
            </View>
            {sw.currency !== "INR" && <Txt v="small" style={{ marginTop: 8 }}>Amounts are in {sw.currency}; they'll show with a ₹ sign.</Txt>}
          </Receipt>

          <View style={{ gap: 8 }}>
            <Txt v="label">Which one is you?</Txt>
            {sw.people.map((p, i) => (
              <Pressable key={p} accessibilityRole="radio" accessibilityState={{ selected: me === i }} accessibilityLabel={p} onPress={() => setMe(i)}
                style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1.5, borderColor: me === i ? t.ink : t.line, backgroundColor: me === i ? t.yellow : t.card }}>
                <Avatar name={p} size={28} />
                <Txt style={{ flex: 1, fontFamily: font.semibold, color: me === i ? t.onYellow : t.ink }}>{p}</Txt>
              </Pressable>
            ))}
          </View>
          <Field label="Group name" value={name} onChangeText={setName} maxLength={60} />
          <Txt v="small">You'll be the admin. Everyone else gets a personal invite link to claim their name.</Txt>
          {wide && importBtn}
        </View>
      ) : wide ? (
        <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: t.line, borderRadius: 4, padding: 28, alignItems: "center" }}>
          <Txt v="h2" style={{ textAlign: "center" }}>The preview appears here</Txt>
          <Txt v="small" style={{ textAlign: "center", marginTop: 4 }}>Everyone's balance, checked against Splitwise's own totals before anything is saved.</Txt>
        </View>
      ) : null}
        </View>} />
    </Screen>
  );
}
