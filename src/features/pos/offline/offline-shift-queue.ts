import type { OpenShiftInput, Shift } from "../services/pos-shifts.service"
import type { PendingShiftOpenRecord } from "./db"
import { getOfflineDb } from "./db"
import { isNetworkLevelFailure } from "./offline-invoice-queue"

// The backend already guards against two open shifts for the same cashier (see
// shifts-service.ts's open(): "SELECT ... WHERE cashier_user_id = $1 AND status = 'open'" throws
// this before inserting) -- a queued open-shift retry that lands after an earlier attempt already
// landed server-side is not a failure, it's confirmation the real shift already exists.
const ALREADY_OPEN_CODE = "POS_SHIFT_ALREADY_OPEN"

export async function enqueueShiftOpen(
  localId: string,
  workspaceId: string,
  payload: OpenShiftInput
): Promise<void> {
  const db = await getOfflineDb()
  const record: PendingShiftOpenRecord = {
    localId,
    workspaceId,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
    lastError: null,
  }
  await db.put("pendingShiftOpens", record)
}

export async function listPendingShiftOpens(
  workspaceId: string
): Promise<PendingShiftOpenRecord[]> {
  const db = await getOfflineDb()
  const all = await db.getAllFromIndex("pendingShiftOpens", "byWorkspace", workspaceId)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeShiftOpen(localId: string): Promise<void> {
  const db = await getOfflineDb()
  await db.delete("pendingShiftOpens", localId)
}

async function markShiftOpenAttempt(
  localId: string,
  patch: Partial<Pick<PendingShiftOpenRecord, "attempts" | "status" | "lastError">>
): Promise<void> {
  const db = await getOfflineDb()
  const existing = await db.get("pendingShiftOpens", localId)
  if (!existing) return
  await db.put("pendingShiftOpens", { ...existing, ...patch })
}

function isAlreadyOpenError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === ALREADY_OPEN_CODE
  )
}

export interface ShiftFlushResult {
  succeeded: number
  // The real shift already existed server-side by the time this ran (a previous sync attempt
  // actually landed, or the cashier opened one from a different, now-reconnected device) --
  // resolved, not a failure, but the caller still needs to refresh its own shift list to pick up
  // the real one in place of the provisional local record.
  reconciled: number
  failed: number
  stillPending: number
}

// FIFO, same reasoning as flushPendingInvoices: in the extremely unlikely event of more than one
// queued attempt, replaying them in the order they were made is the only sensible order.
export async function flushPendingShiftOpens(
  workspaceId: string,
  sendFn: (payload: OpenShiftInput) => Promise<Shift>
): Promise<ShiftFlushResult> {
  const pending = (await listPendingShiftOpens(workspaceId)).filter(
    (item) => item.status !== "failed"
  )

  let succeeded = 0
  let reconciled = 0
  let failed = 0
  let stillPending = 0

  for (const item of pending) {
    await markShiftOpenAttempt(item.localId, { status: "syncing" })
    try {
      await sendFn(item.payload)
      await removeShiftOpen(item.localId)
      succeeded += 1
    } catch (error) {
      if (isNetworkLevelFailure(error)) {
        await markShiftOpenAttempt(item.localId, { status: "pending", attempts: item.attempts + 1 })
        stillPending += 1
        break
      }
      if (isAlreadyOpenError(error)) {
        await removeShiftOpen(item.localId)
        reconciled += 1
        continue
      }
      await markShiftOpenAttempt(item.localId, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : "Unknown error",
      })
      failed += 1
    }
  }

  return { succeeded, reconciled, failed, stillPending }
}
