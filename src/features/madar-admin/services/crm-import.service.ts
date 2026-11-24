import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Bringing a file of leads into Madar Admin's CRM (/v1/platform-admin/crm/leads/import).
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin", "crm", "leads", "import"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export interface CrmImportRow {
  companyName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
}
export interface CrmImportResult {
  created: number
  duplicates: number
  invalid: number
}
type Column = keyof CrmImportRow

// The server takes up to 2,000 rows a request; a longer file goes up in pieces.
const PIECE = 1000

export const crmImportService = {
  // source: where the rows came from, when not a file (the prospect finder's two sources).
  async importLeads(
    tag: string,
    rows: CrmImportRow[],
    source?: "directory" | "google_maps"
  ): Promise<CrmImportResult> {
    const total: CrmImportResult = { created: 0, duplicates: 0, invalid: 0 }
    for (let start = 0; start < rows.length; start += PIECE) {
      const piece = await client.post<
        { tag: string; rows: CrmImportRow[]; source?: string },
        CrmImportResult
      >(ENDPOINT, { tag, rows: rows.slice(start, start + PIECE), ...(source ? { source } : {}) })
      total.created += piece.created
      total.duplicates += piece.duplicates
      total.invalid += piece.invalid
    }
    return total
  },
}

// ---- Reading the file in the browser ----

// Which of a file's columns holds what, guessed from its header (Arabic or English).
const HEADERS: Record<Column, RegExp> = {
  companyName: /شرك|مؤسس|نشاط|منشأ|متجر|محل|company|business|store|organi[sz]ation|^name$|^الاسم$/i,
  contactName: /مسؤول|مالك|شخص|contact|owner|person|full ?name|first ?name/i,
  phone: /جوال|هاتف|موبايل|رقم|تلفون|phone|mobile|tel|whatsapp|واتس/i,
  email: /بريد|ايميل|إيميل|e-?mail/i,
}

export interface ParsedLeadFile {
  headers: string[]
  rows: string[][]
  // For each kind of value, the index of the column guessed to hold it (or -1).
  guess: Record<Column, number>
}

export async function readLeadFile(file: File): Promise<ParsedLeadFile> {
  const XLSX = await import("xlsx")
  // A CSV is read as text so its Arabic comes through whatever the file's first bytes say.
  const book = /\.csv$/i.test(file.name)
    ? XLSX.read(await file.text(), { type: "string" })
    : XLSX.read(await file.arrayBuffer(), { type: "array" })
  const sheet = book.Sheets[book.SheetNames[0]]
  const table = (
    XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][]
  )
    .map((row) => row.map((value) => String(value ?? "").trim()))
    .filter((row) => row.some((value) => value !== ""))
  if (table.length === 0) return emptyFile()
  // The first row is a header unless it already looks like data (it carries a phone number).
  const firstIsData = table[0].some((value) => /^\+?[\d\s-]{8,}$/.test(value))
  const width = Math.max(...table.map((row) => row.length))
  const headers = firstIsData
    ? Array.from({ length: width }, (_, index) => `العمود ${index + 1}`)
    : Array.from({ length: width }, (_, index) => table[0][index] || `العمود ${index + 1}`)
  const rows = firstIsData ? table : table.slice(1)
  const guess = { companyName: -1, contactName: -1, phone: -1, email: -1 }
  const taken = new Set<number>()
  for (const column of ["phone", "email", "contactName", "companyName"] as Column[]) {
    const index = headers.findIndex((header, at) => !taken.has(at) && HEADERS[column].test(header))
    if (index >= 0) {
      guess[column] = index
      taken.add(index)
    }
  }
  // No header to go by: look at the values themselves.
  const sample = rows.slice(0, 20)
  const mostly = (index: number, test: RegExp) =>
    sample.length > 0 &&
    sample.filter((row) => test.test(row[index] ?? "")).length >= sample.length / 2
  for (let index = 0; index < width; index += 1) {
    if (taken.has(index)) continue
    if (guess.phone < 0 && mostly(index, /^\+?[\d\s-]{8,}$/)) {
      guess.phone = index
      taken.add(index)
    } else if (guess.email < 0 && mostly(index, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      guess.email = index
      taken.add(index)
    }
  }
  if (guess.companyName < 0) {
    const free = Array.from({ length: width }, (_, index) => index).find(
      (index) => !taken.has(index)
    )
    if (free !== undefined) guess.companyName = free
  }
  return { headers, rows, guess }
}

const emptyFile = (): ParsedLeadFile => ({
  headers: [],
  rows: [],
  guess: { companyName: -1, contactName: -1, phone: -1, email: -1 },
})

export function mapLeadRows(file: ParsedLeadFile, columns: Record<Column, number>): CrmImportRow[] {
  const pick = (row: string[], index: number, max: number) =>
    index >= 0 && row[index] ? row[index].slice(0, max) : null
  return file.rows.map((row) => ({
    companyName: pick(row, columns.companyName, 160),
    contactName: pick(row, columns.contactName, 160),
    phone: pick(row, columns.phone, 32),
    email: pick(row, columns.email, 254),
  }))
}
