"use client"

// ملاحظات البيع -- a small reusable library of formatted sale notes for the cashier screen's
// Note dialog (see FormattedNoteEditor.tsx, saved-notes-service.ts). Exactly one note is ever the
// default (DB-level partial unique index, same pattern as tax_rates -- see TaxesSettings.tsx,
// which this page mirrors) -- that is the note CashierPage.tsx auto-fills into every new sale.

import { useCallback, useEffect, useState } from "react"
import { Loader2, Pencil, Plus, RotateCcw, StickyNote, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import {
  posSavedNotesService,
  type NoteLine,
  type SavedNote,
} from "@/features/pos/services/pos-saved-notes.service"
import { FormattedNoteEditor } from "@/features/pos/components/FormattedNoteEditor"
import { NoteLines } from "@/features/pos/components/NoteLines"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"

type NotesTranslator = ReturnType<typeof useTranslations<"settings.notes">>

function dateFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface Draft {
  title: string
  lines: NoteLine[]
  isDefault: boolean
}
const EMPTY_DRAFT: Draft = {
  title: "",
  lines: [],
  isDefault: false,
}
function buildDraft(note: SavedNote | null): Draft {
  if (!note) return EMPTY_DRAFT
  return { title: note.title, lines: note.lines, isDefault: note.isDefault }
}

export default function NotesSettings() {
  const t = useTranslations("settings.notes")
  const locale = useLocale() as Locale

  const [notes, setNotes] = useState<SavedNote[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SavedNote | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [pendingDelete, setPendingDelete] = useState<SavedNote | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setNotes(await posSavedNotesService.list())
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("loadError.forbidden") : t("loadError.generic"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const failed = (error: unknown, fallback: string) => {
    const status = error instanceof AppError ? error.status : undefined
    toast.error(status === 403 ? t("toasts.forbiddenManage") : fallback, {
      description: status === 403 ? t("toasts.forbiddenDescription") : undefined,
    })
  }

  const validateDraft = (value: Draft): NoteLine[] | null => {
    if (!value.title.trim()) {
      toast.error(t("validation.titleRequired"))
      return null
    }
    const lines = value.lines.filter((line) => line.text.trim().length > 0)
    if (lines.length === 0) {
      toast.error(t("validation.linesRequired"))
      return null
    }
    return lines
  }

  const submitCreate = async () => {
    const lines = validateDraft(draft)
    if (!lines) return

    setBusyId("new")
    try {
      await posSavedNotesService.create({
        title: draft.title.trim(),
        lines,
        isDefault: draft.isDefault,
      })
      toast.success(t("toasts.added"))
      setCreating(false)
      setDraft(EMPTY_DRAFT)
      await load()
    } catch (error) {
      failed(error, t("toasts.addFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const submitEdit = async () => {
    if (!editing) return
    const lines = validateDraft(draft)
    if (!lines) return

    setBusyId(editing.id)
    try {
      await posSavedNotesService.update(editing.id, {
        title: draft.title.trim(),
        lines,
        isDefault: draft.isDefault,
      })
      toast.success(t("toasts.saved"))
      setEditing(null)
      await load()
    } catch (error) {
      failed(error, t("toasts.saveFailed"))
    } finally {
      setBusyId(null)
    }
  }

  // Pins "no note at all" as the org's default -- the counterpart to marking a real note default,
  // for an org that wants every new sale to start truly empty. See saved-notes-service.ts's
  // clearDefault() for why this bypasses update()'s usual "a different row must replace it" rule.
  const pinNoNote = async () => {
    setBusyId("none")
    try {
      await posSavedNotesService.clearDefault()
      toast.success(t("toasts.defaultCleared"))
      await load()
    } catch (error) {
      failed(error, t("toasts.saveFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async () => {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    try {
      await posSavedNotesService.remove(pendingDelete.id)
      toast.success(t("toasts.deleted"))
      setPendingDelete(null)
      await load()
    } catch (error) {
      const code = error instanceof AppError ? error.code : undefined
      failed(
        error,
        code === "SAVED_NOTE_CANNOT_DELETE_DEFAULT"
          ? t("toasts.deleteFailedDefault")
          : t("toasts.deleteFailedGeneric")
      )
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}>
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          {t("retry")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5" dir={localeDirection(locale)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
        </div>

        <Button
          className="h-auto gap-2 rounded-[10px] bg-[#2563eb] px-[18px] py-2.5 text-[13px] font-bold text-white hover:bg-[#1d4ed8]"
          onClick={() => {
            setDraft(EMPTY_DRAFT)
            setCreating(true)
          }}
        >
          <Plus className="size-4" />
          {t("addNote")}
        </Button>
      </div>

      {/* The counterpart to a real note's own "Default" badge below -- always present, since
          "no note at all" is always one of the choices the cashier's picker offers (see
          CashierPage.tsx's own "Without a note" option), and an org can pin it here the same way
          it pins a real note. */}
      <div
        className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 border-dashed p-4")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[13px] font-bold italic", HEADING)}>
            {t("withoutNote.title")}
          </span>
          <span className={cn("text-[11.5px]", MUTED)}>{t("withoutNote.hint")}</span>
        </div>
        {notes.some((note) => note.isDefault) ? (
          <Button
            variant="outline"
            className="h-9 rounded-[8px] px-3 text-[12px] font-semibold"
            disabled={busyId !== null}
            onClick={() => void pinNoNote()}
          >
            {busyId === "none" ? t("dialog.saving") : t("withoutNote.pinAction")}
          </Button>
        ) : (
          <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10.5px] font-bold text-[#2878ff]">
            {t("table.defaultBadge")}
          </span>
        )}
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        {notes.length === 0 ? (
          <div
            className={cn("flex flex-col items-center gap-2 p-10 text-center text-[13px]", MUTED)}
          >
            <StickyNote className="size-6" />
            {t("empty")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-center">
              <thead>
                <tr className="bg-[#f1f5fc]">
                  {[
                    { key: "title", label: t("table.columns.title"), align: "text-right" },
                    { key: "preview", label: t("table.columns.preview"), align: "text-right" },
                    { key: "lines", label: t("table.columns.lines"), align: "text-center" },
                    { key: "updated", label: t("table.columns.updated"), align: "text-center" },
                    { key: "actions", label: t("table.columns.actions"), align: "text-center" },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap border-b border-[#e8edf3] px-4 py-3 text-[12px] font-semibold",
                        MUTED,
                        column.align
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => {
                  const busy = busyId === note.id
                  return (
                    <tr key={note.id} className="border-b border-[#f0f3f8] last:border-0">
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 font-bold">
                          <span className={HEADING}>{note.title}</span>
                          {note.isDefault ? (
                            <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10.5px] font-bold text-[#2878ff]">
                              {t("table.defaultBadge")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-right">
                        <NoteLines
                          lines={note.lines}
                          plainText={null}
                          className="truncate text-[12px] text-[#5b6b85]"
                        />
                      </td>
                      <td className={cn("px-4 py-3 text-[12px]", MUTED)}>
                        {t("table.linesCountSuffix", { count: note.lines.length })}
                      </td>
                      <td className={cn("px-4 py-3 text-[12px]", MUTED)}>
                        {dateFormatter(locale).format(new Date(note.updatedAt))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            aria-label={t("table.editAria")}
                            className="flex size-8 items-center justify-center rounded-[8px] text-[#667085] transition-colors hover:bg-[#eef2f8] hover:text-[#0b1738]"
                            onClick={() => {
                              setEditing(note)
                              setDraft(buildDraft(note))
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("table.deleteAria")}
                            disabled={busy || note.isDefault}
                            className="flex size-8 items-center justify-center rounded-[8px] text-[#e0484d] transition-colors hover:bg-[#fdeeee] disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => setPendingDelete(note)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SavedNoteDialog
        open={creating}
        title={t("dialog.addTitle")}
        submitLabel={t("dialog.save")}
        savingLabel={t("dialog.saving")}
        cancelLabel={t("dialog.cancel")}
        draft={draft}
        setDraft={setDraft}
        busy={busyId === "new"}
        locale={locale}
        t={t}
        onCancel={() => setCreating(false)}
        onSubmit={() => void submitCreate()}
      />

      <SavedNoteDialog
        open={editing !== null}
        title={t("dialog.editTitle")}
        submitLabel={t("dialog.saveChanges")}
        savingLabel={t("dialog.saving")}
        cancelLabel={t("dialog.cancel")}
        draft={draft}
        setDraft={setDraft}
        busy={editing !== null && busyId === editing.id}
        locale={locale}
        t={t}
        onCancel={() => setEditing(null)}
        onSubmit={() => void submitEdit()}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[26rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              {t("deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              {t.rich("deleteDialog.description", {
                name: pendingDelete?.title ?? "",
                b: (chunks) => <span className={cn("font-bold", HEADING)}>{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              className="bg-[#e0484d] text-white hover:bg-[#c93f44]"
              disabled={busyId !== null}
              onClick={() => void remove()}
            >
              {t("deleteDialog.confirm")}
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t("deleteDialog.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SavedNoteDialog({
  open,
  title,
  submitLabel,
  savingLabel,
  cancelLabel,
  draft,
  setDraft,
  busy,
  locale,
  t,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title: string
  submitLabel: string
  savingLabel: string
  cancelLabel: string
  draft: Draft
  setDraft: (next: Draft) => void
  busy: boolean
  locale: Locale
  t: NotesTranslator
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className={cn("sm:max-w-[30rem]", locale === "ar" ? "[direction:rtl]" : "[direction:ltr]")}
      >
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <div>
            <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
              {t("dialog.titleLabel")}
            </Label>
            <Input
              value={draft.title}
              placeholder={t("dialog.titlePlaceholder")}
              className={FIELD_CLASS}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </div>

          <div>
            <Label className={cn("mb-1.5 block text-[12.5px] font-bold", HEADING)}>
              {t("dialog.linesLabel")}
            </Label>
            <FormattedNoteEditor
              value={draft.lines}
              onChange={(lines) => setDraft({ ...draft, lines })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })}
              className="size-4 rounded border-[#c7d3e3] accent-[#2563eb]"
            />
            <span className={cn("text-[12.5px] font-semibold", HEADING)}>
              {t("dialog.setDefault")}
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="bg-[#2878ff] text-white hover:bg-[#1f66e0]"
            disabled={busy}
            onClick={onSubmit}
          >
            {busy ? savingLabel : submitLabel}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
