"use client"

import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowLeft,
  ClipboardCheck,
  Hash,
  Loader2,
  Package,
  Save,
  ScanLine,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppConfirmDialog,
  AppDateField,
  AppInput,
  AppSearchableSelect,
} from "@/components/app"

import { type StockCount, stockCountService } from "../services/stock-count.service"
import { type BranchStockItem, stockTransferService } from "../services/stock-transfer.service"
import { FIELD_CLASS, formatQuantity, HEADING, MUTED, PANEL } from "./inventory-ui"
import { DifferenceValue, StockCountStatusBadge } from "./stock-counts-page"

import { type Locale, localeDirection } from "@/i18n/locales"

type RowFilter = "all" | "counted" | "uncounted" | "differences"

interface CountRow {
  productId: string
  name: string
  sku: string
  systemQuantity: number
  counted: string
  unitCost: number | null
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className={cn("block text-[12.5px] font-semibold", HEADING)}>
        {label}
        {required ? <span className="ms-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className={cn("text-[11.5px]", MUTED)}>{hint}</p> : null}
    </div>
  )
}

function parseCount(value: string): number | null {
  if (value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

// Inventory -> stock take: count a branch's products, save as a draft, approve to adjust stock.
export function StockCountFormPage() {
  const t = useTranslations("inventory.countForm")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  const searchParams = useSearchParams()
  const countId = searchParams.get("id")

  const [existing, setExisting] = useState<StockCount | null>(null)
  const [loading, setLoading] = useState(Boolean(countId))
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branch, setBranch] = useState("")
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [rows, setRows] = useState<CountRow[] | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<RowFilter>("all")
  const [saving, setSaving] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // The product just counted by scanning (or Enter in the search box), shown and highlighted.
  const [lastScanned, setLastScanned] = useState<{ productId: string; at: number } | null>(null)

  const completed = existing?.status === "completed"

  useEffect(() => {
    stockTransferService
      .branches()
      .then(setBranches)
      .catch(() => setBranches([]))
  }, [])

  // An existing count: its header, and (for an approved one) its lines as recorded.
  useEffect(() => {
    if (!countId) return
    let cancelled = false
    setLoading(true)
    stockCountService
      .get(countId)
      .then((count) => {
        if (cancelled) return
        setExisting(count)
        setBranch(count.workspaceId)
        setCountDate(count.countDate)
        setNotes(count.notes)
        if (count.status === "completed") {
          setRows(
            count.items.map((item) => ({
              productId: item.productId,
              name: item.productName,
              sku: item.sku,
              systemQuantity: item.systemQuantity,
              counted: String(item.countedQuantity),
              unitCost: item.unitCost,
            }))
          )
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(t("toasts.loadFailed"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [countId, t])

  // A draft (new or saved): every stock-tracked product with its quantity in the branch right
  // now, with the counts already entered filled back in.
  useEffect(() => {
    if (!branch || completed || (countId && !existing)) return
    let cancelled = false
    setLoadingStock(true)
    stockTransferService
      .branchStock(branch)
      .then((stock: BranchStockItem[]) => {
        if (cancelled) return
        const countedById = new Map((existing?.items ?? []).map((item) => [item.productId, item]))
        setRows(
          stock.map((product) => {
            const saved = countedById.get(product.productId)
            return {
              productId: product.productId,
              name: product.name,
              sku: product.sku,
              systemQuantity: product.quantity,
              counted: saved ? String(saved.countedQuantity) : "",
              unitCost: saved?.unitCost ?? null,
            }
          })
        )
      })
      .catch(() => {
        if (!cancelled) toast.error(t("toasts.stockFailed"))
      })
      .finally(() => {
        if (!cancelled) setLoadingStock(false)
      })
    return () => {
      cancelled = true
    }
  }, [branch, completed, countId, existing, t])

  const allRows = useMemo(() => rows ?? [], [rows])
  const difference = (row: CountRow) => {
    const counted = parseCount(row.counted)
    return counted === null ? null : counted - row.systemQuantity
  }
  const countedRows = allRows.filter((row) => parseCount(row.counted) !== null)
  const differenceRows = countedRows.filter((row) => Math.abs(difference(row) ?? 0) > 1e-9)
  const netUnits = countedRows.reduce((sum, row) => sum + (difference(row) ?? 0), 0)
  const invalid = allRows.some(
    (row) => row.counted.trim() !== "" && parseCount(row.counted) === null
  )

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return allRows.filter((row) => {
      const counted = parseCount(row.counted) !== null
      const diff = counted ? Math.abs(Number(row.counted) - row.systemQuantity) > 1e-9 : false
      return (
        (!query ||
          row.name.toLowerCase().includes(query) ||
          row.sku.toLowerCase().includes(query)) &&
        (filter === "all" ||
          (filter === "counted" && counted) ||
          (filter === "uncounted" && !counted) ||
          (filter === "differences" && diff))
      )
    })
  }, [allRows, search, filter])

  // A scan (a barcode scanner types the SKU then Enter) or Enter on a search counts one more of
  // that product: its exact SKU first, otherwise the only product matching what was typed.
  function scanToCount(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || completed) return
    event.preventDefault()
    const query = search.trim().toLowerCase()
    if (!query) return
    const match =
      allRows.find((row) => row.sku && row.sku.toLowerCase() === query) ??
      (visibleRows.length === 1 ? visibleRows[0] : undefined)
    if (!match) {
      toast.error(
        visibleRows.length === 0
          ? t("toasts.scanNoMatch", { query: search.trim() })
          : t("toasts.scanManyMatches")
      )
      return
    }
    setRows((current) =>
      (current ?? []).map((row) =>
        row.productId === match.productId
          ? { ...row, counted: String((parseCount(row.counted) ?? 0) + 1) }
          : row
      )
    )
    setSearch("")
    setLastScanned({ productId: match.productId, at: Date.now() })
    // Bring the counted row into view once it re-renders.
    setTimeout(() => {
      document
        .getElementById(`count-row-${match.productId}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }, 50)
  }

  const lastScannedRow = lastScanned
    ? allRows.find((row) => row.productId === lastScanned.productId)
    : undefined

  function setCounted(productId: string, value: string) {
    setRows((current) =>
      (current ?? []).map((row) => (row.productId === productId ? { ...row, counted: value } : row))
    )
  }

  const payload = () => ({
    countDate,
    notes: notes.trim(),
    items: countedRows.map((row) => ({
      productId: row.productId,
      countedQuantity: parseCount(row.counted)!,
    })),
  })

  async function save(): Promise<StockCount | null> {
    if (!branch || invalid) return null
    setSaving(true)
    try {
      const saved = existing
        ? await stockCountService.update(existing.id, payload())
        : await stockCountService.create({ ...payload(), workspaceId: branch })
      setExisting(saved)
      if (!existing) {
        router.replace(`${ROUTES.inventoryStockCountsNew}?id=${encodeURIComponent(saved.id)}`)
      }
      return saved
    } catch {
      toast.error(t("toasts.saveFailed"))
      return null
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    const saved = await save()
    if (saved) toast.success(t("toasts.saved", { reference: saved.reference }))
  }

  async function approve() {
    const saved = await save()
    if (!saved) return
    setSaving(true)
    try {
      const done = await stockCountService.complete(saved.id)
      toast.success(t("toasts.approved", { reference: done.reference }))
      router.push(ROUTES.inventoryStockCounts)
    } catch {
      toast.error(t("toasts.approveFailed"))
    } finally {
      setSaving(false)
      setConfirmApprove(false)
    }
  }

  async function deleteDraft() {
    if (!existing) return
    setSaving(true)
    try {
      await stockCountService.remove(existing.id)
      toast.success(t("toasts.deleted", { reference: existing.reference }))
      router.push(ROUTES.inventoryStockCounts)
    } catch {
      toast.error(t("toasts.deleteFailed"))
    } finally {
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const filterChip = (value: RowFilter, label: string, count: number, tone: string) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 transition-colors",
        tone,
        filter === value ? "ring-current" : "ring-transparent"
      )}
    >
      {label}
      <span className="rounded-full bg-white/70 px-1.5 text-[11px]">{count}</span>
    </button>
  )

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 p-16 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        {tCommon("loading")}
      </div>
    )
  }

  return (
    <div dir={dir} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.inventoryStockCounts)}
        className={cn(
          "flex w-fit items-center gap-1.5 text-[12.5px] font-semibold hover:text-[#0b1738]",
          MUTED
        )}
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("back")}
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className={cn("text-2xl font-bold", HEADING)}>
          {existing ? t("headingExisting", { reference: existing.reference }) : t("heading")}
        </h1>
        {existing ? <StockCountStatusBadge status={existing.status} /> : null}
      </div>
      <p className={cn("-mt-2 text-sm", MUTED)}>
        {completed
          ? t("completedNote", {
              name: existing?.completedByName ?? "—",
              date: existing?.completedAt?.slice(0, 10) ?? "",
            })
          : t("subheading")}
      </p>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("reference")} hint={existing ? undefined : t("referenceHint")}>
            <div className="flex h-11 items-center gap-2 rounded-[12px] border border-dashed border-[#c4d5f0] bg-[#f7f9fd] px-3 text-[13px] font-semibold text-[#2878ff]">
              <Hash className="size-4" />
              <span className="font-mono">{existing?.reference ?? "STK-####"}</span>
            </div>
          </Field>
          <Field label={t("branch")} required hint={existing ? t("branchLocked") : undefined}>
            <AppSearchableSelect
              value={branch}
              options={branches.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setBranch}
              placeholder={t("branchPlaceholder")}
              ariaLabel={t("branch")}
              disabled={Boolean(existing)}
            />
          </Field>
          <Field label={t("date")} required>
            {completed ? (
              <div className={cn(FIELD_CLASS, "flex items-center border px-3")}>{countDate}</div>
            ) : (
              <AppDateField value={countDate} onChange={setCountDate} ariaLabel={t("date")} />
            )}
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("notes")}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={completed ? "—" : t("notesPlaceholder")}
              rows={2}
              maxLength={1000}
              readOnly={completed}
              className={cn(
                FIELD_CLASS,
                "h-auto w-full resize-none border p-3 outline-none focus:border-[#2878ff]"
              )}
            />
          </Field>
        </div>
      </section>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-violet-50 text-violet-600">
              <Package className="size-4" />
            </span>
            <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("productsTitle")}</h2>
          </div>
          {allRows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {filterChip("all", t("filters.all"), allRows.length, "bg-[#eef4ff] text-[#2878ff]")}
              {completed
                ? null
                : filterChip(
                    "counted",
                    t("filters.counted"),
                    countedRows.length,
                    "bg-emerald-50 text-emerald-700"
                  )}
              {completed
                ? null
                : filterChip(
                    "uncounted",
                    t("filters.uncounted"),
                    allRows.length - countedRows.length,
                    "bg-[#f1f4f9] text-[#0b1738]"
                  )}
              {filterChip(
                "differences",
                t("filters.differences"),
                differenceRows.length,
                "bg-amber-50 text-amber-700"
              )}
            </div>
          ) : null}
        </div>

        {!branch ? (
          <p
            className={cn(
              "rounded-[12px] border border-dashed border-[#e1e7f0] py-10 text-center text-[12.5px]",
              MUTED
            )}
          >
            {t("pickBranch")}
          </p>
        ) : loadingStock && rows === null ? (
          <div className={cn("flex items-center justify-center gap-2 py-10 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            {t("loadingStock")}
          </div>
        ) : (
          <>
            <AppInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={scanToCount}
              autoFocus={!completed}
              placeholder={completed ? t("searchPlaceholderReadOnly") : t("searchPlaceholder")}
              startIcon={<ScanLine className="size-4" />}
              className={FIELD_CLASS}
            />
            {completed ? null : (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                <span className={MUTED}>{t("scanHint")}</span>
                {lastScannedRow ? (
                  <span
                    key={lastScanned?.at}
                    className="inline-flex animate-in items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 fade-in"
                  >
                    <ScanLine className="size-3.5" />
                    {t("lastScanned", {
                      name: lastScannedRow.name,
                      count: formatQuantity(parseCount(lastScannedRow.counted) ?? 0),
                    })}
                  </span>
                ) : null}
              </div>
            )}
            <div className="mt-3 max-h-[34rem] overflow-auto rounded-[12px] border border-[#e1e7f0]">
              <table className="w-full min-w-[46rem] text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-[#f7f9fd] text-[11.5px] font-semibold text-[#0b1738]">
                  <tr>
                    <th className="px-3 py-2.5 text-start">{t("table.product")}</th>
                    <th className="px-3 py-2.5 text-start">{t("table.system")}</th>
                    <th className="w-44 px-3 py-2.5 text-start">{t("table.counted")}</th>
                    <th className="px-3 py-2.5 text-start">{t("table.difference")}</th>
                    {completed ? (
                      <th className="px-3 py-2.5 text-start">{t("table.differenceValue")}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const diff = difference(row)
                    const bad = row.counted.trim() !== "" && parseCount(row.counted) === null
                    return (
                      <tr
                        key={row.productId}
                        id={`count-row-${row.productId}`}
                        className={cn(
                          "border-t border-[#eef2f7] transition-colors",
                          lastScanned?.productId === row.productId && "bg-emerald-50/70"
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <p className={cn("font-semibold", HEADING)}>{row.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-[#0b1738]">
                            {row.sku || "—"}
                          </p>
                        </td>
                        <td className={cn("px-3 py-2.5 font-semibold", HEADING)}>
                          {formatQuantity(row.systemQuantity)}
                        </td>
                        <td className="px-3 py-2.5">
                          {completed ? (
                            <span className={cn("font-semibold", HEADING)}>
                              {formatQuantity(Number(row.counted))}
                            </span>
                          ) : (
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={row.counted}
                              onChange={(event) => setCounted(row.productId, event.target.value)}
                              placeholder={t("countedPlaceholder")}
                              aria-label={t("countedLabel", { name: row.name })}
                              className={cn(
                                "h-9 w-full rounded-[10px] border bg-white px-3 text-[13px] text-[#0b1738] outline-none placeholder:text-[#95a4bd]",
                                bad
                                  ? "border-rose-300 focus:border-rose-400"
                                  : "border-[#e1e7f0] focus:border-[#2878ff]"
                              )}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {diff === null ? (
                            <span className={cn("text-[12px]", MUTED)}>—</span>
                          ) : (
                            <DifferenceValue value={diff} />
                          )}
                        </td>
                        {completed ? (
                          <td className="px-3 py-2.5">
                            <DifferenceValue value={(diff ?? 0) * (row.unitCost ?? 0)} money />
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={cn("px-3 py-10 text-center text-[12.5px]", MUTED)}>
                        {allRows.length === 0 ? t("noProducts") : t("noMatch")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-[12.5px]">
              <span className="rounded-full bg-[#f1f4f9] px-3 py-1 font-semibold text-[#0b1738]">
                {t("summary.counted", { counted: countedRows.length, total: allRows.length })}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                {t("summary.differences", { count: differenceRows.length })}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0b1738]">
                {t("summary.net")}
                <DifferenceValue value={netUnits} />
              </span>
              {completed && existing ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#0b1738]">
                  {t("summary.netValue")}
                  <DifferenceValue value={existing.netDifferenceValue} money />
                </span>
              ) : null}
            </div>
          </>
        )}
      </section>

      {completed ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {existing ? (
              <AppButton
                type="button"
                variant="outline"
                icon={<Trash2 className="size-4" />}
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
                className="h-11 gap-2 rounded-[12px] border-rose-200 px-4 text-[13px] font-semibold text-rose-600 hover:bg-rose-50"
              >
                {t("delete")}
              </AppButton>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              type="button"
              variant="outline"
              icon={<Save className="size-4" />}
              loading={saving && !confirmApprove}
              disabled={!branch || invalid || saving}
              onClick={() => void saveDraft()}
              className="h-11 gap-2 rounded-[12px] border-[#c4d5f0] px-5 text-[13.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            >
              {t("saveDraft")}
            </AppButton>
            <AppButton
              type="button"
              icon={<ClipboardCheck className="size-4" />}
              disabled={!branch || invalid || countedRows.length === 0 || saving}
              onClick={() => setConfirmApprove(true)}
              className="h-11 gap-2 rounded-full bg-[#2878ff] px-6 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] disabled:opacity-50 disabled:shadow-none"
            >
              {t("approve")}
            </AppButton>
          </div>
        </div>
      )}

      <AppConfirmDialog
        open={confirmApprove}
        onOpenChange={(open) => !saving && setConfirmApprove(open)}
        title={
          <span dir={dir} className="text-[17px] font-extrabold text-[#0b1738]">
            {t("approveDialog.title")}
          </span>
        }
        description={
          <span dir={dir} className="flex flex-col gap-1.5 text-[13px] text-[#4a5a78]">
            <span>
              {t("approveDialog.description", {
                counted: countedRows.length,
                differences: differenceRows.length,
              })}
            </span>
            <span className="rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {t("approveDialog.warning")}
            </span>
          </span>
        }
        confirmLabel={t("approve")}
        cancelLabel={tCommon("cancel")}
        confirmButtonClassName="rounded-[10px] bg-[#2878ff] font-bold text-white hover:bg-[#1f63d6]"
        cancelButtonClassName="rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
        loading={saving}
        onConfirm={() => void approve()}
        onCancel={() => setConfirmApprove(false)}
        contentClassName={cn(
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
          "max-w-[28rem] gap-5 p-6"
        )}
      />

      <AppConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => !saving && setConfirmDelete(open)}
        title={
          <span dir={dir} className="text-[17px] font-extrabold text-[#0b1738]">
            {t("deleteDialog.title", { reference: existing?.reference ?? "" })}
          </span>
        }
        description={
          <span dir={dir} className="text-[13px] text-[#4a5a78]">
            {t("deleteDialog.description")}
          </span>
        }
        confirmLabel={t("delete")}
        cancelLabel={tCommon("cancel")}
        confirmButtonClassName="rounded-[10px] bg-rose-600 font-bold text-white hover:bg-rose-700"
        cancelButtonClassName="rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
        loading={saving}
        onConfirm={() => void deleteDraft()}
        onCancel={() => setConfirmDelete(false)}
        contentClassName={cn(
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
          "max-w-[26rem] gap-5 p-6"
        )}
      />
    </div>
  )
}
