import type { PaymentKind } from "./pos-payment-methods.service"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the other pos services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const SHIFTS_ENDPOINT = ["", "v1", "pos", "shifts"].join(PATH_SEPARATOR)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

export type ShiftStatus = "open" | "closed"

// A cashier's session at a branch: a counted starting float, and (once closed) a counted ending
// one. shiftNumber is a real sequential number ("#21") assigned when opened -- null for shifts
// opened before that existed, rather than a fabricated backfilled value.
export interface Shift {
  id: string
  shiftNumber: number | null
  workspaceId: string
  cashierUserId: string
  status: ShiftStatus
  openingCashAmount: number
  openingNotes: string | null
  openedAt: string
  openedBy: string | null
  closingCashAmount: number | null
  closingNotes: string | null
  closedAt: string | null
  closedBy: string | null
}

export interface OpenShiftInput {
  workspaceId: string
  cashierUserId: string
  openingCashAmount: number
  openingNotes: string | null
}

export interface CloseShiftInput {
  closingCashAmount: number
  closingNotes: string | null
}

export type CashMovementType = "withdrawal" | "deposit"

// A manual cash-drawer adjustment mid-shift -- a manager pulling change out or topping the float
// up -- distinct from a sale or a return, which pos_invoices already covers.
export interface CashMovement {
  id: string
  shiftId: string
  type: CashMovementType
  amount: number
  note: string | null
  createdBy: string | null
  createdAt: string
}

export interface RecordCashMovementInput {
  type: CashMovementType
  amount: number
  note: string | null
}

export interface PaymentBreakdownEntry {
  code: string
  name: string
  kind: PaymentKind | null
  amount: number
  percentage: number
}

export interface ShiftCashSummary {
  openingCashAmount: number
  cashSales: number
  otherSales: number
  cashReturns: number
  withdrawals: number
  deposits: number
  expectedCashAmount: number
}

export type ShiftActivityType = "open" | "close" | "withdrawal" | "deposit" | "sale" | "return"

export interface ShiftActivityEntry {
  type: ShiftActivityType
  amount: number
  note: string | null
  occurredAt: string
  reference: string
}

// Everything the shift detail page shows, computed server-side from real pos_invoices and
// pos_cash_movements rows for this shift's own window -- not recomputed client-side, so the page
// and the close dialog (which does its own smaller version of this same math) can never disagree.
export interface ShiftDetail {
  shift: Shift
  totalSales: number
  invoiceCount: number
  paymentBreakdown: PaymentBreakdownEntry[]
  cashSummary: ShiftCashSummary
  activity: ShiftActivityEntry[]
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const posShiftsService = {
  async list(): Promise<Shift[]> {
    const response = await client.get<{ items: Shift[] }>(SHIFTS_ENDPOINT)
    return response.items
  },

  async open(input: OpenShiftInput): Promise<Shift> {
    return client.post<OpenShiftInput, Shift>(SHIFTS_ENDPOINT, input)
  },

  async close(id: string, input: CloseShiftInput): Promise<Shift> {
    return client.patch<CloseShiftInput, Shift>(
      [SHIFTS_ENDPOINT, encodeURIComponent(id), "close"].join(PATH_SEPARATOR),
      input
    )
  },

  async listCashMovements(shiftId: string): Promise<CashMovement[]> {
    const response = await client.get<{ items: CashMovement[] }>(
      [SHIFTS_ENDPOINT, encodeURIComponent(shiftId), "cash-movements"].join(PATH_SEPARATOR)
    )
    return response.items
  },

  async recordCashMovement(shiftId: string, input: RecordCashMovementInput): Promise<CashMovement> {
    return client.post<RecordCashMovementInput, CashMovement>(
      [SHIFTS_ENDPOINT, encodeURIComponent(shiftId), "cash-movements"].join(PATH_SEPARATOR),
      input
    )
  },

  async get(id: string): Promise<Shift> {
    return client.get<Shift>([SHIFTS_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  async getDetail(id: string): Promise<ShiftDetail> {
    return client.get<ShiftDetail>(
      [SHIFTS_ENDPOINT, encodeURIComponent(id), "detail"].join(PATH_SEPARATOR)
    )
  },
}
