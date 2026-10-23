import { router } from "expo-router";
import { useEffect } from "react";
import { Loading } from "@/components/ui";
import { DEMO_ID, startDemo } from "@/lib/demo";

/** Opens the demo group (creating it on this device the first time). */
export default function Demo() {
  useEffect(() => { void startDemo().then(() => router.replace(`/group?id=${DEMO_ID}`)); }, []);
  return <Loading />;
}
