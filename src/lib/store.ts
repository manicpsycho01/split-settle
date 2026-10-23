import { DEMO_ID, demo } from "./demo";
import { remote } from "./remote";
import type { Store } from "./types";

/** The demo group lives on this device; every other group lives in Supabase. */
export const storeFor = (groupId: string): Store => (groupId === DEMO_ID ? demo : remote);
export { DEMO_ID };
