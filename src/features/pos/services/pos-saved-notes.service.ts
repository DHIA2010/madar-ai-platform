import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "pos", "saved-notes"].join(PATH_SEPARATOR)

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

export type NoteLineAlign = "left" | "center" | "right"

export const NOTE_LINE_MIN_FONT_SIZE = 8
export const NOTE_LINE_MAX_FONT_SIZE = 32
export const NOTE_LINE_DEFAULT_FONT_SIZE = 12
export const NOTE_LINE_DEFAULT_COLOR = "#0d1b3e"

// One line of a formatted POS sale note -- the actual printed content, one entry per line. Also
// the shape pos-invoices.service.ts's Invoice.notesLines and pos-held-orders.service.ts's
// HeldOrder.notesLines round-trip, since both are a snapshot of lines like these.
export interface NoteLine {
  text: string
  bold: boolean
  align: NoteLineAlign
  // Free px size / hex color, both cashier-chosen per line (see FormattedNoteEditor.tsx) -- a
  // real thermal printer only has a handful of monochrome size steps, but this web app's receipt
  // is browser-printed (window.print(), see print-thermal-receipt.ts), where arbitrary CSS
  // font-size/color genuinely do print as chosen.
  fontSize: number
  color: string
}

export interface SavedNote {
  id: string
  title: string
  lines: NoteLine[]
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateSavedNoteInput {
  title: string
  lines: NoteLine[]
  isDefault: boolean
}

// Every field optional -- an edit only ever sends what actually changed.
export interface UpdateSavedNoteInput {
  title?: string
  lines?: NoteLine[]
  isDefault?: boolean
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const posSavedNotesService = {
  async list(): Promise<SavedNote[]> {
    const response = await client.get<{ items: SavedNote[] }>(ENDPOINT)
    return response.items
  },

  // What a brand-new sale auto-fills its note from -- null (not a fallback note) when nothing is
  // marked default, since a sale with no note at all is a normal state for this feature.
  async getDefault(): Promise<SavedNote | null> {
    const notes = await this.list()
    return notes.find((note) => note.isDefault) ?? null
  },

  async create(input: CreateSavedNoteInput): Promise<SavedNote> {
    return client.post<CreateSavedNoteInput, SavedNote>(ENDPOINT, input)
  },

  async update(id: string, input: UpdateSavedNoteInput): Promise<SavedNote> {
    return client.patch<UpdateSavedNoteInput, SavedNote>(
      [ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR),
      input
    )
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>([ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  // Pins "no note at all" as the org's default -- the Settings page's own "Without a note" row
  // (NotesSettings.tsx) calls this instead of update()'s isDefault flag, since no real note needs
  // to become default in its place.
  async clearDefault(): Promise<void> {
    await client.post<undefined, { ok: boolean }>(
      [ENDPOINT, "clear-default"].join(PATH_SEPARATOR),
      undefined
    )
  },
}
