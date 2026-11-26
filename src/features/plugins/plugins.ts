"use client"

import { useEffect, useSyncExternalStore } from "react"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The sector plugins (الإضافات): helpers that complete the cashier for one kind of business,
// switched on or off by the business (identity-platform/plugins, /v1/plugins).
export type PluginId = "laundry"
export interface PluginState {
  id: PluginId
  enabled: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } | null } }
    const id = parsed.state?.currentWorkspace?.id
    return id && UUID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}
const SEPARATOR = String.fromCharCode(47)
const path = (...parts: string[]) => ["", "v1", "plugins", ...parts].join(SEPARATOR)
const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

// One shared copy for the whole page (the side menu and the screens read the same answer).
let state: PluginState[] | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

function load(force = false) {
  if (loading && !force) return loading
  loading = client
    .get<{ items: PluginState[] }>(path())
    .then((response) => {
      state = response.items
    })
    .catch(() => {
      state = state ?? []
    })
    .finally(emit)
  return loading
}

export const pluginsService = {
  async setEnabled(id: PluginId, enabled: boolean) {
    const response = await client.put<{ enabled: boolean }, { items: PluginState[] }>(path(id), {
      enabled,
    })
    state = response.items
    emit()
    return response.items
  },
  reload: () => load(true),
}

// The plugins and whether each is on; null until loaded. `active` false (no cashier app) skips
// asking the server, which would refuse.
export function usePlugins(active = true): PluginState[] | null {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => null
  )
  useEffect(() => {
    if (active && state === null) void load()
  }, [active])
  return active ? snapshot : []
}

export function usePluginEnabled(id: PluginId, active = true): boolean | null {
  const plugins = usePlugins(active)
  if (plugins === null) return null
  return plugins.find((plugin) => plugin.id === id)?.enabled ?? false
}
