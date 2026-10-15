/**
 * Is NomadNest running inside a store app (App Store / Google Play wrapper)?
 * Store rules: no link to buy a membership outside the store, only a neutral
 * message. The wrapper says so in one of these ways:
 *   - Capacitor (window.Capacitor.isNativePlatform()),
 *   - a Trusted Web Activity (document.referrer "android-app://…"),
 *   - a user agent containing "NomadNestApp",
 *   - opening the app once with ?app=store (remembered for the session).
 * The App Store's US exception (external purchase links allowed) isn't used:
 * the app can't tell the storefront country, so store apps stay neutral.
 */
const KEY = "nn_store_app";

export const detectStoreApp = (env: {
  capacitorNative?: boolean;
  referrer?: string;
  userAgent?: string;
  search?: string;
  remembered?: boolean;
}) =>
  !!env.capacitorNative ||
  (env.referrer ?? "").startsWith("android-app://") ||
  /NomadNestApp/i.test(env.userAgent ?? "") ||
  new URLSearchParams(env.search ?? "").get("app") === "store" ||
  !!env.remembered;

export const isStoreApp = (): boolean => {
  if (typeof window === "undefined") return false;
  let remembered = false;
  try {
    remembered = sessionStorage.getItem(KEY) === "1";
  } catch {
    /* storage blocked */
  }
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const yes = detectStoreApp({
    capacitorNative: !!cap?.isNativePlatform?.(),
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    search: window.location.search,
    remembered,
  });
  if (yes && !remembered) {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* storage blocked */
    }
  }
  return yes;
};
