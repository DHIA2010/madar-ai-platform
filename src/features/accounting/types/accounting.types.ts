// Mirrors the backend's /v1/accounting/* contracts (src/identity-platform/accounting) -- frontend
// code doesn't import backend modules, so they're restated here.

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense"
export type AccountSection =
  | "current_asset"
  | "fixed_asset"
  | "current_liability"
  | "long_term_liability"
  | "equity"
  | "revenue"
  | "other_income"
  | "cost_of_sales"
  | "operating_expense"

export const SECTIONS_BY_TYPE: Record<AccountType, AccountSection[]> = {
  asset: ["current_asset", "fixed_asset"],
  liability: ["current_liability", "long_term_liability"],
  equity: ["equity"],
  revenue: ["revenue", "other_income"],
  expense: ["cost_of_sales", "operating_expense"],
}
export const ACCOUNT_TYPES = Object.keys(SECTIONS_BY_TYPE) as AccountType[]

export interface Account {
  id: string
  code: string
  nameAr: string
  nameEn: string
  type: AccountType
  section: AccountSection
  // Used by Madar's automatic entries: can be renamed and renumbered, not deleted.
  isSystem: boolean
  isActive: boolean
  balance: number
}

export interface AccountInput {
  code: string
  nameAr: string
  nameEn: string
  type: AccountType
  section: AccountSection
  isActive: boolean
}

// Where an entry came from: written by a person, or posted from one of Madar's documents.
export type EntrySource =
  | "manual"
  | "opening"
  | "pos_invoice"
  | "pos_return"
  | "sales_invoice"
  | "sales_payment"
  | "online_order"
  | "customer_voucher"
  | "purchase"
  | "purchase_return"
  | "supplier_voucher"
  | "expense"
  | "stock_count"

export const ENTRY_SOURCES: EntrySource[] = [
  "manual",
  "opening",
  "pos_invoice",
  "pos_return",
  "sales_invoice",
  "sales_payment",
  "online_order",
  "customer_voucher",
  "purchase",
  "purchase_return",
  "supplier_voucher",
  "expense",
  "stock_count",
]

export interface EntrySummary {
  id: string
  date: string
  reference: string
  description: string
  sourceType: EntrySource
  workspaceId: string | null
  amount: number
}

export interface EntryLine {
  id: string
  accountId: string
  accountCode: string
  accountNameAr: string
  accountNameEn: string
  debit: number
  credit: number
  memo: string
}

export interface EntryDetail extends EntrySummary {
  editable: boolean
  lines: EntryLine[]
}

export interface EntryInput {
  date: string
  description: string
  opening: boolean
  workspaceId: string | null
  lines: Array<{ accountId: string; debit: number; credit: number; memo: string }>
}

export interface EntryPage {
  items: EntrySummary[]
  total: number
  page: number
  pageSize: number
}

export interface Range {
  from: string
  to: string
}

export interface TrialBalanceRow {
  account: Account
  openingDebit: number
  openingCredit: number
  debit: number
  credit: number
  closingDebit: number
  closingCredit: number
}

export interface TrialBalance extends Range {
  rows: TrialBalanceRow[]
  totals: Omit<TrialBalanceRow, "account">
}

export interface StatementSection {
  lines: Array<{ account: Account; amount: number }>
  total: number
}

export interface IncomeStatement extends Range {
  revenue: StatementSection
  costOfSales: StatementSection
  grossProfit: number
  operatingExpenses: StatementSection
  otherIncome: StatementSection
  netProfit: number
}

export interface BalanceSheet {
  asOf: string
  currentAssets: StatementSection
  fixedAssets: StatementSection
  totalAssets: number
  currentLiabilities: StatementSection
  longTermLiabilities: StatementSection
  totalLiabilities: number
  equity: StatementSection
  currentEarnings: number
  totalEquity: number
  totalLiabilitiesAndEquity: number
}

export interface LedgerLine {
  id: string
  entryId: string
  date: string
  reference: string
  description: string
  sourceType: EntrySource
  debit: number
  credit: number
  balance: number
}

export interface Ledger extends Range {
  account: Account
  openingBalance: number
  closingBalance: number
  totalDebit: number
  totalCredit: number
  lines: LedgerLine[]
  truncated: boolean
}

export type PartyType = "customer" | "supplier"

export interface PartyBalances {
  type: PartyType
  asOf: string
  items: Array<{ partyId: string; name: string; debit: number; credit: number; balance: number }>
  total: number
}

export interface VatSummary extends Range {
  output: number
  input: number
  due: number
}

export interface Overview extends Range {
  revenue: number
  costOfSales: number
  grossProfit: number
  expenses: number
  netProfit: number
  cash: number
  inSettlement: number
  receivable: number
  payable: number
  inventory: number
  vatDue: number
  totalAssets: number
  lockedThrough: string | null
  lastSyncedAt: string | null
}

export interface BooksSettings {
  lockedThrough: string | null
  lastSyncedAt: string | null
}

export interface SyncResult {
  ran: boolean
  created: number
  updated: number
  removed: number
}
