# Fix: published updates invisible until users clear browsing data

## Root cause

`public/sw.js` intercepts **every GET request** with a cache-first strategy:

```js
caches.match(event.request).then((cached) => cached || fetch(event.request))
```

Once a response is cached it is served from cache forever and the network is never consulted. On publish, the browser keeps serving the stale cached JS/CSS/HTML, so new changes are invisible until the user clears site data. It also incorrectly caches Supabase API GET responses, causing stale data.

## Fix — rewrite the fetch handler in `public/sw.js`

Keep the push/notification/message handlers exactly as they are (push notifications depend on them). Replace only the `fetch` listener and the cache version.

1. **Bump `CACHE_NAME`** from `nomadnest-v1` to `nomadnest-v2`. In `activate`, delete **all** caches that are not the current one (already does this via the `!== CACHE_NAME` filter — the bump is what makes it actually clear the old v1 cache on next load).

2. **App-shell precache** stays minimal (`/`, `/index.html`, manifest, icons).

3. **New fetch strategy by request type:**
   - **Navigation requests** (`request.mode === 'navigate'`): network-first. Fetch from network, cache the response, fall back to cached `/index.html` if offline. This ensures the latest HTML (which references Vite's new content-hashed bundles) is always served.
   - **Same-origin static assets** (URL starts with `/assets/`): cache-first, then network, and revalidate in the background. These filenames are content-hashed by Vite, so a cached copy is always the correct version for that filename.
   - **Everything else** (Supabase API, Google Maps/Places, cross-origin, non-GET): bypass the cache completely — just `fetch(event.request)`. No stale API data.

## Why this is safe
- Vite content-hashes JS/CSS bundle filenames, so the new `index.html` references new filenames; old cached assets become harmless orphans the `activate` cleanup removes.
- The browser always re-fetches `/sw.js` itself (per the SW spec) to detect updates, so a published `sw.js` change is picked up and `skipWaiting()` + `clients.claim()` make it take over immediately.
- Push/notification handlers are untouched.

## Files changed
- `public/sw.js` — fetch handler rewrite + cache version bump. No other files modified.

## Verification
- After publish, hard-reload once. Subsequent reloads should show the latest version without clearing data.
- Check Supabase data (e.g. Browse Nomads) reflects live DB, not a cached snapshot.
