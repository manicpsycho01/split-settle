import { useEffect, useState } from "react";

/** False during static rendering and the first client render, so both match; true after mount. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
