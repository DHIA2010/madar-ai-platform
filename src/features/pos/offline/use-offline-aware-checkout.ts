import { useCallback } from "react"

import {
  type CreateInvoiceInput,
  type Invoice,
  posInvoicesService,
} from "../services/pos-invoices.service"
import { enqueueInvoice, isNetworkLevelFailure } from "./offline-invoice-queue"

export interface OfflineCheckoutResult {
  invoice: Invoice | null
  // true when the sale was recorded locally and will sync once the connection returns, instead
  // of being created on the server just now.
  queued: boolean
  // The idempotency key this attempt used -- present on every result, but only meaningful to the
  // caller when queued is true (it's how a provisional receipt can be labeled, and how the
  // pending-sales list can be refreshed to show this exact item right away).
  localId: string
}

type SaleInput = Omit<CreateInvoiceInput, "idempotencyKey">

// Chrome/Edge-only, not in lib.dom.d.ts -- requested best-effort only (see below); correctness
// never depends on it firing.
interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> }
}

async function requestBackgroundSync(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return
    const registration = (await navigator.serviceWorker.ready) as SyncRegistration
    await registration.sync?.register("pos-invoice-sync")
  } catch {
    // Best-effort only -- the foreground flush (on mount, on the "online" event, and on a
    // periodic interval) is the mechanism this feature's correctness actually depends on.
  }
}

// Always generates a fresh idempotency key per sale attempt -- even when offline mode is off --
// so a transient failure right after the server already committed can never double-create on a
// client-side retry.
export function useOfflineAwareCheckout(workspaceId: string | null, offlineModeEnabled: boolean) {
  return useCallback(
    async (input: SaleInput): Promise<OfflineCheckoutResult> => {
      const idempotencyKey = crypto.randomUUID()
      const payload: CreateInvoiceInput = { ...input, idempotencyKey }

      if (!offlineModeEnabled || !workspaceId) {
        const invoice = await posInvoicesService.create(payload)
        return { invoice, queued: false, localId: idempotencyKey }
      }

      // Known offline already -- skip straight to queuing rather than waiting out a request that
      // cannot succeed.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await enqueueInvoice(idempotencyKey, workspaceId, payload)
        void requestBackgroundSync()
        return { invoice: null, queued: true, localId: idempotencyKey }
      }

      try {
        const invoice = await posInvoicesService.create(payload)
        return { invoice, queued: false, localId: idempotencyKey }
      } catch (error) {
        if (!isNetworkLevelFailure(error)) throw error
        await enqueueInvoice(idempotencyKey, workspaceId, payload)
        void requestBackgroundSync()
        return { invoice: null, queued: true, localId: idempotencyKey }
      }
    },
    [workspaceId, offlineModeEnabled]
  )
}
