import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { toDateString } from "../invoicing/shared"
import { DEFAULT_CHART, EXPENSE_CATEGORY_CODE_START, type SystemAccountKey } from "./chart"
import type { AccountRef, DraftEntry, SourceType } from "./postings"
import { loadDocuments } from "./sources"

// The posting pass: keeps one journal entry per source document in step with that document.
// It only ever touches entries it posted itself (never a manual one), leaves closed periods
// alone, and rewrites an entry only when its document actually changed.

const BATCH = 400
// A pass that died mid-way stops blocking the next one after this long.
const STALE_CLAIM_MS = 10 * 60 * 1000
// How far back a routine pass re-reads the high-volume documents, so nothing written while the
// previous pass was running is missed.
const CURSOR_OVERLAP_MS = 10 * 60 * 1000

type Row = Record<string, unknown>

export interface SyncResult {
  ran: boolean
  created: number
  updated: number
  removed: number
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size))
  return out
}

const placeholders = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => `$${offset + index + 1}`).join(", ")

// Makes sure the organization has its books row and every account of the starting chart. Safe to
// call any number of times: accounts are matched by their system key, then by code.
export async function ensureBooks(db: PostgresDatabase, organizationId: string): Promise<void> {
  await db.query(
    `INSERT INTO accounting_books (organization_id) VALUES ($1)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId]
  )
  const existing = await db.query<Row>(
    "SELECT code, system_key FROM accounting_accounts WHERE organization_id = $1",
    [organizationId]
  )
  const codes = new Set(existing.rows.map((row) => String(row.code)))
  const keys = new Set(
    existing.rows
      .map((row) => row.system_key)
      .filter(Boolean)
      .map(String)
  )
  for (const account of DEFAULT_CHART) {
    // A system account is needed whatever happened to its number; a plain one is seeded once,
    // and only into a chart that hasn't been started yet.
    if (account.systemKey ? keys.has(account.systemKey) : existing.rows.length > 0) continue
    let code = account.code
    while (codes.has(code)) code = String(Number(code) + 1)
    codes.add(code)
    await db.query(
      `INSERT INTO accounting_accounts
         (id, organization_id, code, name_ar, name_en, type, section, system_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [
        randomUUID(),
        organizationId,
        code,
        account.nameAr,
        account.nameEn,
        account.type,
        account.section,
        account.systemKey ?? null,
      ]
    )
  }
}

// Resolves the accounts the entries name by role. An expense category gets its own account the
// first time one of its expenses is posted.
export class AccountResolver {
  private byKey = new Map<string, string>()
  private codes = new Set<string>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly organizationId: string
  ) {}

  async load(): Promise<void> {
    const rows = await this.db.query<Row>(
      "SELECT id, code, system_key FROM accounting_accounts WHERE organization_id = $1",
      [this.organizationId]
    )
    for (const row of rows.rows) {
      this.codes.add(String(row.code))
      if (row.system_key) this.byKey.set(String(row.system_key), String(row.id))
    }
  }

  async idFor(ref: AccountRef): Promise<string> {
    const known = this.byKey.get(ref)
    if (known) return known
    if (!ref.startsWith("expense_category:")) {
      // The chart is seeded before any pass, so a missing system account means it was removed
      // behind the app's back: fall back to general expenses rather than lose the entry.
      const fallback = this.byKey.get("general_expenses" satisfies SystemAccountKey)
      if (!fallback) throw new Error(`accounting: no account for ${ref}`)
      return fallback
    }
    const categoryId = ref.slice("expense_category:".length)
    const category = await this.db.query<Row>(
      "SELECT name FROM expense_categories WHERE id = $1 AND organization_id = $2",
      [categoryId, this.organizationId]
    )
    const name = String(category.rows[0]?.name ?? "مصروفات")
    let code = EXPENSE_CATEGORY_CODE_START
    while (this.codes.has(String(code))) code += 1
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO accounting_accounts
         (id, organization_id, code, name_ar, name_en, type, section, system_key)
       VALUES ($1, $2, $3, $4, $5, 'expense', 'operating_expense', $6)
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [id, this.organizationId, String(code), name, name, ref]
    )
    // Another pass may have created it in the meantime: read back whichever row won.
    const saved = await this.db.query<Row>(
      "SELECT id, code FROM accounting_accounts WHERE organization_id = $1 AND system_key = $2",
      [this.organizationId, ref]
    )
    const savedId = String(saved.rows[0]?.id ?? id)
    this.codes.add(String(saved.rows[0]?.code ?? code))
    this.byKey.set(ref, savedId)
    return savedId
  }
}

interface ExistingEntry {
  id: string
  hash: string | null
  cogs: number | null
  date: string
}

async function loadExisting(
  db: PostgresDatabase,
  organizationId: string,
  types: SourceType[],
  ids: string[] | null
): Promise<Map<string, ExistingEntry>> {
  const found = new Map<string, ExistingEntry>()
  if (types.length === 0) return found
  const read = async (sql: string, values: unknown[]) => {
    const rows = await db.query<Row>(sql, values)
    for (const row of rows.rows) {
      const meta = (row.meta as { cogs?: number } | null) ?? {}
      found.set(`${row.source_type}:${row.source_id}`, {
        id: String(row.id),
        hash: row.source_hash ? String(row.source_hash) : null,
        cogs: typeof meta.cogs === "number" ? meta.cogs : null,
        date: toDateString(row.entry_date as Date | string) ?? "",
      })
    }
  }
  const base = `SELECT id, source_type, source_id, source_hash, meta, entry_date
                  FROM accounting_entries
                 WHERE organization_id = $1 AND source_type IN (${placeholders(types.length, 1)})`
  if (ids === null) {
    await read(base, [organizationId, ...types])
    return found
  }
  for (const group of chunks(ids, BATCH)) {
    await read(`${base} AND source_id IN (${placeholders(group.length, 1 + types.length)})`, [
      organizationId,
      ...types,
      ...group,
    ])
  }
  return found
}

async function writeEntry(
  db: PostgresDatabase,
  organizationId: string,
  resolver: AccountResolver,
  draft: DraftEntry,
  existingId: string | null
): Promise<void> {
  const id = existingId ?? randomUUID()
  const total = draft.lines.reduce((sum, line) => sum + line.debit, 0) / 100
  const meta = JSON.stringify({ cogs: draft.cogs })
  if (existingId) {
    await db.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [id])
    await db.query(
      `UPDATE accounting_entries
          SET workspace_id = $2, entry_date = $3, reference = $4, description = $5,
              source_hash = $6, meta = $7::jsonb, total_amount = $8, updated_at = now()
        WHERE id = $1`,
      [
        id,
        draft.workspaceId,
        draft.date,
        draft.reference,
        draft.description,
        draft.hash,
        meta,
        total,
      ]
    )
  } else {
    await db.query(
      `INSERT INTO accounting_entries
         (id, organization_id, workspace_id, entry_date, reference, description, source_type,
          source_id, source_hash, meta, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        id,
        organizationId,
        draft.workspaceId,
        draft.date,
        draft.reference,
        draft.description,
        draft.sourceType,
        draft.sourceId,
        draft.hash,
        meta,
        total,
      ]
    )
  }
  const values: unknown[] = []
  const rows: string[] = []
  for (const [order, line] of draft.lines.entries()) {
    const offset = values.length
    rows.push(`(${placeholders(11, offset)})`)
    values.push(
      randomUUID(),
      id,
      organizationId,
      await resolver.idFor(line.account),
      draft.date,
      draft.workspaceId,
      order,
      line.debit / 100,
      line.credit / 100,
      line.party?.type ?? null,
      line.party?.id ?? null
    )
  }
  if (rows.length > 0) {
    await db.query(
      `INSERT INTO accounting_entry_lines
         (id, entry_id, organization_id, account_id, entry_date, workspace_id, line_order, debit,
          credit, party_type, party_id)
       VALUES ${rows.join(", ")}`,
      values
    )
  }
}

async function removeEntries(db: PostgresDatabase, ids: string[]): Promise<void> {
  for (const group of chunks(ids, BATCH)) {
    // The lines go with their entry (on delete cascade).
    await db.query(
      `DELETE FROM accounting_entries WHERE id IN (${placeholders(group.length)})`,
      group
    )
  }
}

// Runs one posting pass for the organization. `full` re-reads every document (the first pass,
// or "rebuild"); otherwise the high-volume documents are read from where the last pass stopped.
// Returns `ran: false` when another pass holds the claim.
export async function runPostingPass(
  db: PostgresDatabase,
  organizationId: string,
  options: { full?: boolean } = {}
): Promise<SyncResult> {
  await ensureBooks(db, organizationId)
  const startedAt = new Date()
  const claim = await db.query<Row>(
    `UPDATE accounting_books SET sync_started_at = $2, updated_at = now()
      WHERE organization_id = $1 AND (sync_started_at IS NULL OR sync_started_at < $3)
      RETURNING locked_through, sync_cursor`,
    [
      organizationId,
      startedAt.toISOString(),
      new Date(startedAt.getTime() - STALE_CLAIM_MS).toISOString(),
    ]
  )
  if (claim.rows.length === 0) return { ran: false, created: 0, updated: 0, removed: 0 }

  const result: SyncResult = { ran: true, created: 0, updated: 0, removed: 0 }
  try {
    const lockedThrough = toDateString(claim.rows[0].locked_through as Date | string | null)
    const cursor = claim.rows[0].sync_cursor as Date | string | null
    const since =
      options.full || !cursor
        ? null
        : new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString()
    const closed = (date: string) => lockedThrough !== null && date <= lockedThrough

    const loaded = await loadDocuments(db, organizationId, since)
    const windowedTypes: SourceType[] = ["pos_invoice", "pos_return", "online_order"]
    const existing = await loadExisting(db, organizationId, loaded.wholeTypes, null)
    const windowedIds = [
      ...loaded.documents.filter((doc) => windowedTypes.includes(doc.type)).map((doc) => doc.id),
      ...loaded.removed.map((doc) => doc.id),
    ]
    for (const [key, entry] of await loadExisting(
      db,
      organizationId,
      windowedTypes,
      since === null ? null : windowedIds
    )) {
      existing.set(key, entry)
    }

    const resolver = new AccountResolver(db, organizationId)
    await resolver.load()

    const seen = new Set<string>()
    for (const group of chunks(loaded.documents, BATCH)) {
      // One transaction per batch: an entry and its lines are never half-written.
      await db.withTransaction(async () => {
        for (const document of group) {
          const key = `${document.type}:${document.id}`
          seen.add(key)
          const current = existing.get(key)
          const draft = document.build(current?.cogs ?? null)
          if (current) {
            if (current.hash === draft.hash) continue
            // A document changed after its period was closed: the closed books stay as they are.
            if (closed(current.date) || closed(draft.date)) continue
            await writeEntry(db, organizationId, resolver, draft, current.id)
            result.updated += 1
          } else {
            if (closed(draft.date)) continue
            await writeEntry(db, organizationId, resolver, draft, null)
            result.created += 1
          }
        }
      })
    }

    // Entries whose document is gone: cancelled (read in this pass), or -- for the kinds read
    // whole -- simply no longer there.
    const gone: string[] = []
    for (const document of loaded.removed) {
      const entry = existing.get(`${document.type}:${document.id}`)
      if (entry && !closed(entry.date)) gone.push(entry.id)
    }
    for (const [key, entry] of existing) {
      const type = key.slice(0, key.indexOf(":")) as SourceType
      const readWhole = loaded.wholeTypes.includes(type) || since === null
      if (readWhole && !seen.has(key) && !closed(entry.date) && !gone.includes(entry.id)) {
        gone.push(entry.id)
      }
    }
    await removeEntries(db, gone)
    result.removed = gone.length

    await db.query(
      `UPDATE accounting_books
          SET sync_started_at = NULL, last_synced_at = now(), sync_cursor = $2, updated_at = now()
        WHERE organization_id = $1`,
      [organizationId, startedAt.toISOString()]
    )
    return result
  } catch (error) {
    // Release the claim so the next pass can try again straight away.
    await db
      .query("UPDATE accounting_books SET sync_started_at = NULL WHERE organization_id = $1", [
        organizationId,
      ])
      .catch(() => undefined)
    throw error
  }
}
