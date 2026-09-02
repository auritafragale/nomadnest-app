const CACHE_NAME = "nomadnest-v2";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//  - Navigations (HTML): network-first so the latest index.html (referencing
//    Vite's content-hashed bundles) is always served; fall back to cache when
//    offline. This is what fixes "must clear browsing data to see updates".
//  - Same-origin hashed static assets (/assets/*): cache-first, revalidate in
//    the background. Filenames change on content change, so a cached copy is
//    always the correct version for that filename.
//  - Everything else (API/Supabase, Google Maps, cross-origin, non-GET):
//    bypass the cache entirely and go straight to the network.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigation requests — network-first.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              caches.match("/index.html").then(
                (fallback) => fallback || Response.error()
              )
          )
        )
    );
    return;
  }

  // Only cache same-origin static assets under /assets/ (content-hashed by Vite).
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // All other requests (API, cross-origin, etc.) bypass the cache.
});

// App signals that the user has read messages — dismiss all notifications
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_NOTIFICATIONS") {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => notification.close());
    });
  }
});

// Push notification received
self.addEventListener("push", (event) => {
  let data = { title: "NomadNest", body: "You have a new notification" };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/",
      ...data.data,
    },
    actions: data.actions || [],
    tag: data.tag || "nomadnest",
    renotify: true,
  };

  event.waitUntil(
    Promise.resolve(self.registration.showNotification(data.title, options))
      .then(() => {
        if ('setAppBadge' in self.navigator) {
          // Use unreadCount from payload when available — notifications.length is always 1
          // because all messages share the same tag and replace each other in the tray.
          const badgeCount = typeof data.unreadCount === 'number' ? data.unreadCount : 1;
          return self.navigator.setAppBadge(badgeCount);
        }
      })
  );
});

// Notification clicked
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Clear badge once all notifications are dismissed
        self.registration.getNotifications().then((remaining) => {
          if (remaining.length === 0 && "clearAppBadge" in self.navigator) {
            self.navigator.clearAppBadge();
          }
        });

        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
