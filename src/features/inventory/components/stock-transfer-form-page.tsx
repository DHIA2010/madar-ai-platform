"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, ArrowLeftRight, Hash, Loader2, Package, ScanLine, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDateField, AppInput, AppSearchableSelect } from "@/components/app"

import { type BranchStockItem, stockTransferService } from "../services/stock-transfer.service"

import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#e1e7f0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#95a4bd]"

interface TransferLine {
  productId: string
  quantity: string
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)
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

// Inventory -> new stock transfer: move products from one branch to another.
export function StockTransferFormPage() {
  const t = useTranslations("inventory.transferForm")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  // Branches come from the server, never the browser's saved list.
  const [availableWorkspaces, setBranches] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    stockTransferService
      .branches()
      .then(setBranches)
      .catch(() => setBranches([]))
  }, [])

  const [fromBranch, setFromBranch] = useState("")
  const [toBranch, setToBranch] = useState("")
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<TransferLine[]>([])
  // Every product that keeps stock, with its quantity in the branch it leaves from.
  const [branchStock, setBranchStock] = useState<BranchStockItem[] | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [search, setSearch] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Each product's stock in the branch it leaves from.
  useEffect(() => {
    if (!fromBranch) {
      setBranchStock(null)
      return
    }
    let cancelled = false
    setLoadingStock(true)
    stockTransferService
      .branchStock(fromBranch)
      .then((stock) => {
        if (!cancelled) setBranchStock(stock)
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
  }, [fromBranch, t])

  const productById = useMemo(
    () => new Map((branchStock ?? []).map((product) => [product.productId, product])),
    [branchStock]
  )
  const results = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []
    return (branchStock ?? [])
      .filter((product) => !lines.some((line) => line.productId === product.productId))
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
      )
      .slice(0, 8)
  }, [branchStock, lines, search])

  const current = (productId: string) => productById.get(productId)?.quantity ?? 0
  const available = (productId: string) => Math.max(0, current(productId))

  function addProduct(product: BranchStockItem) {
    setLines((existing) => [...existing, { productId: product.productId, quantity: "" }])
    setSearch("")
    setResultsOpen(false)
  }

  function lineError(line: TransferLine): string | null {
    const quantity = Number(line.quantity)
    if (line.quantity.trim() === "" || !Number.isFinite(quantity) || quantity <= 0) {
      return t("errors.quantityRequired")
    }
    if (quantity > available(line.productId)) {
      return t("errors.quantityTooHigh", { max: formatQuantity(available(line.productId)) })
    }
    return null
  }

  const totalUnits = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  const formReady =
    fromBranch !== "" &&
    toBranch !== "" &&
    fromBranch !== toBranch &&
    transferDate !== "" &&
    lines.length > 0 &&
    lines.every((line) => lineError(line) === null)

  async function submit() {
    if (!formReady) return
    setSubmitting(true)
    try {
      const created = await stockTransferService.create({
        fromWorkspaceId: fromBranch,
        toWorkspaceId: toBranch,
        transferDate,
        notes: notes.trim(),
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      })
      toast.success(t("toasts.created", { reference: created.reference }))
      router.push(ROUTES.inventoryTransfers)
    } catch (error) {
      const { code, details } = (error ?? {}) as { code?: string; details?: unknown }
      const unknownBranch = JSON.stringify(details ?? "").includes("WorkspaceId")
      toast.error(
        code === "STOCK_INSUFFICIENT"
          ? t("toasts.insufficient")
          : unknownBranch
            ? t("toasts.unknownBranch")
            : t("toasts.createFailed")
      )
    } finally {
      setSubmitting(false)
    }
  }

  const branchOptions = (exclude: string) =>
    availableWorkspaces
      .filter((workspace) => workspace.id !== exclude)
      .map((workspace) => ({ value: workspace.id, label: workspace.name }))

  return (
    <div dir={dir} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.inventoryTransfers)}
        className={cn(
          "flex w-fit items-center gap-1.5 text-[12.5px] font-semibold hover:text-[#0b1738]",
          MUTED
        )}
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("back")}
      </button>

      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>{t("heading")}</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>{t("subheading")}</p>
      </div>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("reference")} hint={t("referenceHint")}>
            <div className="flex h-11 items-center gap-2 rounded-[12px] border border-dashed border-[#c4d5f0] bg-[#f7f9fd] px-3 text-[13px] font-semibold text-[#2878ff]">
              <Hash className="size-4" />
              <span className="font-mono">TRF-####</span>
            </div>
          </Field>
          <Field label={t("from")} required>
            <AppSearchableSelect
              value={fromBranch}
              options={branchOptions(toBranch)}
              onChange={setFromBranch}
              placeholder={t("fromPlaceholder")}
              ariaLabel={t("from")}
            />
          </Field>
          <Field label={t("to")} required>
            <AppSearchableSelect
              value={toBranch}
              options={branchOptions(fromBranch)}
              onChange={setToBranch}
              placeholder={t("toPlaceholder")}
              ariaLabel={t("to")}
            />
          </Field>
          <Field label={t("date")} required>
            <AppDateField value={transferDate} onChange={setTransferDate} ariaLabel={t("date")} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label={t("notes")}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={2}
              maxLength={1000}
              className={cn(
                FIELD_CLASS,
                "h-auto w-full resize-none border p-3 outline-none focus:border-[#2878ff]"
              )}
            />
          </Field>
        </div>
      </section>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-violet-50 text-violet-600">
            <Package className="size-4" />
          </span>
          <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("productsTitle")}</h2>
        </div>

        <div className="relative">
          <AppInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setResultsOpen(true)
            }}
            onFocus={() => setResultsOpen(true)}
            onBlur={() => setTimeout(() => setResultsOpen(false), 150)}
            disabled={!fromBranch || loadingStock}
            placeholder={
              !fromBranch
                ? t("searchPickFrom")
                : loadingStock
                  ? t("searchLoading")
                  : t("searchPlaceholder")
            }
            startIcon={
              loadingStock ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )
            }
            className={FIELD_CLASS}
          />
          {resultsOpen && search.trim() ? (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[12px] border border-[#e1e7f0] bg-white shadow-lg">
              {results.length > 0 ? (
                results.map((product) => (
                  <button
                    key={product.productId}
                    type="button"
                    onMouseDown={() => addProduct(product)}
                    className="flex w-full items-center justify-between gap-3 border-b border-[#eef1f6] px-3 py-2.5 text-start last:border-b-0 hover:bg-[#f7f9fd]"
                  >
                    <span className="min-w-0">
                      <span className={cn("block truncate font-medium", HEADING)}>
                        {product.name}
                      </span>
                      <span className="font-mono text-[11px] text-[#0b1738]">
                        {product.sku || "—"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                        available(product.productId) > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-600"
                      )}
                    >
                      {t("availableShort", { count: formatQuantity(product.quantity) })}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2.5 text-[12px] text-[#6b7b96]">{t("noMatch")}</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-[12px] border border-[#e1e7f0]">
          <table className="w-full min-w-[46rem] text-[12.5px]">
            <thead className="bg-[#f7f9fd] text-[11.5px] font-semibold text-[#0b1738]">
              <tr>
                <th className="px-3 py-2.5 text-start">{t("table.product")}</th>
                <th className="px-3 py-2.5 text-start">{t("table.current")}</th>
                <th className="px-3 py-2.5 text-start">{t("table.transferable")}</th>
                <th className="w-44 px-3 py-2.5 text-start">{t("table.quantity")}</th>
                <th className="px-3 py-2.5 text-start">{t("table.after")}</th>
                <th className="w-12 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const product = productById.get(line.productId)
                const error = line.quantity.trim() !== "" ? lineError(line) : null
                const after = current(line.productId) - (Number(line.quantity) || 0)
                return (
                  <tr key={line.productId} className="border-t border-[#eef2f7] align-top">
                    <td className="px-3 py-3">
                      <p className={cn("font-semibold", HEADING)}>{product?.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#0b1738]">
                        {product?.sku || "—"}
                      </p>
                    </td>
                    <td className={cn("px-3 py-3 font-semibold", HEADING)}>
                      {formatQuantity(current(line.productId))}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
                        {formatQuantity(available(line.productId))}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={line.quantity}
                        onChange={(event) =>
                          setLines((existing) =>
                            existing.map((entry) =>
                              entry.productId === line.productId
                                ? { ...entry, quantity: event.target.value }
                                : entry
                            )
                          )
                        }
                        placeholder="0"
                        aria-label={t("table.quantity")}
                        className={cn(
                          "h-9 w-full rounded-[10px] border bg-white px-3 text-[13px] text-[#0b1738] outline-none",
                          error
                            ? "border-rose-300 focus:border-rose-400"
                            : "border-[#e1e7f0] focus:border-[#2878ff]"
                        )}
                      />
                      {error ? <p className="mt-1 text-[11px] text-rose-600">{error}</p> : null}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 font-semibold",
                        after < 0 ? "text-rose-600" : HEADING
                      )}
                    >
                      {formatQuantity(after)}
                    </td>
                    <td className="px-3 py-3">
                      <AppButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("remove")}
                        className="rounded-[8px] border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                        onClick={() =>
                          setLines((existing) =>
                            existing.filter((entry) => entry.productId !== line.productId)
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </AppButton>
                    </td>
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className={cn("px-3 py-10 text-center text-[12.5px]", MUTED)}>
                    {t("emptyLines")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {lines.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-[12.5px]">
            <span className="rounded-full bg-[#f1f4f9] px-3 py-1 font-semibold text-[#0b1738]">
              {t("summaryProducts", { count: lines.length })}
            </span>
            <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">
              {t("summaryUnits", { count: formatQuantity(totalUnits) })}
            </span>
          </div>
        ) : null}
      </section>

      <div className="flex items-center justify-end gap-2">
        <AppButton
          type="button"
          variant="outline"
          className="h-11 rounded-[12px] border-[#c4d5f0] px-6 text-[13.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
          onClick={() => router.push(ROUTES.inventoryTransfers)}
        >
          {tCommon("cancel")}
        </AppButton>
        <AppButton
          type="button"
          loading={submitting}
          disabled={!formReady}
          onClick={() => void submit()}
          icon={<ArrowLeftRight className="size-4" />}
          className="h-11 gap-2 rounded-full bg-[#2878ff] px-6 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] disabled:opacity-50 disabled:shadow-none"
        >
          {t("submit")}
        </AppButton>
      </div>
    </div>
  )
}
