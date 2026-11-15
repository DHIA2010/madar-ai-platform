import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { riyadhToday, toDateString } from "../invoicing/shared"
import { type AccountSection, type AccountType, isDebitNormal, SECTIONS_BY_TYPE } from "./chart"
import type { PartyType } from "./postings"
import { ensureBooks, runPostingPass, type SyncResult } from "./sync"

// The Accounting app's reads and its few writes: the chart of accounts, manual journal entries,
// period closing, and the statements. Posted entries come from sync.ts; nothing here changes one.

export const ACCOUNTING_ERRORS = {
  notFound: (what: "account" | "entry") =>
    new IdentityError(
      what === "account" ? "ACCOUNTING_ACCOUNT_NOT_FOUND" : "ACCOUNTING_ENTRY_NOT_FOUND",
      404,
      "business",
      what === "account" ? "Account not found." : "Journal entry not found."
    ),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 409, "business", message, details),
  invalid: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 422, "business", message, details),
}

// A routine posting pass runs when the books are read, at most this often per organization.
const SYNC_EVERY_MS = 60_000
const MANUAL_SOURCES = ["manual", "opening"]
const LEDGER_LIMIT = 2000

type Row = Record<string, unknown>
const num = (value: unknown) => Number(value ?? 0)
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export interface AccountView {
  id: string
  code: string
  nameAr: string
  nameEn: string
  type: AccountType
  section: AccountSection
  isSystem: boolean
  isActive: boolean
  // Positive on the account's normal side (a debit balance for assets and expenses).
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

export interface EntryLineInput {
  accountId: string
  debit: number
  credit: number
  memo: string
}

export interface EntryInput {
  date: string
  description: string
  // An opening-balance entry is a manual one that the statements label as such.
  opening: boolean
  workspaceId: string | null
  lines: EntryLineInput[]
}

export interface EntryListFilters {
  from?: string
  to?: string
  sourceType?: string
  accountId?: string
  search?: string
  workspaceId?: string
  page: number
  pageSize: number
}

export interface ReportRange {
  from: string
  to: string
  workspaceId?: string
}

interface AccountTotals {
  openDebit: number
  openCredit: number
  periodDebit: number
  periodCredit: number
}

function mapAccount(row: Row, balance = 0): AccountView {
  return {
    id: String(row.id),
    code: String(row.code),
    nameAr: String(row.name_ar),
    nameEn: String(row.name_en),
    type: row.type as AccountType,
    section: row.section as AccountSection,
    isSystem: Boolean(row.system_key),
    isActive: row.is_active !== false,
    balance,
  }
}

export class AccountingService {
  // When each organization's books were last brought up to date by this process.
  private readonly lastPass = new Map<string, number>()
  // The pass each organization has running right now, if any.
  private readonly passes = new Map<string, Promise<void>>()

  constructor(private readonly db: PostgresDatabase) {}

  // ---- Keeping the books current ----

  // Brings the books up to date before they are read: a full pass the first time, then a routine
  // one at most once a minute. Requests that arrive while a pass is running wait for it, so none
  // of them reads books that are only half posted (the very first pass especially).
  private ensureCurrent(organizationId: string): Promise<void> {
    const running = this.passes.get(organizationId)
    if (running) return running
    const last = this.lastPass.get(organizationId) ?? 0
    if (Date.now() - last < SYNC_EVERY_MS) return Promise.resolve()
    const pass = runPostingPass(this.db, organizationId)
      .then(() => {
        this.lastPass.set(organizationId, Date.now())
      })
      .catch((error: unknown) => {
        // The statements still show what was posted before; the next read tries again.
        console.error("accounting.posting_pass_failed", {
          organizationId,
          message: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        this.passes.delete(organizationId)
      })
    this.passes.set(organizationId, pass)
    return pass
  }

  async sync(organizationId: string, full: boolean): Promise<SyncResult> {
    const result = await runPostingPass(this.db, organizationId, { full })
    this.lastPass.set(organizationId, Date.now())
    return result
  }

  async getSettings(organizationId: string) {
    await ensureBooks(this.db, organizationId)
    const row = await this.db.query<Row>(
      "SELECT locked_through, last_synced_at FROM accounting_books WHERE organization_id = $1",
      [organizationId]
    )
    const lastSynced = row.rows[0]?.last_synced_at as Date | string | null | undefined
    return {
      lockedThrough: toDateString(row.rows[0]?.locked_through as Date | string | null),
      lastSyncedAt: lastSynced ? new Date(lastSynced).toISOString() : null,
    }
  }

  // Closes the books through a day (or reopens them with null).
  async setLockedThrough(organizationId: string, lockedThrough: string | null) {
    await ensureBooks(this.db, organizationId)
    await this.db.query(
      "UPDATE accounting_books SET locked_through = $2, updated_at = now() WHERE organization_id = $1",
      [organizationId, lockedThrough]
    )
    return this.getSettings(organizationId)
  }

  private async assertOpen(organizationId: string, date: string): Promise<void> {
    const { lockedThrough } = await this.getSettings(organizationId)
    if (lockedThrough && date <= lockedThrough) {
      throw ACCOUNTING_ERRORS.conflict(
        "ACCOUNTING_PERIOD_CLOSED",
        "The books are closed through that date.",
        { lockedThrough }
      )
    }
  }

  // ---- Totals ----

  // Per account: what was posted before `from` and what was posted from `from` to `to`.
  private async totals(
    organizationId: string,
    range: ReportRange
  ): Promise<Map<string, AccountTotals>> {
    const values: unknown[] = [organizationId, range.from, range.to]
    let branch = ""
    if (range.workspaceId) {
      values.push(range.workspaceId)
      branch = " AND workspace_id = $4"
    }
    const rows = await this.db.query<Row>(
      `SELECT account_id,
              SUM(CASE WHEN entry_date < $2::date THEN debit ELSE 0 END) AS open_debit,
              SUM(CASE WHEN entry_date < $2::date THEN credit ELSE 0 END) AS open_credit,
              SUM(CASE WHEN entry_date >= $2::date THEN debit ELSE 0 END) AS period_debit,
              SUM(CASE WHEN entry_date >= $2::date THEN credit ELSE 0 END) AS period_credit
         FROM accounting_entry_lines
        WHERE organization_id = $1 AND entry_date <= $3::date${branch}
        GROUP BY account_id`,
      values
    )
    return new Map(
      rows.rows.map((row) => [
        String(row.account_id),
        {
          openDebit: num(row.open_debit),
          openCredit: num(row.open_credit),
          periodDebit: num(row.period_debit),
          periodCredit: num(row.period_credit),
        },
      ])
    )
  }

  private async accountRows(organizationId: string): Promise<Row[]> {
    await ensureBooks(this.db, organizationId)
    const rows = await this.db.query<Row>(
      `SELECT id, code, name_ar, name_en, type, section, system_key, is_active
         FROM accounting_accounts WHERE organization_id = $1 ORDER BY code`,
      [organizationId]
    )
    return rows.rows
  }

  // ---- Chart of accounts ----

  async listAccounts(organizationId: string): Promise<AccountView[]> {
    await this.ensureCurrent(organizationId)
    const today = riyadhToday()
    const totals = await this.totals(organizationId, { from: "1900-01-01", to: today })
    return (await this.accountRows(organizationId)).map((row) => {
      const sums = totals.get(String(row.id))
      const net = sums ? sums.periodDebit - sums.periodCredit : 0
      return mapAccount(row, round2(isDebitNormal(row.type as AccountType) ? net : -net))
    })
  }

  private validateAccount(input: AccountInput) {
    if (!SECTIONS_BY_TYPE[input.type].includes(input.section)) {
      throw ACCOUNTING_ERRORS.invalid(
        "ACCOUNTING_SECTION_MISMATCH",
        "That section does not belong to the account's type."
      )
    }
  }

  private async assertCodeFree(organizationId: string, code: string, exceptId?: string) {
    const taken = await this.db.query<Row>(
      "SELECT id FROM accounting_accounts WHERE organization_id = $1 AND code = $2",
      [organizationId, code]
    )
    if (taken.rows.some((row) => String(row.id) !== exceptId)) {
      throw ACCOUNTING_ERRORS.conflict("ACCOUNTING_CODE_TAKEN", "Another account has that number.")
    }
  }

  async createAccount(organizationId: string, input: AccountInput): Promise<AccountView> {
    await ensureBooks(this.db, organizationId)
    this.validateAccount(input)
    await this.assertCodeFree(organizationId, input.code)
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO accounting_accounts
         (id, organization_id, code, name_ar, name_en, type, section, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        organizationId,
        input.code,
        input.nameAr,
        input.nameEn,
        input.type,
        input.section,
        input.isActive,
      ]
    )
    return this.getAccount(organizationId, id)
  }

  private async getAccount(organizationId: string, id: string): Promise<AccountView> {
    const row = await this.db.query<Row>(
      `SELECT id, code, name_ar, name_en, type, section, system_key, is_active
         FROM accounting_accounts WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!row.rows[0]) throw ACCOUNTING_ERRORS.notFound("account")
    return mapAccount(row.rows[0])
  }

  async updateAccount(
    organizationId: string,
    id: string,
    input: AccountInput
  ): Promise<AccountView> {
    const current = await this.getAccount(organizationId, id)
    this.validateAccount(input)
    // An account the posting pass writes to keeps its role: it can be renamed and renumbered,
    // but not turned into another kind of account or switched off.
    if (current.isSystem && (input.type !== current.type || !input.isActive)) {
      throw ACCOUNTING_ERRORS.conflict(
        "ACCOUNTING_SYSTEM_ACCOUNT",
        "This account is used by Madar's automatic entries: its type can't change and it can't be deactivated."
      )
    }
    await this.assertCodeFree(organizationId, input.code, id)
    await this.db.query(
      `UPDATE accounting_accounts
          SET code = $3, name_ar = $4, name_en = $5, type = $6, section = $7, is_active = $8,
              updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [
        organizationId,
        id,
        input.code,
        input.nameAr,
        input.nameEn,
        input.type,
        input.section,
        input.isActive,
      ]
    )
    return this.getAccount(organizationId, id)
  }

  async deleteAccount(organizationId: string, id: string): Promise<void> {
    const current = await this.getAccount(organizationId, id)
    if (current.isSystem) {
      throw ACCOUNTING_ERRORS.conflict(
        "ACCOUNTING_SYSTEM_ACCOUNT",
        "This account is used by Madar's automatic entries and can't be deleted."
      )
    }
    const used = await this.db.query<Row>(
      "SELECT id FROM accounting_entry_lines WHERE organization_id = $1 AND account_id = $2 LIMIT 1",
      [organizationId, id]
    )
    if (used.rows.length > 0) {
      throw ACCOUNTING_ERRORS.conflict(
        "ACCOUNTING_ACCOUNT_IN_USE",
        "This account has entries. Deactivate it instead."
      )
    }
    await this.db.query("DELETE FROM accounting_accounts WHERE organization_id = $1 AND id = $2", [
      organizationId,
      id,
    ])
  }

  // ---- Journal ----

  async listEntries(organizationId: string, filters: EntryListFilters) {
    await this.ensureCurrent(organizationId)
    const where = ["e.organization_id = $1"]
    const values: unknown[] = [organizationId]
    const add = (condition: string, value: unknown) => {
      values.push(value)
      where.push(condition.replace("?", `$${values.length}`))
    }
    if (filters.from) add("e.entry_date >= ?::date", filters.from)
    if (filters.to) add("e.entry_date <= ?::date", filters.to)
    if (filters.sourceType) add("e.source_type = ?", filters.sourceType)
    if (filters.workspaceId) add("e.workspace_id = ?", filters.workspaceId)
    if (filters.search) {
      values.push(`%${filters.search.toLowerCase()}%`)
      where.push(
        `(LOWER(e.reference) LIKE $${values.length} OR LOWER(e.description) LIKE $${values.length})`
      )
    }
    let from = "accounting_entries e"
    if (filters.accountId) {
      // Entries that touch the account. Grouped, so an entry with two lines on it shows once.
      values.push(filters.accountId)
      from = `accounting_entries e JOIN accounting_entry_lines l ON l.entry_id = e.id AND l.account_id = $${values.length}`
    }
    const columns =
      "e.id, e.entry_date, e.reference, e.description, e.source_type, e.workspace_id, e.total_amount, e.created_at"
    const all = await this.db.query<Row>(
      `SELECT ${columns} FROM ${from} WHERE ${where.join(" AND ")} GROUP BY ${columns}`,
      values
    )
    const sorted = all.rows
      .map((row) => ({
        id: String(row.id),
        date: toDateString(row.entry_date as Date | string) ?? "",
        reference: String(row.reference),
        description: String(row.description ?? ""),
        sourceType: String(row.source_type),
        workspaceId: row.workspace_id ? String(row.workspace_id) : null,
        amount: num(row.total_amount),
        createdAt: new Date(row.created_at as Date | string).toISOString(),
      }))
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)
      )
    const start = (filters.page - 1) * filters.pageSize
    return {
      items: sorted.slice(start, start + filters.pageSize),
      total: sorted.length,
      page: filters.page,
      pageSize: filters.pageSize,
    }
  }

  async getEntry(organizationId: string, id: string) {
    const entry = await this.db.query<Row>(
      `SELECT id, entry_date, reference, description, source_type, source_id, workspace_id,
              total_amount, created_at
         FROM accounting_entries WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const row = entry.rows[0]
    if (!row) throw ACCOUNTING_ERRORS.notFound("entry")
    const lines = await this.db.query<Row>(
      `SELECT l.id, l.account_id, l.debit, l.credit, l.memo, l.line_order, l.party_type,
              l.party_id, a.code, a.name_ar, a.name_en
         FROM accounting_entry_lines l
         JOIN accounting_accounts a ON a.id = l.account_id
        WHERE l.entry_id = $1`,
      [id]
    )
    return {
      id: String(row.id),
      date: toDateString(row.entry_date as Date | string) ?? "",
      reference: String(row.reference),
      description: String(row.description ?? ""),
      sourceType: String(row.source_type),
      sourceId: row.source_id ? String(row.source_id) : null,
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      amount: num(row.total_amount),
      editable: MANUAL_SOURCES.includes(String(row.source_type)),
      lines: lines.rows
        .sort((left, right) => num(left.line_order) - num(right.line_order))
        .map((line) => ({
          id: String(line.id),
          accountId: String(line.account_id),
          accountCode: String(line.code),
          accountNameAr: String(line.name_ar),
          accountNameEn: String(line.name_en),
          debit: num(line.debit),
          credit: num(line.credit),
          memo: String(line.memo ?? ""),
          partyType: (line.party_type as PartyType | null) ?? null,
          partyId: line.party_id ? String(line.party_id) : null,
        })),
    }
  }

  private async validateEntry(organizationId: string, input: EntryInput) {
    if (input.lines.length < 2) {
      throw ACCOUNTING_ERRORS.invalid("ACCOUNTING_ENTRY_TOO_SHORT", "An entry needs two lines.")
    }
    let debit = 0
    let credit = 0
    for (const line of input.lines) {
      const lineDebit = Math.round(line.debit * 100)
      const lineCredit = Math.round(line.credit * 100)
      // Each line is one side only.
      if (lineDebit > 0 === lineCredit > 0) {
        throw ACCOUNTING_ERRORS.invalid(
          "ACCOUNTING_LINE_ONE_SIDE",
          "Each line is either a debit or a credit."
        )
      }
      debit += lineDebit
      credit += lineCredit
    }
    if (debit !== credit) {
      throw ACCOUNTING_ERRORS.invalid("ACCOUNTING_ENTRY_UNBALANCED", "Debits must equal credits.", {
        debit: debit / 100,
        credit: credit / 100,
      })
    }
    const accounts = new Map(
      (await this.accountRows(organizationId)).map((row) => [String(row.id), row])
    )
    for (const line of input.lines) {
      const account = accounts.get(line.accountId)
      if (!account) throw ACCOUNTING_ERRORS.notFound("account")
      if (account.is_active === false) {
        throw ACCOUNTING_ERRORS.invalid(
          "ACCOUNTING_ACCOUNT_INACTIVE",
          "One of the accounts is deactivated."
        )
      }
    }
    await this.assertOpen(organizationId, input.date)
    return debit / 100
  }

  private async writeLines(
    organizationId: string,
    entryId: string,
    input: EntryInput
  ): Promise<void> {
    for (const [order, line] of input.lines.entries()) {
      await this.db.query(
        `INSERT INTO accounting_entry_lines
           (id, entry_id, organization_id, account_id, entry_date, workspace_id, line_order,
            debit, credit, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          entryId,
          organizationId,
          line.accountId,
          input.date,
          input.workspaceId,
          order,
          round2(line.debit),
          round2(line.credit),
          line.memo,
        ]
      )
    }
  }

  async createEntry(organizationId: string, userId: string, input: EntryInput) {
    const total = await this.validateEntry(organizationId, input)
    const id = randomUUID()
    await this.db.withTransaction(async () => {
      // Numbered inside the transaction, so a refused entry never uses up a number.
      const counter = await this.db.query<Row>(
        `UPDATE accounting_books SET last_entry_number = last_entry_number + 1, updated_at = now()
          WHERE organization_id = $1 RETURNING last_entry_number`,
        [organizationId]
      )
      const reference = `JE-${String(num(counter.rows[0]?.last_entry_number)).padStart(6, "0")}`
      await this.db.query(
        `INSERT INTO accounting_entries
           (id, organization_id, workspace_id, entry_date, reference, description, source_type,
            source_id, total_amount, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          organizationId,
          input.workspaceId,
          input.date,
          reference,
          input.description,
          input.opening ? "opening" : "manual",
          // Its own id, so the one-entry-per-document rule never groups manual entries together.
          id,
          total,
          userId,
        ]
      )
      await this.writeLines(organizationId, id, input)
    })
    return this.getEntry(organizationId, id)
  }

  private async manualEntry(organizationId: string, id: string) {
    const entry = await this.getEntry(organizationId, id)
    if (!entry.editable) {
      throw ACCOUNTING_ERRORS.conflict(
        "ACCOUNTING_ENTRY_POSTED",
        "This entry was posted from a Madar document. Change the document instead."
      )
    }
    await this.assertOpen(organizationId, entry.date)
    return entry
  }

  async updateEntry(organizationId: string, id: string, input: EntryInput) {
    await this.manualEntry(organizationId, id)
    const total = await this.validateEntry(organizationId, input)
    await this.db.withTransaction(async () => {
      await this.db.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [id])
      await this.db.query(
        `UPDATE accounting_entries
            SET workspace_id = $3, entry_date = $4, description = $5, source_type = $6,
                total_amount = $7, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [
          organizationId,
          id,
          input.workspaceId,
          input.date,
          input.description,
          input.opening ? "opening" : "manual",
          total,
        ]
      )
      await this.writeLines(organizationId, id, input)
    })
    return this.getEntry(organizationId, id)
  }

  async deleteEntry(organizationId: string, id: string): Promise<void> {
    await this.manualEntry(organizationId, id)
    await this.db.query("DELETE FROM accounting_entries WHERE organization_id = $1 AND id = $2", [
      organizationId,
      id,
    ])
  }

  // ---- Statements ----

  async trialBalance(organizationId: string, range: ReportRange) {
    await this.ensureCurrent(organizationId)
    const totals = await this.totals(organizationId, range)
    const rows = (await this.accountRows(organizationId))
      .map((row) => {
        const sums = totals.get(String(row.id))
        const opening = sums ? sums.openDebit - sums.openCredit : 0
        const debit = sums?.periodDebit ?? 0
        const credit = sums?.periodCredit ?? 0
        const closing = opening + debit - credit
        return {
          account: mapAccount(row),
          // Opening and closing as debit-positive figures, split into their two columns.
          openingDebit: round2(Math.max(opening, 0)),
          openingCredit: round2(Math.max(-opening, 0)),
          debit: round2(debit),
          credit: round2(credit),
          closingDebit: round2(Math.max(closing, 0)),
          closingCredit: round2(Math.max(-closing, 0)),
        }
      })
      .filter(
        (row) =>
          row.openingDebit || row.openingCredit || row.debit || row.credit || row.account.isSystem
      )
    const sum = (
      key: "openingDebit" | "openingCredit" | "debit" | "credit" | "closingDebit" | "closingCredit"
    ) => round2(rows.reduce((total, row) => total + row[key], 0))
    return {
      from: range.from,
      to: range.to,
      rows,
      totals: {
        openingDebit: sum("openingDebit"),
        openingCredit: sum("openingCredit"),
        debit: sum("debit"),
        credit: sum("credit"),
        closingDebit: sum("closingDebit"),
        closingCredit: sum("closingCredit"),
      },
    }
  }

  async incomeStatement(organizationId: string, range: ReportRange) {
    await this.ensureCurrent(organizationId)
    const totals = await this.totals(organizationId, range)
    const accounts = await this.accountRows(organizationId)
    const section = (name: AccountSection) => {
      const lines = accounts
        .filter((row) => row.section === name)
        .map((row) => {
          const sums = totals.get(String(row.id))
          const net = sums ? sums.periodDebit - sums.periodCredit : 0
          // Revenue reads positive when credited; costs and expenses when debited.
          const amount = isDebitNormal(row.type as AccountType) ? net : -net
          return { account: mapAccount(row), amount: round2(amount) }
        })
        .filter((line) => line.amount !== 0)
      return { lines, total: round2(lines.reduce((sum, line) => sum + line.amount, 0)) }
    }
    const revenue = section("revenue")
    const costOfSales = section("cost_of_sales")
    const operatingExpenses = section("operating_expense")
    const otherIncome = section("other_income")
    const grossProfit = round2(revenue.total - costOfSales.total)
    return {
      from: range.from,
      to: range.to,
      revenue,
      costOfSales,
      grossProfit,
      operatingExpenses,
      otherIncome,
      netProfit: round2(grossProfit - operatingExpenses.total + otherIncome.total),
    }
  }

  async balanceSheet(organizationId: string, asOf: string, workspaceId?: string) {
    await this.ensureCurrent(organizationId)
    const totals = await this.totals(organizationId, { from: "1900-01-01", to: asOf, workspaceId })
    const accounts = await this.accountRows(organizationId)
    const balanceOf = (row: Row) => {
      const sums = totals.get(String(row.id))
      const net = sums ? sums.periodDebit - sums.periodCredit : 0
      return isDebitNormal(row.type as AccountType) ? net : -net
    }
    const section = (name: AccountSection) => {
      const lines = accounts
        .filter((row) => row.section === name)
        .map((row) => ({ account: mapAccount(row), amount: round2(balanceOf(row)) }))
        .filter((line) => line.amount !== 0)
      return { lines, total: round2(lines.reduce((sum, line) => sum + line.amount, 0)) }
    }
    // Profit to date sits in equity until a closing entry moves it to retained earnings.
    const earnings = round2(
      accounts.reduce((sum, row) => {
        if (row.type === "revenue") return sum + balanceOf(row)
        if (row.type === "expense") return sum - balanceOf(row)
        return sum
      }, 0)
    )
    const currentAssets = section("current_asset")
    const fixedAssets = section("fixed_asset")
    const currentLiabilities = section("current_liability")
    const longTermLiabilities = section("long_term_liability")
    const equity = section("equity")
    const totalAssets = round2(currentAssets.total + fixedAssets.total)
    const totalLiabilities = round2(currentLiabilities.total + longTermLiabilities.total)
    const totalEquity = round2(equity.total + earnings)
    return {
      asOf,
      currentAssets,
      fixedAssets,
      totalAssets,
      currentLiabilities,
      longTermLiabilities,
      totalLiabilities,
      equity,
      currentEarnings: earnings,
      totalEquity,
      totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquity),
    }
  }

  // One account's movements in a range, with the balance carried in and a running balance.
  async ledger(organizationId: string, accountId: string, range: ReportRange) {
    await this.ensureCurrent(organizationId)
    const account = await this.getAccount(organizationId, accountId)
    const debitNormal = isDebitNormal(account.type)
    const signed = (debit: number, credit: number) =>
      debitNormal ? debit - credit : credit - debit
    const totals = (await this.totals(organizationId, range)).get(accountId)
    const opening = totals ? signed(totals.openDebit, totals.openCredit) : 0
    const values: unknown[] = [organizationId, accountId, range.from, range.to]
    let branch = ""
    if (range.workspaceId) {
      values.push(range.workspaceId)
      branch = " AND l.workspace_id = $5"
    }
    const rows = await this.db.query<Row>(
      `SELECT l.id, l.entry_id, l.debit, l.credit, l.memo, l.line_order, e.entry_date,
              e.reference, e.description, e.source_type, e.created_at
         FROM accounting_entry_lines l
         JOIN accounting_entries e ON e.id = l.entry_id
        WHERE l.organization_id = $1 AND l.account_id = $2
          AND l.entry_date >= $3::date AND l.entry_date <= $4::date${branch}`,
      values
    )
    let balance = opening
    const lines = rows.rows
      .map((row) => ({
        id: String(row.id),
        entryId: String(row.entry_id),
        date: toDateString(row.entry_date as Date | string) ?? "",
        reference: String(row.reference),
        description: String(row.memo || row.description || ""),
        sourceType: String(row.source_type),
        debit: num(row.debit),
        credit: num(row.credit),
        createdAt: new Date(row.created_at as Date | string).toISOString(),
        order: num(row.line_order),
      }))
      .sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.order - right.order
      )
      .map(({ createdAt: _createdAt, order: _order, ...line }) => {
        balance += signed(line.debit, line.credit)
        return { ...line, balance: round2(balance) }
      })
    return {
      account,
      from: range.from,
      to: range.to,
      openingBalance: round2(opening),
      closingBalance: round2(balance),
      totalDebit: round2(totals?.periodDebit ?? 0),
      totalCredit: round2(totals?.periodCredit ?? 0),
      // The most recent movements when there are too many to show at once.
      lines: lines.slice(-LEDGER_LIMIT),
      truncated: lines.length > LEDGER_LIMIT,
    }
  }

  // What each customer owes (or supplier is owed) as of a day.
  async partyBalances(organizationId: string, type: PartyType, asOf: string) {
    await this.ensureCurrent(organizationId)
    const rows = await this.db.query<Row>(
      `SELECT party_id, SUM(debit) AS debit, SUM(credit) AS credit
         FROM accounting_entry_lines
        WHERE organization_id = $1 AND party_type = $2 AND entry_date <= $3::date
        GROUP BY party_id`,
      [organizationId, type, asOf]
    )
    const names = await this.db.query<Row>(
      type === "customer"
        ? "SELECT id, name FROM customers WHERE organization_id = $1"
        : "SELECT id, name FROM suppliers WHERE organization_id = $1",
      [organizationId]
    )
    const nameOf = new Map(names.rows.map((row) => [String(row.id), String(row.name ?? "")]))
    const items = rows.rows
      .map((row) => {
        const debit = num(row.debit)
        const credit = num(row.credit)
        return {
          partyId: String(row.party_id),
          name: nameOf.get(String(row.party_id)) ?? "",
          debit: round2(debit),
          credit: round2(credit),
          // A customer's balance is what they owe; a supplier's is what is owed to them.
          balance: round2(type === "customer" ? debit - credit : credit - debit),
        }
      })
      .filter((item) => item.balance !== 0)
      .sort((left, right) => right.balance - left.balance)
    return { type, asOf, items, total: round2(items.reduce((sum, item) => sum + item.balance, 0)) }
  }

  // VAT collected on sales against VAT paid on purchases and expenses, for a period.
  async vatSummary(organizationId: string, range: ReportRange) {
    await this.ensureCurrent(organizationId)
    const totals = await this.totals(organizationId, range)
    const accounts = await this.db.query<Row>(
      `SELECT id, system_key FROM accounting_accounts
        WHERE organization_id = $1 AND system_key IN ('vat_output', 'vat_input')`,
      [organizationId]
    )
    const movement = (key: string, side: "credit" | "debit") => {
      const id = accounts.rows.find((row) => row.system_key === key)?.id
      const sums = id ? totals.get(String(id)) : undefined
      if (!sums) return 0
      return side === "credit"
        ? sums.periodCredit - sums.periodDebit
        : sums.periodDebit - sums.periodCredit
    }
    const output = round2(movement("vat_output", "credit"))
    const input = round2(movement("vat_input", "debit"))
    return { from: range.from, to: range.to, output, input, due: round2(output - input) }
  }

  // The figures the app opens on.
  async overview(organizationId: string, range: ReportRange) {
    const income = await this.incomeStatement(organizationId, range)
    const sheet = await this.balanceSheet(organizationId, range.to, range.workspaceId)
    const vat = await this.vatSummary(organizationId, range)
    const settings = await this.getSettings(organizationId)
    const balances = new Map<string, number>()
    const keys = await this.db.query<Row>(
      "SELECT id, system_key FROM accounting_accounts WHERE organization_id = $1 AND system_key IS NOT NULL",
      [organizationId]
    )
    const keyOf = new Map(keys.rows.map((row) => [String(row.id), String(row.system_key)]))
    for (const section of [sheet.currentAssets, sheet.currentLiabilities]) {
      for (const line of section.lines) {
        const key = keyOf.get(line.account.id)
        if (key) balances.set(key, line.amount)
      }
    }
    return {
      from: range.from,
      to: range.to,
      revenue: income.revenue.total,
      costOfSales: income.costOfSales.total,
      grossProfit: income.grossProfit,
      expenses: income.operatingExpenses.total,
      netProfit: income.netProfit,
      cash: round2((balances.get("cash") ?? 0) + (balances.get("bank") ?? 0)),
      inSettlement: balances.get("card_clearing") ?? 0,
      receivable: balances.get("receivable") ?? 0,
      payable: balances.get("payable") ?? 0,
      inventory: balances.get("inventory") ?? 0,
      vatDue: vat.due,
      totalAssets: sheet.totalAssets,
      lockedThrough: settings.lockedThrough,
      lastSyncedAt: settings.lastSyncedAt,
    }
  }
}
