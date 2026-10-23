import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

const make = () => createClient(url, key, { db: { schema: "split" } });
type Client = ReturnType<typeof make>;
let client: Client | null = null;

/** One client per app. Guest sessions persist on the device (localStorage on web, AsyncStorage on phones). */
export function db(): Client {
  if (client) return client;
  const isServer = Platform.OS === "web" && typeof window === "undefined";
  client = createClient(url, key, {
    db: { schema: "split" },
    auth: {
      storage: isServer ? undefined : Platform.OS === "web" ? window.localStorage : AsyncStorage,
      persistSession: !isServer,
      autoRefreshToken: !isServer,
      detectSessionInUrl: false,
    },
  });
  return client!;
}

/** Signs in as a guest the first time it's needed. */
export async function ensureSession(): Promise<string> {
  const c = db();
  const { data } = await c.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: d, error } = await c.auth.signInAnonymously();
  if (error || !d.user) throw new Error(error?.message ?? "Couldn't start a session");
  return d.user.id;
}

export async function currentUser(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.id ?? null;
}
