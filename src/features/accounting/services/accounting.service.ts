import type {
  Account,
  AccountInput,
  BalanceSheet,
  BooksSettings,
  EntryDetail,
  EntryInput,
  EntryPage,
  IncomeStatement,
  Ledger,
  Overview,
  PartyBalances,
  PartyType,
  Range,
  SyncResult,
  TrialBalance,
  VatSummary,
} from "../types/accounting.types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as the other feature services.
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

const SEPARATOR = String.fromCharCode(47)
const path = (...parts: string[]) => ["", "v1", "accounting", ...parts].join(SEPARATOR)
const withQuery = (base: string, params: object) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export interface EntryFilters {
  from?: string
  to?: string
  sourceType?: string
  accountId?: string
  search?: string
  page: number
  pageSize: number
}

export const accountingService = {
  overview: (range: Range) => client.get<Overview>(withQuery(path("overview"), range)),

  // Brings the books up to date now; `full` re-reads every document.
  sync: (full: boolean) => client.post<{ full: boolean }, SyncResult>(path("sync"), { full }),

  getSettings: () => client.get<BooksSettings>(path("settings")),
  setLockedThrough: (lockedThrough: string | null) =>
    client.put<{ lockedThrough: string | null }, BooksSettings>(path("settings"), {
      lockedThrough,
    }),

  async listAccounts(): Promise<Account[]> {
    return (await client.get<{ items: Account[] }>(path("accounts"))).items
  },
  createAccount: (input: AccountInput) =>
    client.post<AccountInput, Account>(path("accounts"), input),
  updateAccount: (id: string, input: AccountInput) =>
    client.put<AccountInput, Account>(path("accounts", id), input),
  deleteAccount: (id: string) => client.delete<{ ok: true }>(path("accounts", id)),

  listEntries: (filters: EntryFilters) =>
    client.get<EntryPage>(withQuery(path("entries"), filters)),
  getEntry: (id: string) => client.get<EntryDetail>(path("entries", id)),
  createEntry: (input: EntryInput) => client.post<EntryInput, EntryDetail>(path("entries"), input),
  updateEntry: (id: string, input: EntryInput) =>
    client.put<EntryInput, EntryDetail>(path("entries", id), input),
  deleteEntry: (id: string) => client.delete<{ ok: true }>(path("entries", id)),

  trialBalance: (range: Range) =>
    client.get<TrialBalance>(withQuery(path("reports", "trial-balance"), range)),
  incomeStatement: (range: Range) =>
    client.get<IncomeStatement>(withQuery(path("reports", "income-statement"), range)),
  balanceSheet: (asOf: string) =>
    client.get<BalanceSheet>(withQuery(path("reports", "balance-sheet"), { asOf })),
  ledger: (accountId: string, range: Range) =>
    client.get<Ledger>(withQuery(path("reports", "ledger"), { accountId, ...range })),
  partyBalances: (type: PartyType, asOf: string) =>
    client.get<PartyBalances>(withQuery(path("reports", "parties"), { type, asOf })),
  vat: (range: Range) => client.get<VatSummary>(withQuery(path("reports", "vat"), range)),
}
