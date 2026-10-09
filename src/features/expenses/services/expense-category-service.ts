import type { ExpenseCategory } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

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
const EXPENSE_CATEGORIES_ENDPOINT = ["", "v1", "expense-categories"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const expenseCategoryService = {
  async list(): Promise<ExpenseCategory[]> {
    const response = await client.get<{ items: ExpenseCategory[] }>(EXPENSE_CATEGORIES_ENDPOINT)
    return response.items
  },

  async create(name: string): Promise<ExpenseCategory> {
    return client.post<{ name: string }, ExpenseCategory>(EXPENSE_CATEGORIES_ENDPOINT, { name })
  },
}
