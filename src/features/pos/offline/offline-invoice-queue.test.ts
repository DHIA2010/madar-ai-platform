import "fake-indexeddb/auto"

import { beforeEach, describe, expect, it } from "vitest"

import type { CreateInvoiceInput, Invoice } from "../services/pos-invoices.service"
import { getOfflineDb } from "./db"
import {
  enqueueInvoice,
  flushPendingInvoices,
  isNetworkLevelFailure,
  listPendingInvoices,
  markInvoiceAttempt,
  removeInvoice,
} from "./offline-invoice-queue"

const WORKSPACE_ID = "workspace-1"

const SAMPLE_PAYLOAD: CreateInvoiceInput = {
  customerName: null,
  customerPhone: null,
  customerId: null,
  payments: [{ paymentMethodCode: "cash", amount: 10 }],
  discountAmount: 0,
  notes: null,
  items: [{ productId: null, variantId: null, productName: "Coffee", unitPrice: 10, quantity: 1 }],
  idempotencyKey: "local-1",
}

function fakeInvoice(): Invoice {
  return {
    id: "invoice-1",
    workspaceId: WORKSPACE_ID,
    invoiceNumber: "INV-000001",
    orderNumber: null,
    status: "completed",
    customerName: null,
    customerPhone: null,
    customerId: null,
    cashierUserId: null,
    paymentMethodCode: "cash",
    payments: SAMPLE_PAYLOAD.payments,
    subtotalAmount: 10,
    discountAmount: 0,
    taxAmount: 1.5,
    totalAmount: 11.5,
    notes: null,
    notesLines: null,
    createdAt: new Date().toISOString(),
    items: [],
    qrCode: null,
    sellerName: null,
    sellerVatNumber: null,
    sellerAddress: null,
    customerVatNumber: null,
    zatcaSigned: false,
    zatcaStatus: null,
    zatcaReportedAt: null,
  }
}

// Mirrors the shape isNetworkLevelFailure actually checks (a "kind" field, see
// @/lib/errors/app-error's AppError) without importing that infra-layer type into feature code.
class FakeNetworkError extends Error {
  kind = "network" as const
  constructor() {
    super("network error")
  }
}

class FakeValidationError extends Error {
  kind = "validation" as const
  constructor(message: string) {
    super(message)
  }
}

beforeEach(async () => {
  const db = await getOfflineDb()
  await db.clear("pendingInvoices")
})

describe("isNetworkLevelFailure", () => {
  it("is true for an AppError with kind network", () => {
    expect(isNetworkLevelFailure(new FakeNetworkError())).toBe(true)
  })

  it("is false for a real server rejection", () => {
    expect(isNetworkLevelFailure(new FakeValidationError("out of stock"))).toBe(false)
  })

  it("is false for a plain non-error value", () => {
    expect(isNetworkLevelFailure("boom")).toBe(false)
  })
})

describe("offline invoice queue", () => {
  it("enqueues, lists (sorted oldest first), and removes an invoice", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await enqueueInvoice("local-2", WORKSPACE_ID, { ...SAMPLE_PAYLOAD, idempotencyKey: "local-2" })

    const pending = await listPendingInvoices(WORKSPACE_ID)
    expect(pending.map((item) => item.localId)).toEqual(["local-1", "local-2"])
    expect(pending[0].status).toBe("pending")
    expect(pending[0].attempts).toBe(0)

    await removeInvoice("local-1")
    const afterRemove = await listPendingInvoices(WORKSPACE_ID)
    expect(afterRemove.map((item) => item.localId)).toEqual(["local-2"])
  })

  it("only lists items for the given workspace", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await enqueueInvoice("local-2", "other-workspace", SAMPLE_PAYLOAD)

    expect(await listPendingInvoices(WORKSPACE_ID)).toHaveLength(1)
    expect(await listPendingInvoices("other-workspace")).toHaveLength(1)
  })

  it("markInvoiceAttempt patches an existing record and is a no-op for a missing one", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await markInvoiceAttempt("local-1", { attempts: 3, status: "failed", lastError: "boom" })

    const [item] = await listPendingInvoices(WORKSPACE_ID)
    expect(item).toMatchObject({ attempts: 3, status: "failed", lastError: "boom" })

    // No throw for an id that was never enqueued.
    await markInvoiceAttempt("never-enqueued", { attempts: 1 })
  })

  it("flushes a pending sale successfully and removes it from the queue", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const result = await flushPendingInvoices(WORKSPACE_ID, async () => fakeInvoice())

    expect(result).toEqual({ succeeded: 1, failed: 0, stillPending: 0 })
    expect(await listPendingInvoices(WORKSPACE_ID)).toHaveLength(0)
  })

  it("leaves a sale pending (and bumps attempts) on a network-level failure, stopping the rest of the queue", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await enqueueInvoice("local-2", WORKSPACE_ID, { ...SAMPLE_PAYLOAD, idempotencyKey: "local-2" })

    const result = await flushPendingInvoices(WORKSPACE_ID, async () => {
      throw new FakeNetworkError()
    })

    expect(result).toEqual({ succeeded: 0, failed: 0, stillPending: 1 })
    const pending = await listPendingInvoices(WORKSPACE_ID)
    // Still offline -- stops at the first item rather than burning through the rest of the queue.
    expect(pending).toHaveLength(2)
    expect(pending[0]).toMatchObject({ status: "pending", attempts: 1 })
    expect(pending[1]).toMatchObject({ status: "pending", attempts: 0 })
  })

  it("marks a sale failed (not retried) on a genuine server rejection", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)

    const result = await flushPendingInvoices(WORKSPACE_ID, async () => {
      throw new FakeValidationError("This product is out of stock.")
    })

    expect(result).toEqual({ succeeded: 0, failed: 1, stillPending: 0 })
    const [item] = await listPendingInvoices(WORKSPACE_ID)
    expect(item).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "This product is out of stock.",
    })
  })

  it("skips an already-failed item on a later flush", async () => {
    await enqueueInvoice("local-1", WORKSPACE_ID, SAMPLE_PAYLOAD)
    await markInvoiceAttempt("local-1", { status: "failed", lastError: "boom" })

    let called = false
    const result = await flushPendingInvoices(WORKSPACE_ID, async () => {
      called = true
      return fakeInvoice()
    })

    expect(called).toBe(false)
    expect(result).toEqual({ succeeded: 0, failed: 0, stillPending: 0 })
  })
})
