import "fake-indexeddb/auto"

import { beforeEach, describe, expect, it } from "vitest"

import type { OpenShiftInput, Shift } from "../services/pos-shifts.service"
import { getOfflineDb } from "./db"
import {
  enqueueShiftOpen,
  flushPendingShiftOpens,
  listPendingShiftOpens,
  removeShiftOpen,
} from "./offline-shift-queue"

const WORKSPACE_ID = "workspace-1"

const SAMPLE_PAYLOAD: OpenShiftInput = {
  workspaceId: WORKSPACE_ID,
  cashierUserId: "cashier-1",
  openingCashAmount: 100,
  openingNotes: null,
}

function fakeShift(): Shift {
  return {
    id: "shift-1",
    shiftNumber: 7,
    workspaceId: WORKSPACE_ID,
    cashierUserId: "cashier-1",
    status: "open",
    openingCashAmount: 100,
    openingNotes: null,
    openedAt: new Date().toISOString(),
    openedBy: "cashier-1",
    closingCashAmount: null,
    closingNotes: null,
    closedAt: null,
    closedBy: null,
  }
}

class FakeNetworkError extends Error {
  kind = "network" as const
  constructor() {
    super("network error")
  }
}

class FakeAlreadyOpenError extends Error {
  code = "POS_SHIFT_ALREADY_OPEN"
  constructor() {
    super("A shift is already open.")
  }
}

class FakeOtherError extends Error {
  code = "POS_SHIFT_SOME_OTHER_ERROR"
  constructor(message: string) {
    super(message)
  }
}

beforeEach(async () => {
  const db = await getOfflineDb()
  await db.clear("pendingShiftOpens")
})

describe("offline shift-open queue", () => {
  it("enqueues, lists, and removes an open-shift request", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const pending = await listPendingShiftOpens(WORKSPACE_ID)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ localId: "local-1", status: "pending", attempts: 0 })

    await removeShiftOpen("local-1")
    expect(await listPendingShiftOpens(WORKSPACE_ID)).toHaveLength(0)
  })

  it("only lists requests for the given workspace", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await enqueueShiftOpen("local-2", "other-workspace", SAMPLE_PAYLOAD)

    expect(await listPendingShiftOpens(WORKSPACE_ID)).toHaveLength(1)
    expect(await listPendingShiftOpens("other-workspace")).toHaveLength(1)
  })

  it("flushes a queued open successfully and removes it", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const result = await flushPendingShiftOpens(WORKSPACE_ID, async () => fakeShift())

    expect(result).toEqual({ succeeded: 1, reconciled: 0, failed: 0, stillPending: 0 })
    expect(await listPendingShiftOpens(WORKSPACE_ID)).toHaveLength(0)
  })

  it("leaves the request pending on a network-level failure", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const result = await flushPendingShiftOpens(WORKSPACE_ID, async () => {
      throw new FakeNetworkError()
    })

    expect(result).toEqual({ succeeded: 0, reconciled: 0, failed: 0, stillPending: 1 })
    const [item] = await listPendingShiftOpens(WORKSPACE_ID)
    expect(item).toMatchObject({ status: "pending", attempts: 1 })
  })

  it("treats POS_SHIFT_ALREADY_OPEN as resolved, not failed -- the real shift already exists", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const result = await flushPendingShiftOpens(WORKSPACE_ID, async () => {
      throw new FakeAlreadyOpenError()
    })

    expect(result).toEqual({ succeeded: 0, reconciled: 1, failed: 0, stillPending: 0 })
    expect(await listPendingShiftOpens(WORKSPACE_ID)).toHaveLength(0)
  })

  it("marks a genuine rejection as failed, not retried automatically", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const result = await flushPendingShiftOpens(WORKSPACE_ID, async () => {
      throw new FakeOtherError("Something else went wrong.")
    })

    expect(result).toEqual({ succeeded: 0, reconciled: 0, failed: 1, stillPending: 0 })
    const [item] = await listPendingShiftOpens(WORKSPACE_ID)
    expect(item).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "Something else went wrong.",
    })
  })

  it("skips an already-failed item on a later flush", async () => {
    await enqueueShiftOpen("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await flushPendingShiftOpens(WORKSPACE_ID, async () => {
      throw new FakeOtherError("boom")
    })

    let called = false
    const result = await flushPendingShiftOpens(WORKSPACE_ID, async () => {
      called = true
      return fakeShift()
    })

    expect(called).toBe(false)
    expect(result).toEqual({ succeeded: 0, reconciled: 0, failed: 0, stillPending: 0 })
  })
})
