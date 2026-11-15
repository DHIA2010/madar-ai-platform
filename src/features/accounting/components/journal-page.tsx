"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"

import { presetRange, useAccountingAccess, useFormatters, useLoader } from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import { ENTRY_SOURCES, type EntryDetail } from "../types/accounting.types"
import { EntryDialog, EntryFormDialog } from "./entry-dialog"
import { AccountingPage, Empty, LoadFailed, Loading, RangeControl } from "./shell"
import { AMOUNT, FIELD, MUTED, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, TD, TH } from "./styles"

const PAGE_SIZE = 25

// Every journal entry, newest first: the ones Madar posted from documents and the manual ones.
export function JournalPage() {
  const t = useTranslations("accounting.journal")
  const tSource = useTranslations("accounting.sources")
  const { money, date } = useFormatters()
  const { canManage } = useAccountingAccess()
  const [range, setRange] = useState(() => presetRange("thisMonth"))
  const [sourceType, setSourceType] = useState("")
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  const [form, setForm] = useState<{ editing: EntryDetail | null; opening: boolean } | null>(null)

  // The search box applies after a short pause.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchText.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchText])

  const entries = useLoader(
    () =>
      accountingService.listEntries({
        from: range.from,
        to: range.to,
        sourceType,
        search,
        page,
        pageSize: PAGE_SIZE,
      }),
    `${range.from}|${range.to}|${sourceType}|${search}|${page}`
  )
  const accounts = useLoader(() => accountingService.listAccounts(), "accounts")
  const data = entries.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => setForm({ editing: null, opening: true })}
            >
              {t("openingBalances")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => setForm({ editing: null, opening: false })}
            >
              <Plus className="size-4" />
              {t("newEntry")}
            </button>
          </>
        ) : undefined
      }
    >
      <div className={cn(PANEL, "flex flex-wrap items-center gap-2 p-3.5")}>
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className={cn(FIELD, "w-full sm:w-64")}
        />
        <select
          aria-label={t("source")}
          value={sourceType}
          onChange={(event) => {
            setSourceType(event.target.value)
            setPage(1)
          }}
          className={cn(FIELD, "w-auto min-w-[170px]")}
        >
          <option value="">{t("allSources")}</option>
          {ENTRY_SOURCES.map((source) => (
            <option key={source} value={source}>
              {tSource(source)}
            </option>
          ))}
        </select>
        <RangeControl
          range={range}
          onChange={(next) => {
            setRange(next)
            setPage(1)
          }}
        />
      </div>

      {entries.failed ? (
        <LoadFailed onRetry={entries.reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div
          className={cn(
            PANEL,
            "overflow-hidden transition-opacity",
            entries.loading && "opacity-60"
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem]">
              <thead>
                <tr>
                  <th className={TH}>{t("date")}</th>
                  <th className={TH}>{t("reference")}</th>
                  <th className={TH}>{t("description")}</th>
                  <th className={TH}>{t("source")}</th>
                  <th className={cn(TH, "text-end")}>{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="cursor-pointer border-t border-[#eef1f6] hover:bg-[#f5fbf8]"
                    onClick={() => setOpenEntry(entry.id)}
                  >
                    <td className={cn(TD, "whitespace-nowrap")}>{date(entry.date)}</td>
                    <td className={cn(TD, AMOUNT, "font-semibold")}>{entry.reference}</td>
                    <td className={TD}>{entry.description || "—"}</td>
                    <td className={TD}>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
                          entry.sourceType === "manual" || entry.sourceType === "opening"
                            ? "bg-[#fff7e6] text-[#b45309]"
                            : "bg-[#ecfdf5] text-[#047857]"
                        )}
                      >
                        {tSource(entry.sourceType)}
                      </span>
                    </td>
                    <td className={cn(TD, AMOUNT, "text-end font-semibold")}>
                      {money(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 ? <Empty>{t("empty")}</Empty> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f6] px-4 py-3">
            <p className={cn("text-[12.5px]", MUTED)}>{t("count", { count: data.total })}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(SECONDARY_BUTTON, "h-9 px-3")}
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                {t("previous")}
              </button>
              <span className={cn("text-[12.5px]", MUTED, AMOUNT)}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className={cn(SECONDARY_BUTTON, "h-9 px-3")}
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                {t("next")}
              </button>
            </div>
          </div>
        </div>
      )}

      <EntryDialog
        entryId={openEntry}
        onClose={() => setOpenEntry(null)}
        onChanged={entries.reload}
        onEdit={(entry) => {
          setOpenEntry(null)
          setForm({ editing: entry, opening: entry.sourceType === "opening" })
        }}
      />
      <EntryFormDialog
        open={form !== null}
        editing={form?.editing ?? null}
        opening={form?.opening ?? false}
        accounts={accounts.data ?? []}
        onClose={() => setForm(null)}
        onSaved={entries.reload}
      />
    </AccountingPage>
  )
}
