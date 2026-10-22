import "fake-indexeddb/auto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchWithOfflineFallback, readCached, writeCached } from "./cached-data"
import { getOfflineDb } from "./db"

const WORKSPACE_ID = "workspace-1"

beforeEach(async () => {
  const db = await getOfflineDb()
  await db.clear("cachedData")
})

describe("readCached / writeCached", () => {
  it("round-trips a value, scoped per workspace and key", async () => {
    await writeCached(WORKSPACE_ID, "products", [{ id: "p1" }])
    await writeCached("other-workspace", "products", [{ id: "p2" }])

    expect(await readCached(WORKSPACE_ID, "products")).toEqual([{ id: "p1" }])
    expect(await readCached("other-workspace", "products")).toEqual([{ id: "p2" }])
    expect(await readCached(WORKSPACE_ID, "payment-methods")).toBeNull()
  })

  it("overwrites the previous value for the same workspace+key", async () => {
    await writeCached(WORKSPACE_ID, "products", [{ id: "p1" }])
    await writeCached(WORKSPACE_ID, "products", [{ id: "p2" }])

    expect(await readCached(WORKSPACE_ID, "products")).toEqual([{ id: "p2" }])
  })
})

describe("fetchWithOfflineFallback", () => {
  it("calls the real fetch and mirrors the result when online", async () => {
    const fetchFn = vi.fn(async () => ({ id: "product-detail" }))

    const result = await fetchWithOfflineFallback(WORKSPACE_ID, "product-detail:1", fetchFn, false)

    expect(result).toEqual({ id: "product-detail" })
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(await readCached(WORKSPACE_ID, "product-detail:1")).toEqual({ id: "product-detail" })
  })

  it("serves the cached value instead of calling fetch when isOffline is true", async () => {
    await writeCached(WORKSPACE_ID, "product-detail:1", { id: "cached-detail" })
    const fetchFn = vi.fn(async () => ({ id: "should-not-be-called" }))

    const result = await fetchWithOfflineFallback(WORKSPACE_ID, "product-detail:1", fetchFn, true)

    expect(result).toEqual({ id: "cached-detail" })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("falls through to fetch when isOffline is true but nothing is cached yet", async () => {
    const fetchFn = vi.fn(async () => ({ id: "fresh" }))

    const result = await fetchWithOfflineFallback(
      WORKSPACE_ID,
      "product-detail:never-opened",
      fetchFn,
      true
    )

    expect(result).toEqual({ id: "fresh" })
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it("falls back to the cached value when the live call fails despite isOffline being false", async () => {
    await writeCached(WORKSPACE_ID, "product-detail:1", { id: "stale-but-usable" })
    const fetchFn = vi.fn(async () => {
      throw new Error("network error")
    })

    const result = await fetchWithOfflineFallback(WORKSPACE_ID, "product-detail:1", fetchFn, false)

    expect(result).toEqual({ id: "stale-but-usable" })
  })

  it("rethrows when the live call fails and nothing is cached", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("boom")
    })

    await expect(
      fetchWithOfflineFallback(WORKSPACE_ID, "product-detail:never-opened", fetchFn, false)
    ).rejects.toThrow("boom")
  })

  it("never serves another workspace's cached value", async () => {
    await writeCached("other-workspace", "product-detail:1", { id: "wrong-tenant" })

    const fetchFn = vi.fn(async () => ({ id: "this-tenant" }))
    const result = await fetchWithOfflineFallback(WORKSPACE_ID, "product-detail:1", fetchFn, true)

    // Nothing cached for WORKSPACE_ID specifically -- falls through to fetch rather than ever
    // reading the other workspace's row, exactly the tenant-isolation guarantee this module
    // exists for (see public/pos-sw.js's own comment on why the service worker never caches API
    // responses directly).
    expect(result).toEqual({ id: "this-tenant" })
    expect(fetchFn).toHaveBeenCalledOnce()
  })
})
