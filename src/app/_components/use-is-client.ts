import { useSyncExternalStore } from "react";

// False during SSR and the first client render, true thereafter — for UI
// that depends on browser-only state (the resolved theme, localStorage).
// The same idiom as src/components/theme-toggle.tsx, without the
// setState-in-effect it replaces.
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
