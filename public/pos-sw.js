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
const DB_NAME = "madar-pos-offline"
const DB_VERSION = 1

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  if (request.mode === "navigate" && url.pathname.includes("/pos")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/pos/")))
    )
    return
  }

  if (url.pathname.includes("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
      })
    )
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
