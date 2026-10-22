import { useCallback, useEffect, useRef, useState } from "react"

import { posInvoicesService } from "../services/pos-invoices.service"
import type { PendingInvoiceRecord } from "./db"
import { flushPendingInvoices, listPendingInvoices, removeInvoice } from "./offline-invoice-queue"
import { useOnlineStatus } from "./use-online-status"

const FLUSH_INTERVAL_MS = 30_000

export function usePendingInvoices(workspaceId: string | null, offlineModeEnabled: boolean) {
  const [pending, setPending] = useState<PendingInvoiceRecord[]>([])
  const isOnline = useOnlineStatus()
  const isFlushingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!workspaceId) return
    setPending(await listPendingInvoices(workspaceId))
  }, [workspaceId])

  const flushNow = useCallback(async () => {
    if (!workspaceId || isFlushingRef.current) return
    isFlushingRef.current = true
    try {
      await flushPendingInvoices(workspaceId, (payload) => posInvoicesService.create(payload))
    } finally {
      isFlushingRef.current = false
      await refresh()
    }
  }, [workspaceId, refresh])

  const discard = useCallback(
    async (localId: string) => {
      await removeInvoice(localId)
      await refresh()
    },
    [refresh]
  )

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

  return {
    pending,
    pendingCount: pending.filter((item) => item.status !== "failed").length,
    failedCount: pending.filter((item) => item.status === "failed").length,
    isOnline,
    flushNow,
    discard,
    refresh,
  }
}
