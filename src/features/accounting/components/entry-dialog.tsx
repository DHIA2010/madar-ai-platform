"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog } from "@/components/app"

import {
  today,
  useAccountingAccess,
  useAccountingError,
  useFormatters,
} from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import type { Account, EntryDetail, EntryInput } from "../types/accounting.types"
import { Loading } from "./shell"
import {
  ACCOUNT_CODE,
  AMOUNT,
  FIELD,
  FIELD_LABEL,
  MUTED,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TH,
} from "./styles"

import { type Locale, localeDirection } from "@/i18n/locales"

// One journal entry, read-only: its lines, and (for an entry a person wrote) edit and delete.
export function EntryDialog({
  entryId,
  onClose,
  onChanged,
  onEdit,
}: {
  entryId: string | null
  onClose: () => void
  onChanged: () => void
  onEdit?: (entry: EntryDetail) => void
}) {
  const t = useTranslations("accounting.entry")
  const tSource = useTranslations("accounting.sources")
  const locale = useLocale() as Locale
  const { money, date, accountName } = useFormatters()
  const { canManage } = useAccountingAccess()
  const errorText = useAccountingError()
  const [entry, setEntry] = useState<EntryDetail | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!entryId) return
    let active = true
    accountingService
      .getEntry(entryId)
      .then((loaded) => {
        if (active) setEntry(loaded)
      })
      .catch((error) => {
        if (active) toast.error(errorText(error))
      })
    return () => {
      active = false
    }
  }, [entryId, errorText])

  // A previous entry is never shown for a new one.
  const shown = entry && entry.id === entryId ? entry : null

  async function remove() {
    if (!shown) return
    setDeleting(true)
    try {
      await accountingService.deleteEntry(shown.id)
      toast.success(t("deleted"))
      onChanged()
      onClose()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppDialog
      open={entryId !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={<span dir={localeDirection(locale)}>{shown?.reference ?? t("title")}</span>}
      description={
        shown ? (
          <span dir={localeDirection(locale)}>
            {date(shown.date)} · {tSource(shown.sourceType)}
            {shown.description ? ` · ${shown.description}` : ""}
          </span>
        ) : undefined
      }
      contentClassName="max-w-[48rem] gap-4 p-6"
      footer={
        <div dir={localeDirection(locale)} className="flex w-full flex-wrap justify-end gap-2">
          {shown?.editable && canManage ? (
            <>
              <button
                type="button"
                className={cn(SECONDARY_BUTTON, "text-[#dc2626]")}
                onClick={remove}
                disabled={deleting}
              >
                <Trash2 className="size-4" />
                {t("delete")}
              </button>
              {onEdit ? (
                <button type="button" className={SECONDARY_BUTTON} onClick={() => onEdit(shown)}>
                  {t("edit")}
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" className={PRIMARY_BUTTON} onClick={onClose}>
            {t("close")}
          </button>
        </div>
      }
    >
      {!shown ? (
        <Loading />
      ) : (
        <div dir={localeDirection(locale)} className="overflow-x-auto">
          {!shown.editable ? (
            <p className="mb-3 rounded-[12px] bg-[#f5fbf8] px-3.5 py-2.5 text-[12.5px] text-[#065f46]">
              {t("postedNote")}
            </p>
          ) : null}
          <table className="w-full min-w-[30rem] overflow-hidden rounded-[12px]">
            <thead>
              <tr>
                <th className={TH}>{t("account")}</th>
                <th className={cn(TH, "text-end")}>{t("debit")}</th>
                <th className={cn(TH, "text-end")}>{t("credit")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.lines.map((line) => (
                <tr key={line.id} className="border-t border-[#eef1f6]">
                  <td className={TD}>
                    <span className={ACCOUNT_CODE}>{line.accountCode}</span>
                    {accountName({ nameAr: line.accountNameAr, nameEn: line.accountNameEn })}
                    {line.memo ? (
                      <span className={cn("block text-[11.5px]", MUTED)}>{line.memo}</span>
                    ) : null}
                  </td>
                  <td className={cn(TD, AMOUNT, "text-end")}>
                    {line.debit ? money(line.debit) : "—"}
                  </td>
                  <td className={cn(TD, AMOUNT, "text-end")}>
                    {line.credit ? money(line.credit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#d9e0ec] bg-[#f7f9fc]">
                <td className={cn(TD, "font-extrabold")}>{t("total")}</td>
                <td className={cn(TD, AMOUNT, "text-end font-extrabold")}>{money(shown.amount)}</td>
                <td className={cn(TD, AMOUNT, "text-end font-extrabold")}>{money(shown.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </AppDialog>
  )
}

interface DraftLine {
  key: number
  accountId: string
  debit: string
  credit: string
  memo: string
}

let nextLineKey = 1
const blankLine = (): DraftLine => ({
  key: nextLineKey++,
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
})
const amountOf = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0
}

// Writing a journal entry by hand: any number of lines, saved only when debits equal credits.
export function EntryFormDialog({
  open,
  editing,
  opening,
  accounts,
  onClose,
  onSaved,
}: {
  open: boolean
  // The entry being changed, or null for a new one.
  editing: EntryDetail | null
  // A new entry that records opening balances.
  opening: boolean
  accounts: Account[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations("accounting.entry")
  const locale = useLocale() as Locale
  const { money, accountName } = useFormatters()
  const errorText = useAccountingError()
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState("")
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine(), blankLine()])
  const [saving, setSaving] = useState(false)

  // Starts from the entry being edited, or from a blank one, each time the dialog opens.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setDate(editing.date)
      setDescription(editing.description)
      setLines(
        editing.lines.map((line) => ({
          key: nextLineKey++,
          accountId: line.accountId,
          debit: line.debit ? String(line.debit) : "",
          credit: line.credit ? String(line.credit) : "",
          memo: line.memo,
        }))
      )
    } else {
      setDate(today())
      setDescription("")
      setLines([blankLine(), blankLine()])
    }
  }, [open, editing])

  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const filled = lines.filter(
    (line) => line.accountId && (amountOf(line.debit) > 0 || amountOf(line.credit) > 0)
  )
  const totalDebit = filled.reduce((sum, line) => sum + amountOf(line.debit), 0)
  const totalCredit = filled.reduce((sum, line) => sum + amountOf(line.credit), 0)
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100
  const ready = filled.length >= 2 && difference === 0 && totalDebit > 0
  const active = accounts.filter((account) => account.isActive)

  async function save() {
    const input: EntryInput = {
      date,
      description: description.trim(),
      opening: editing ? editing.sourceType === "opening" : opening,
      workspaceId: null,
      lines: filled.map((line) => ({
        accountId: line.accountId,
        debit: amountOf(line.debit),
        credit: amountOf(line.credit),
        memo: line.memo.trim(),
      })),
    }
    setSaving(true)
    try {
      if (editing) await accountingService.updateEntry(editing.id, input)
      else await accountingService.createEntry(input)
      toast.success(t("saved"))
      onSaved()
      onClose()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  const isOpening = editing ? editing.sourceType === "opening" : opening

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={
        <span dir={localeDirection(locale)}>
          {editing ? t("editTitle") : isOpening ? t("openingTitle") : t("newTitle")}
        </span>
      }
      description={
        <span dir={localeDirection(locale)}>{isOpening ? t("openingHint") : t("newHint")}</span>
      }
      contentClassName="max-w-[56rem] gap-4 p-6"
      footer={
        <div
          dir={localeDirection(locale)}
          className="flex w-full flex-wrap items-center justify-between gap-3"
        >
          <p className="text-[13px]">
            <span className={MUTED}>{t("totals")} </span>
            <span className={cn("font-bold", AMOUNT)}>{money(totalDebit)}</span>
            <span className={MUTED}> / </span>
            <span className={cn("font-bold", AMOUNT)}>{money(totalCredit)}</span>
            {difference !== 0 ? (
              <span className="ms-2 font-semibold text-[#dc2626]">
                {t("difference", { amount: money(Math.abs(difference)) })}
              </span>
            ) : filled.length >= 2 ? (
              <span className="ms-2 font-semibold text-[#047857]">{t("balanced")}</span>
            ) : null}
          </p>
          <div className="flex gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={save}
              disabled={!ready || saving}
            >
              {t("save")}
            </button>
          </div>
        </div>
      }
    >
      <div dir={localeDirection(locale)} className="flex flex-col gap-4 overflow-y-auto">
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <label>
            <span className={FIELD_LABEL}>{t("date")}</span>
            <input
              type="date"
              value={date}
              onChange={(event) => event.target.value && setDate(event.target.value)}
              className={FIELD}
            />
          </label>
          <label>
            <span className={FIELD_LABEL}>{t("description")}</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("descriptionPlaceholder")}
              maxLength={500}
              className={FIELD}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem]">
            <thead>
              <tr>
                <th className={TH}>{t("account")}</th>
                <th className={cn(TH, "w-32")}>{t("debit")}</th>
                <th className={cn(TH, "w-32")}>{t("credit")}</th>
                <th className={TH}>{t("memo")}</th>
                <th className={cn(TH, "w-10")} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-[#eef1f6]">
                  <td className="p-1.5">
                    <select
                      aria-label={t("account")}
                      value={line.accountId}
                      onChange={(event) => update(line.key, { accountId: event.target.value })}
                      className={cn(FIELD, "h-10")}
                    >
                      <option value="">{t("pickAccount")}</option>
                      {active.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {accountName(account)}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(["debit", "credit"] as const).map((side) => (
                    <td key={side} className="p-1.5">
                      <input
                        aria-label={t(side)}
                        inputMode="decimal"
                        value={line[side]}
                        // A line is one side only: typing in one clears the other.
                        onChange={(event) =>
                          update(line.key, {
                            [side]: event.target.value.replace(/[^0-9.]/g, ""),
                            [side === "debit" ? "credit" : "debit"]: "",
                          })
                        }
                        placeholder="0.00"
                        className={cn(FIELD, "h-10 text-end", AMOUNT)}
                      />
                    </td>
                  ))}
                  <td className="p-1.5">
                    <input
                      aria-label={t("memo")}
                      value={line.memo}
                      onChange={(event) => update(line.key, { memo: event.target.value })}
                      maxLength={300}
                      className={cn(FIELD, "h-10")}
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <button
                      type="button"
                      aria-label={t("removeLine")}
                      disabled={lines.length <= 2}
                      onClick={() =>
                        setLines((current) => current.filter((item) => item.key !== line.key))
                      }
                      className="rounded-lg p-2 text-[#8a97ad] hover:bg-[#fef1f1] hover:text-[#dc2626] disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className={cn(SECONDARY_BUTTON, "h-10 w-fit")}
          onClick={() => setLines((current) => [...current, blankLine()])}
        >
          <Plus className="size-4" />
          {t("addLine")}
        </button>
      </div>
    </AppDialog>
  )
}
