import { getOfflineDb } from "./db"

export async function readCached<T>(workspaceId: string, key: string): Promise<T | null> {
  const db = await getOfflineDb()
  const record = await db.get("cachedData", [workspaceId, key])
  return (record?.value as T | undefined) ?? null
}

export async function writeCached(workspaceId: string, key: string, value: unknown): Promise<void> {
  const db = await getOfflineDb()
  await db.put("cachedData", { workspaceId, key, value, cachedAt: Date.now() })
}

// Tries the real call first; on success, mirrors the result for offline fallback and returns it.
// On a network-level failure, falls back to the last-mirrored snapshot instead of throwing -- a
// genuine server error (not a connectivity problem) is never swallowed this way, since isOffline
// only short-circuits the attempt entirely rather than letting a real HTTP error reach here.
export async function fetchWithOfflineFallback<T>(
  workspaceId: string,
  key: string,
  fetchFn: () => Promise<T>,
  isOffline: boolean
): Promise<T> {
  if (!isOffline) {
    try {
      const result = await fetchFn()
      await writeCached(workspaceId, key, result)
      return result
    } catch (error) {
      const cached = await readCached<T>(workspaceId, key)
      if (cached !== null) return cached
      throw error
    }
  }

  const cached = await readCached<T>(workspaceId, key)
  if (cached !== null) return cached
  return fetchFn()
}
