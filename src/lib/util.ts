import * as Clipboard from "expo-clipboard";
import { Linking, Platform } from "react-native";
import { rupees } from "./money";
import type { ActivityRow, GroupData } from "./types";

export const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://split-settle.vercel.app";
export const origin = () => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : SITE);
export const inviteUrl = (token: string) => `${origin()}/join?t=${token}`;

export async function copy(text: string) { await Clipboard.setStringAsync(text); }
export function whatsapp(text: string) { void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`); }
/** Native share sheet where there is one (phones, some browsers); otherwise copy. Returns what happened. */
export async function share(text: string, url?: string): Promise<"shared" | "copied"> {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && "share" in navigator && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    try { await navigator.share({ text, url }); return "shared"; } catch { /* cancelled */ }
  }
  await copy(url ? `${text} ${url}` : text);
  return "copied";
}
export const isPhoneWeb = () => Platform.OS !== "web" || (typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent));

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const yesterday = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function dayLabel(iso: string) {
  if (iso === today()) return "Today";
  if (iso === yesterday()) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m! - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}
export function ago(ts: string) {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(ts)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return dayLabel(ts.slice(0, 10));
}

/** Guesses a category from the description, for the little receipt tag. */
export function category(desc: string) {
  const d = desc.toLowerCase();
  if (/dinner|lunch|breakfast|food|thali|cafe|coffee|chai|pizza|biryani|zomato|swiggy|restaurant|snack|drinks?/.test(d)) return "food";
  if (/flight|train|bus|irctc|travel|ticket/.test(d)) return "travel";
  if (/cab|taxi|uber|ola|auto|rapido|petrol|fuel|scooter|bike|metro|parking|toll/.test(d)) return "transport";
  if (/villa|hotel|stay|airbnb|hostel|room|rent/.test(d)) return "stay";
  if (/grocer|vegetable|milk|blinkit|zepto|instamart|bigbasket|water/.test(d)) return "groceries";
  if (/movie|club|party|game|concert|ticket|parasail|tour|entry/.test(d)) return "fun";
  if (/electric|wifi|internet|bill|gas|maid|cook|recharge/.test(d)) return "bills";
  return "other";
}

/** One line of the activity feed, in plain words. */
export function describe(a: ActivityRow, g: GroupData) {
  const who = a.actor ? (a.actor === g.me ? "You" : g.members.find((m) => m.id === a.actor)?.name ?? "Someone") : "Someone";
  const name = (id: unknown) => g.members.find((m) => m.id === id)?.name ?? "someone";
  const af = a.after ?? {}, bf = a.before ?? {};
  const desc = (af.description ?? bf.description ?? "an expense") as string;
  switch (a.kind) {
    case "group.created": return `${who} created the group`;
    case "group.imported": return `${who} imported this group from Splitwise (${af.rows ?? "?"} rows)`;
    case "member.added": return `${who} added ${af.name ?? "someone"}`;
    case "member.joined": return `${who} joined`;
    case "member.unlinked": return `${who} unlinked ${name(a.subject)} (they'll need a new invite link)`;
    case "expenses.added": return `${who} added “${desc}” · ${rupees(Number(af.amount ?? 0))}`;
    case "expenses.edited": {
      const changed = bf.amount !== undefined && af.amount !== bf.amount ? ` · ${rupees(Number(bf.amount))} → ${rupees(Number(af.amount))}` : "";
      return `${who} edited “${desc}”${changed}`;
    }
    case "expenses.deleted": return `${who} deleted “${desc}”`;
    case "expenses.restored": return `${who} restored “${desc}”`;
    case "settlements.added": return `${who} recorded ${name(af.from_member)} → ${name(af.to_member)} · ${rupees(Number(af.amount ?? 0))}`;
    case "settlements.deleted": return `${who} undid a payment`;
    case "settlements.restored": return `${who} restored a payment`;
    default: return `${who} made a change`;
  }
}

const NAME_KEY = "split-settle:name";
export const rememberedName = () => { try { return Platform.OS === "web" && typeof window !== "undefined" ? window.localStorage.getItem(NAME_KEY) ?? "" : ""; } catch { return ""; } };
export const rememberName = (n: string) => { try { if (Platform.OS === "web") window.localStorage.setItem(NAME_KEY, n.trim()); } catch { /* ignore */ } };
