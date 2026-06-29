const CACHE_NAME = "nomadnest-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon-192.png"];

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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
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
