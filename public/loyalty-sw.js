// The service worker behind a loyalty card saved to a phone's home screen (/lc/<token>/).
// Its one job is notifications: it shows what Madar sends (new points, a message from the
// business) and opens the card when the notification is tapped. It caches nothing.

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  // A phone expects every push to show something, so there is always a title.
  event.waitUntil(
    self.registration.showNotification(data.title || "بطاقة الولاء", {
      body: data.body || "",
      dir: "rtl",
      lang: "ar",
      data: { url: data.url || self.registration.scope },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of open) {
        if (client.url.startsWith(url) && "focus" in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })()
  )
})
