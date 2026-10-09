import type { Expense, ExpenseFormValues } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as
// src/features/purchases/services/purchase-service.ts and src/features/customers' own service.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) return null
    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

const PATH_SEPARATOR = String.fromCharCode(47)
const EXPENSES_ENDPOINT = ["", "v1", "expenses"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

function toSavePayload(values: ExpenseFormValues) {
  return {
    workspaceId: values.workspaceId,
    categoryId: values.categoryId,
    name: values.name,
    amount: values.amount,
    paymentMethod: values.paymentMethod,
    taxInclusive: values.taxInclusive,
    expenseDate: values.expenseDate,
    referenceNumber: values.referenceNumber,
    notes: values.notes,
  }
}

export const expenseService = {
  async list(): Promise<Expense[]> {
    const response = await client.get<{ items: Expense[] }>(EXPENSES_ENDPOINT)
    return response.items
  },

  async create(values: ExpenseFormValues): Promise<Expense> {
    return client.post<ReturnType<typeof toSavePayload>, Expense>(
      EXPENSES_ENDPOINT,
      toSavePayload(values)
    )
  },
}
