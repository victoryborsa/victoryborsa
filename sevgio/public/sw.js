// Sevgio alerts: shows a notification when the site pushes one (double bookings), and opens the page it points to when tapped.
self.addEventListener("push", event => {
  let m = { title: "Sevgio", body: "", url: "/host/conflicts", tag: "sevgio" };
  try { m = { ...m, ...event.data.json() }; } catch { if (event.data) m.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(m.title, {
    body: m.body, tag: m.tag, renotify: true, requireInteraction: true, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: m.url },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/host/conflicts", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (w.url === url && "focus" in w) return w.focus();
    return self.clients.openWindow(url);
  })());
});
