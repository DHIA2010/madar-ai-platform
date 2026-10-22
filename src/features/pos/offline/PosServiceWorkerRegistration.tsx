"use client"

import { useEffect } from "react"

import { ROUTES } from "@/constants/routes"

import { syncAuthMirror } from "./auth-mirror"

import { createSessionManager } from "@/infrastructure/identity"

export interface PosServiceWorkerRegistrationProps {
  workspaceId: string | null
  offlineModeEnabled: boolean
}

// Renders nothing -- registers the offline-mode service worker (public/pos-sw.js) and keeps its
// IndexedDB auth mirror current, both gated on the setting so no store gets either without
// opting in. Mounted once from CashierPage.
export function PosServiceWorkerRegistration({
  workspaceId,
  offlineModeEnabled,
}: PosServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!offlineModeEnabled || !workspaceId) return
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker
      .register(ROUTES.posServiceWorker.script, { scope: ROUTES.posServiceWorker.scope })
      .catch(() => {
        // Best-effort: offline mode still works within an already-open tab via the IndexedDB
        // queue + foreground flush even if the service worker itself fails to register (e.g. an
        // unsupported browser) -- only "reopen the app with zero network" needs this to succeed.
      })
  }, [offlineModeEnabled, workspaceId])

  useEffect(() => {
    if (!offlineModeEnabled || !workspaceId) return
    const session = createSessionManager().restore()
    void syncAuthMirror(workspaceId, session)
  }, [offlineModeEnabled, workspaceId])

  return null
}
