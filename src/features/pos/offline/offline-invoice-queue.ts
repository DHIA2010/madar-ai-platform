import type { CreateInvoiceInput, Invoice } from "../services/pos-invoices.service"
import { getOfflineDb, type PendingInvoiceRecord } from "./db"

export async function enqueueInvoice(
  localId: string,
  workspaceId: string,
  payload: CreateInvoiceInput
): Promise<void> {
  const db = await getOfflineDb()
  const record: PendingInvoiceRecord = {
    localId,
    workspaceId,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    lastError: null,
  }
  await db.put("pendingInvoices", record)
}

export async function listPendingInvoices(workspaceId: string): Promise<PendingInvoiceRecord[]> {
  const db = await getOfflineDb()
  const all = await db.getAllFromIndex("pendingInvoices", "byWorkspace", workspaceId)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeInvoice(localId: string): Promise<void> {
  const db = await getOfflineDb()
  await db.delete("pendingInvoices", localId)
}

export async function markInvoiceAttempt(
  localId: string,
  patch: Partial<Pick<PendingInvoiceRecord, "attempts" | "status" | "lastError">>
): Promise<void> {
  const db = await getOfflineDb()
  const existing = await db.get("pendingInvoices", localId)
  if (!existing) return
  await db.put("pendingInvoices", { ...existing, ...patch })
}

// True for a failure the network itself caused (offline, DNS, timeout, CORS-preflight-never-
// reached) -- as opposed to a real HTTP response the server sent back (even an error one), which
// means the request DID reach the server and must never be silently retried as if it hadn't.
// createApiClient (src/infrastructure/http/http-client.ts) already normalizes both a raw fetch
// TypeError and an AbortError timeout into an AppError with kind "network" before this ever sees
// it -- see toAppError in @/lib/errors/app-error.
export function isNetworkLevelFailure(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "kind" in error && error.kind === "network")
}

export interface FlushResult {
  succeeded: number
  failed: number
  stillPending: number
}

// FIFO: a later sale waiting on an earlier one of the same (now out-of-stock) product to resolve
// first is the correct order to replay them in anyway.
export async function flushPendingInvoices(
  workspaceId: string,
  sendFn: (payload: CreateInvoiceInput) => Promise<Invoice>
): Promise<FlushResult> {
  const pending = (await listPendingInvoices(workspaceId)).filter(
    (item) => item.status !== "failed"
  )

  let succeeded = 0
  let failed = 0
  let stillPending = 0

  for (const item of pending) {
    await markInvoiceAttempt(item.localId, { status: "syncing" })
    try {
      await sendFn(item.payload)
      await removeInvoice(item.localId)
      succeeded += 1
    } catch (error) {
      if (isNetworkLevelFailure(error)) {
        await markInvoiceAttempt(item.localId, {
          status: "pending",
          attempts: item.attempts + 1,
        })
        stillPending += 1
        // Still offline -- no point attempting the rest of the queue right now either.
        break
      }

      // A genuine server rejection (e.g. the product really is out of stock now) -- stop
      // retrying automatically; the cashier has to look at it.
      await markInvoiceAttempt(item.localId, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : "Unknown error",
      })
      failed += 1
    }
  }

  return { succeeded, failed, stillPending }
}
