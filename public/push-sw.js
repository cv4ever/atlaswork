// Push notifications for what a routine posted while the app was closed (agents-design D55), loaded into the
// generated service worker by vite.config.ts (workbox importScripts). The routines function sends {title, body, url, tag}.
// Nothing shows while Atlaswork is on screen: the post is already in front of you. Tapping it, or its one action,
// Open, opens that chat: in a window already open when there is one.
self.addEventListener("push", (event) => {
  let note = {};
  try { note = event.data ? event.data.json() : {}; } catch { /* a body that isn't ours: show the plain fallback */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((client) => client.visibilityState === "visible")) return;
    await self.registration.showNotification(note.title || "Atlaswork", {
      body: note.body || "Something for you in the chat.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: note.tag,
      data: { url: note.url || "/" },
      actions: [{ action: "open", title: "Open" }],
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.navigate(url);
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
