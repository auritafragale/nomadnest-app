/**
 * Signed links for perk logos (Batch P2b). The perk-logos bucket is private,
 * so each logo is shown through a signed link valid for an hour. Links are
 * kept in memory and signed again shortly before they expire. Every logo
 * asked for in the same moment (one screen rendering its perks) is signed in
 * one batch, not one request per logo.
 */

export const LOGO_LINK_SECONDS = 3600;
/** Sign again this long before a link expires. */
const MARGIN_MS = 5 * 60 * 1000;
/** A file that couldn't be signed (missing, or the request failed) is retried after this. */
const MISS_MS = 5 * 60 * 1000;

export type LogoLink = { url: string | null; expiresAt: number };
export type SignBatch = (paths: string[]) => Promise<Record<string, string | null>>;

export const createLogoLinkLoader = (sign: SignBatch, now: () => number = Date.now) => {
  const cache = new Map<string, LogoLink>();
  let queue = new Map<string, ((link: LogoLink) => void)[]>();
  // Files already being signed: a logo that mounts a moment later waits for the same answer.
  const inflight = new Map<string, Promise<LogoLink>>();
  let scheduled = false;

  const fresh = (path: string) => {
    const hit = cache.get(path);
    return hit && hit.expiresAt - (hit.url ? MARGIN_MS : 0) > now() ? hit : undefined;
  };

  const flush = async () => {
    scheduled = false;
    const batch = queue;
    queue = new Map();
    const paths = [...batch.keys()];
    let urls: Record<string, string | null> = {};
    try {
      urls = await sign(paths);
    } catch {
      urls = {};
    }
    const at = now();
    for (const path of paths) {
      const url = urls[path] ?? null;
      const link = { url, expiresAt: at + (url ? LOGO_LINK_SECONDS * 1000 : MISS_MS) };
      cache.set(path, link);
      for (const resolve of batch.get(path) ?? []) resolve(link);
    }
  };

  return {
    /** A link still good to show, without asking the server. */
    peek: (path: string) => fresh(path),
    /** A link for this file; waits for the next batch when it isn't cached. */
    get: (path: string): Promise<LogoLink> => {
      const hit = fresh(path);
      if (hit) return Promise.resolve(hit);
      const waiting = inflight.get(path);
      if (waiting) return waiting;
      const promise = new Promise<LogoLink>((resolve) => {
        queue.set(path, [...(queue.get(path) ?? []), resolve]);
        if (!scheduled) {
          scheduled = true;
          setTimeout(() => void flush(), 0);
        }
      }).finally(() => inflight.delete(path));
      inflight.set(path, promise);
      return promise;
    },
    /** The image failed to load (for example an expired link): sign it again next time. */
    forget: (path: string) => {
      cache.delete(path);
    },
    /** When to sign again, in ms from now. */
    refreshIn: (link: LogoLink) => Math.max(1000, link.expiresAt - (link.url ? MARGIN_MS : 0) - now()),
  };
};
