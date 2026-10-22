// Madar POS offline-mode service worker.
//
// Deliberately NOT a generated Workbox/next-pwa precache manifest -- this project builds with
// Turbopack (see next.config.ts), and those tools are webpack-only. This file is instead a plain,
// hand-written static asset in public/, runtime-caching two things only:
//   1. /pos navigation requests (network-first, falls back to the last cached copy offline), and
//   2. /_next/static/* assets (content-hashed, so cache-first is always safe).
// It never touches any /v1/... API traffic -- the workspace id and auth token both travel as
// headers (see http-data-client.ts), and the Cache API's default matching ignores headers, so
// caching an API response by URL alone would risk serving one workspace's data to another on a
// shared kiosk device. All tenant-scoped data (products, settings, the invoice queue) is cached
// from the main thread into IndexedDB instead -- see features/pos/offline/.
//
// Plain ES5-ish JS, no imports: a service worker registered as a classic script (not { type:
// "module" }) can't import the app's TypeScript modules, and importing a module from a CDN here
// would defeat the entire point of working with no network. The background-sync flush below
// duplicates offline-invoice-queue.ts's own (small) flush logic for the same reason -- a
// deliberate, documented tradeoff, not an oversight.

const SHELL_CACHE = "madar-pos-shell-v1"
const POS_URL = "/pos/"
const DB_NAME = "madar-pos-offline"
const DB_VERSION = 1

// Shown only if a navigation fails offline AND nothing was ever cached for it -- a constructed
// Response, never left as `undefined` (a service worker's fetch handler resolving respondWith to
// undefined is what produces the browser's own opaque ERR_FAILED page instead of this).
const OFFLINE_FALLBACK_HTML =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>Madar POS</title></head>" +
  '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
  'font-family:system-ui,sans-serif;background:#0b1738;color:#fff;text-align:center;padding:24px">' +
  "<div><h1>Open this page once while online</h1>" +
  "<p>Then it keeps working with no connection.</p></div></body></html>"

// A service worker can never intercept the very navigation that caused it to register (that
// request already completed before this worker existed), so without this, "visit /pos once, then
// go offline and reload" would hit an empty cache -- confirmed live: Chrome showed ERR_FAILED, not
// the offline fallback above, because the old fallback chain could resolve to undefined. Runs
// once, at install time, while the browser still has the network access that made registering
// this worker possible in the first place.
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE)
  const response = await fetch(POS_URL, { credentials: "same-origin" })
  if (!response.ok) return
  await cache.put(POS_URL, response.clone())

  const html = await response.text()
  // Every same-origin /_next/static/... reference the document itself names directly -- covers
  // first paint + hydration, the common case; a chunk only reachable by later client-side
  // navigation within the page still depends on an earlier organic visit, same as before.
  const assetUrls = new Set()
  const pattern = /["'](\/_next\/static\/[^"']+)["']/g
  let match
  while ((match = pattern.exec(html))) {
    assetUrls.add(match[1])
  }

  await Promise.all(
    Array.from(assetUrls).map(async (assetUrl) => {
      try {
        const assetResponse = await fetch(assetUrl)
        if (assetResponse.ok) await cache.put(assetUrl, assetResponse)
      } catch {
        // Best-effort -- a missed chunk just means that one piece won't work fully offline yet;
        // the shell itself still loads, and a later online visit fills it in via the normal
        // runtime-caching paths below.
      }
    })
  )
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell())
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

async function handleNavigate(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(SHELL_CACHE)
    cache.put(request, response.clone())
    return response
  } catch {
    const cache = await caches.open(SHELL_CACHE)
    const cached = (await cache.match(request)) || (await cache.match(POS_URL))
    if (cached) return cached
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  if (request.mode === "navigate" && url.pathname.includes("/pos")) {
    event.respondWith(handleNavigate(request))
    return
  }

  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(handleStaticAsset(request))
  }
})

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      // Mirrors features/pos/offline/db.ts's schema exactly -- this only ever runs if the main
      // thread hasn't opened the database yet (unlikely, since registering this worker requires
      // offline mode to already be on), so it creates the same stores rather than assuming they
      // exist.
      const db = request.result
      if (!db.objectStoreNames.contains("pendingInvoices")) {
        const store = db.createObjectStore("pendingInvoices", { keyPath: "localId" })
        store.createIndex("byWorkspace", "workspaceId")
      }
      if (!db.objectStoreNames.contains("cachedData")) {
        db.createObjectStore("cachedData", { keyPath: ["workspaceId", "key"] })
      }
      if (!db.objectStoreNames.contains("authMirror")) {
        db.createObjectStore("authMirror", { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function get(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const request = tx.objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function remove(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function flushPendingInvoices() {
  const db = await openDb()
  const auth = await get(db, "authMirror", "current")
  if (!auth) return

  const pending = await getAll(db, "pendingInvoices")
  for (const item of pending) {
    if (item.status === "failed") continue
    try {
      const response = await fetch("/v1/pos/invoices", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: auth.tokenType + " " + auth.accessToken,
          "x-workspace-id": item.workspaceId,
        },
        body: JSON.stringify(item.payload),
      })
      // A non-network response (even an error one) reached the server -- leave it for the
      // foreground tab's own flush to classify and surface properly; this background pass only
      // ever clears a confirmed success.
      if (response.ok) await remove(db, "pendingInvoices", item.localId)
    } catch (error) {
      // Still offline -- stop for now, the next sync event (or the foreground flush once a tab
      // is open again) will pick up where this left off.
      return
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "pos-invoice-sync") {
    event.waitUntil(flushPendingInvoices())
  }
})
