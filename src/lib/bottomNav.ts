import { useEffect, useSyncExternalStore } from "react";

/**
 * Pages with their own fixed bottom bar (the listing page's Apply bar, the
 * Message / Invite bar on profiles) hide the app's bottom navigation while
 * they show it, on phones only. A counter, so overlapping pages can't leave
 * it hidden.
 */
let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const useBottomNavHidden = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hiders > 0,
  );

/** Hide the bottom navigation while `active` (and this component is mounted). */
export const useHideBottomNav = (active: boolean) => {
  useEffect(() => {
    if (!active) return;
    hiders += 1;
    emit();
    return () => {
      hiders -= 1;
      emit();
    };
  }, [active]);
};
