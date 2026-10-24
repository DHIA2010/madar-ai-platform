import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export const NOTE_LINE_ALIGNS = ["left", "center", "right"] as const
export type NoteLineAlign = (typeof NOTE_LINE_ALIGNS)[number]

export const NOTE_LINE_MIN_FONT_SIZE = 8
export const NOTE_LINE_MAX_FONT_SIZE = 32
export const NOTE_LINE_DEFAULT_FONT_SIZE = 12
export const NOTE_LINE_DEFAULT_COLOR = "#0d1b3e"

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export interface NoteLine {
  text: string
  bold: boolean
  align: NoteLineAlign
  // Free px size and hex color, both cashier-chosen per line (see FormattedNoteEditor.tsx) -- not
  // the identical thing a real thermal printer can render (monochrome, a handful of ESC/POS size
  // steps), but this is the web app's own browser-printed receipt (see print-thermal-receipt.ts's
  // window.print()), where arbitrary CSS font-size/color genuinely do print as chosen.
  fontSize: number
  color: string
}

const SAVED_NOTE_ERRORS = {
  notFound: () =>
    new IdentityError("SAVED_NOTE_NOT_FOUND", 404, "business", "Saved note not found."),
  cannotDeleteDefault: () =>
    new IdentityError(
      "SAVED_NOTE_CANNOT_DELETE_DEFAULT",
      409,
      "business",
      "Make another note the default before deleting this one."
    ),
  cannotUnsetDefault: () =>
    new IdentityError(
      "SAVED_NOTE_CANNOT_UNSET_DEFAULT",
      409,
      "business",
      "Make a different note the default instead of unsetting this one."
    ),
  validation: (fields: Record<string, string>) =>
    new IdentityError(
      "SAVED_NOTE_VALIDATION_FAILED",
      422,
      "validation",
      "Saved note is not valid.",
      {
        fields,
      }
    ),
}

export interface SavedNoteView {
  id: string
  title: string
  lines: NoteLine[]
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface SavedNoteInput {
  title: string
  lines: NoteLine[]
  isDefault: boolean
}

export interface UpdateSavedNoteInput {
  title?: string
  lines?: NoteLine[]
  isDefault?: boolean
}

interface SavedNoteRow {
  id: string
  title: string
  lines: unknown
  is_default: boolean
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// jsonb arrives parsed through node-postgres but as a string through some drivers and pg-mem --
// same handling as payment-methods-service.ts's toSettings(). Shared with invoices-service.ts/
// held-orders-service.ts's own notes_lines snapshot column, since both store this exact shape --
// missing/invalid fontSize/color (e.g. a line saved before that field existed) default rather
// than error, the same "never block on a stale shape" posture as every other jsonb reader here.
export function parseNoteLines(value: unknown): NoteLine[] {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown
          } catch {
            return null
          }
        })()
      : value

  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object"
    )
    .map((entry) => ({
      text: typeof entry.text === "string" ? entry.text : "",
      bold: Boolean(entry.bold),
      align: NOTE_LINE_ALIGNS.includes(entry.align as NoteLineAlign)
        ? (entry.align as NoteLineAlign)
        : "left",
      fontSize:
        typeof entry.fontSize === "number" &&
        entry.fontSize >= NOTE_LINE_MIN_FONT_SIZE &&
        entry.fontSize <= NOTE_LINE_MAX_FONT_SIZE
          ? entry.fontSize
          : NOTE_LINE_DEFAULT_FONT_SIZE,
      color:
        typeof entry.color === "string" && HEX_COLOR_PATTERN.test(entry.color)
          ? entry.color
          : NOTE_LINE_DEFAULT_COLOR,
    }))
}

function mapRow(row: SavedNoteRow): SavedNoteView {
  return {
    id: row.id,
    title: row.title,
    lines: parseNoteLines(row.lines),
    isDefault: row.is_default,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

const SAVED_NOTE_SELECT = `
  SELECT id, title, lines, is_default, created_at, updated_at
    FROM pos_saved_notes
`

export class PosSavedNotesService {
  constructor(private readonly database: PostgresDatabase) {}

  // Unlike TaxRatesService.list(), there is no lazy seeding here -- a brand-new organization with
  // zero saved notes is a perfectly normal state (see migration 110's own comment), so this is a
  // plain read.
  async list(organizationId: string): Promise<SavedNoteView[]> {
    const result = await this.database.query<SavedNoteRow>(
      `${SAVED_NOTE_SELECT} WHERE organization_id = $1 ORDER BY created_at ASC`,
      [organizationId]
    )
    return result.rows.map(mapRow)
  }

  // What CashierPage.tsx auto-fills a brand-new sale's note from -- null (not a fallback note)
  // when nothing is marked default, since a sale with no note at all is a normal state for this
  // feature, unlike tax rates where getDefaultRatePercent always needs a real number.
  async getDefault(organizationId: string): Promise<SavedNoteView | null> {
    const result = await this.database.query<SavedNoteRow>(
      `${SAVED_NOTE_SELECT} WHERE organization_id = $1 AND is_default LIMIT 1`,
      [organizationId]
    )
    const row = result.rows[0]
    return row ? mapRow(row) : null
  }

  // Pins "no note at all" as the org's default -- the Settings -> Sale notes page's own explicit
  // "Without a note" row (see NotesSettings.tsx), the same choice the cashier's Note dialog picker
  // already offers for one sale, now pinnable for every sale. Deliberately NOT routed through
  // update()'s cannotUnsetDefault guard: that guard exists so a real note is never left defaultless
  // by accident, but "no default note" is itself a perfectly normal, intentional resting state here
  // (unlike tax rates, which always need a real charged rate) -- a no-op if nothing was default.
  async clearDefault(organizationId: string): Promise<void> {
    await this.database.query(
      `UPDATE pos_saved_notes SET is_default = false, updated_at = now()
        WHERE organization_id = $1 AND is_default`,
      [organizationId]
    )
  }

  async create(organizationId: string, input: SavedNoteInput): Promise<SavedNoteView> {
    const fields = validate(input)
    if (Object.keys(fields).length > 0) throw SAVED_NOTE_ERRORS.validation(fields)

    const id = randomUUID()
    await this.database.withTransaction(async () => {
      if (input.isDefault) {
        await this.database.query(
          `UPDATE pos_saved_notes SET is_default = false, updated_at = now() WHERE organization_id = $1`,
          [organizationId]
        )
      }
      await this.database.query(
        `INSERT INTO pos_saved_notes (id, organization_id, title, lines, is_default)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [id, organizationId, input.title.trim(), JSON.stringify(input.lines), input.isDefault]
      )
    })

    const created = await this.findById(organizationId, id)
    if (!created) throw SAVED_NOTE_ERRORS.notFound()
    return created
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateSavedNoteInput
  ): Promise<SavedNoteView> {
    const existing = await this.findRow(organizationId, id)
    if (!existing) throw SAVED_NOTE_ERRORS.notFound()

    const next: SavedNoteInput = {
      title: input.title ?? existing.title,
      lines: input.lines ?? parseNoteLines(existing.lines),
      isDefault: input.isDefault ?? existing.is_default,
    }

    // Same "the only way to stop being default is a different row becoming default instead" rule
    // as TaxRatesService.update() -- see that file's own comment.
    if (existing.is_default && !next.isDefault) {
      throw SAVED_NOTE_ERRORS.cannotUnsetDefault()
    }

    const fields = validate(next)
    if (Object.keys(fields).length > 0) throw SAVED_NOTE_ERRORS.validation(fields)

    await this.database.withTransaction(async () => {
      if (next.isDefault && !existing.is_default) {
        await this.database.query(
          `UPDATE pos_saved_notes SET is_default = false, updated_at = now()
            WHERE organization_id = $1 AND id != $2`,
          [organizationId, id]
        )
      }
      await this.database.query(
        `UPDATE pos_saved_notes
            SET title = $3, lines = $4::jsonb, is_default = $5, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, next.title.trim(), JSON.stringify(next.lines), next.isDefault]
      )
    })

    const updated = await this.findById(organizationId, id)
    if (!updated) throw SAVED_NOTE_ERRORS.notFound()
    return updated
  }

  async delete(organizationId: string, id: string): Promise<void> {
    const existing = await this.findRow(organizationId, id)
    if (!existing) throw SAVED_NOTE_ERRORS.notFound()
    if (existing.is_default) throw SAVED_NOTE_ERRORS.cannotDeleteDefault()

    // No in-use check needed here, unlike tax_rates' inUseByProduct -- pos_invoices.notes_lines is
    // a snapshot, never a foreign key to this table (see migration 110's own comment).
    await this.database.query(
      `DELETE FROM pos_saved_notes WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
  }

  private async findRow(organizationId: string, id: string): Promise<SavedNoteRow | null> {
    const result = await this.database.query<SavedNoteRow>(
      `${SAVED_NOTE_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    return result.rows[0] ?? null
  }

  private async findById(organizationId: string, id: string): Promise<SavedNoteView | null> {
    const row = await this.findRow(organizationId, id)
    return row ? mapRow(row) : null
  }
}

function validate(input: SavedNoteInput): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!input.title.trim()) fields.title = "Title is required."
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    fields.lines = "At least one line is required."
  } else if (input.lines.length > 10) {
    fields.lines = "A note can have at most 10 lines."
  } else if (input.lines.some((line) => typeof line.text !== "string" || line.text.length > 100)) {
    fields.lines = "Each line must be 100 characters or fewer."
  } else if (
    input.lines.some(
      (line) => line.fontSize < NOTE_LINE_MIN_FONT_SIZE || line.fontSize > NOTE_LINE_MAX_FONT_SIZE
    )
  ) {
    fields.lines = `Font size must be between ${NOTE_LINE_MIN_FONT_SIZE} and ${NOTE_LINE_MAX_FONT_SIZE}.`
  } else if (input.lines.some((line) => !HEX_COLOR_PATTERN.test(line.color))) {
    fields.lines = "Each line's color must be a valid hex color."
  }
  return fields
}
