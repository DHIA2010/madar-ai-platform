import { useCallback, useEffect, useRef, useState } from "react"

import { posShiftsService } from "../services/pos-shifts.service"
import type { PendingShiftOpenRecord } from "./db"
import { flushPendingShiftOpens, listPendingShiftOpens } from "./offline-shift-queue"
import { useOnlineStatus } from "./use-online-status"

const FLUSH_INTERVAL_MS = 30_000

// onResolved fires once per flush that actually cleared something (opened for real, or found the
// real shift already existed) -- the caller's cue to re-fetch the real shift list so the
// provisional local shift gets replaced by the real one as soon as possible, not just whenever
// something else happens to call loadShifts() next.
export function usePendingShiftOpen(
  workspaceId: string | null,
  offlineModeEnabled: boolean,
  onResolved: () => void
) {
  const [pending, setPending] = useState<PendingShiftOpenRecord[]>([])
  const isOnline = useOnlineStatus()
  const isFlushingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!workspaceId) return
    setPending(await listPendingShiftOpens(workspaceId))
  }, [workspaceId])

  const flushNow = useCallback(async () => {
    if (!workspaceId || isFlushingRef.current) return
    isFlushingRef.current = true
    try {
      const result = await flushPendingShiftOpens(workspaceId, (payload) =>
        posShiftsService.open(payload)
      )
      if (result.succeeded > 0 || result.reconciled > 0) onResolved()
    } finally {
      isFlushingRef.current = false
      await refresh()
    }
  }, [workspaceId, refresh, onResolved])

  useEffect(() => {
    if (!offlineModeEnabled || !workspaceId) return
    void refresh()
  }, [offlineModeEnabled, workspaceId, refresh])

  useEffect(() => {
    if (!offlineModeEnabled || !workspaceId || !isOnline) return
    void flushNow()
    const interval = window.setInterval(() => void flushNow(), FLUSH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [offlineModeEnabled, workspaceId, isOnline, flushNow])

  return { pending, hasPending: pending.length > 0, isOnline, flushNow, refresh }
}
