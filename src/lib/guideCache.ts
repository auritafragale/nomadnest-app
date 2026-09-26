/**
 * Offline copy of a sitter's Welcome Guide.
 *
 * Rules (same as the database's access window):
 * - Stored only as returned by get_sitter_guide, which includes arrival details
 *   (section d) only while they're unlocked, and private pet fields only until
 *   the sit ends.
 * - Every entry expires at the end of the sit's end date (ends_at) and is
 *   deleted on read after that, and on every app start.
 * - An online "no access" answer (e.g. the sit was cancelled) deletes it.
 * - Old-format guide caches (which could hold Wi-Fi) are always deleted.
 */

const PREFIX = "nn_sitter_guide_";
const OLD_PREFIXES = ["nn_welcome_guide_"]; // v1 (per owner) and v2 (per listing)

interface CacheEntry<T> {
  expiresAt: string;
  savedAt: string;
  data: T;
}

const safeStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readGuideCache = <T>(listingId: string): { data: T; savedAt: string } | null => {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + listingId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry?.expiresAt || new Date(entry.expiresAt).getTime() <= Date.now()) {
      store.removeItem(PREFIX + listingId);
      return null;
    }
    return { data: entry.data, savedAt: entry.savedAt };
  } catch {
    store.removeItem(PREFIX + listingId);
    return null;
  }
};

export const writeGuideCache = <T>(listingId: string, data: T, expiresAt: string) => {
  const store = safeStorage();
  if (!store) return;
  if (new Date(expiresAt).getTime() <= Date.now()) return;
  try {
    store.setItem(
      PREFIX + listingId,
      JSON.stringify({ expiresAt, savedAt: new Date().toISOString(), data } satisfies CacheEntry<T>),
    );
  } catch {
    /* storage full or blocked: online view still works */
  }
};

export const clearGuideCache = (listingId: string) => {
  safeStorage()?.removeItem(PREFIX + listingId);
};

/** Run on app start: drop expired sitter caches and every old-format guide cache. */
export const purgeGuideCaches = () => {
  const store = safeStorage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    if (OLD_PREFIXES.some((p) => key.startsWith(p))) {
      store.removeItem(key);
    } else if (key.startsWith(PREFIX)) {
      readGuideCache(key.slice(PREFIX.length)); // removes it if expired or unreadable
    }
  }
};

/** On sign-out: remove every guide copy, so a shared device keeps nothing. */
export const clearAllGuideCaches = () => {
  const store = safeStorage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && (key.startsWith(PREFIX) || OLD_PREFIXES.some((p) => key.startsWith(p)))) keys.push(key);
  }
  keys.forEach((k) => store.removeItem(k));
};
