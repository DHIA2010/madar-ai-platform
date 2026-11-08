"use client"

import { type DragEvent, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  AlertTriangle,
  Barcode,
  BookmarkCheck,
  CheckCircle2,
  FileText,
  Loader2,
  PackagePlus,
  Sparkles,
  Type,
  UploadCloud,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog, AppSearchableSelect } from "@/components/app"

import { productListService, type ProductRecord } from "@/features/products"

import { useProductCatalog } from "../hooks"
import {
  type InvoiceMatchSource,
  purchaseService,
  type ScannedInvoice,
  type ScannedInvoiceLine,
} from "../services"
import type { PurchaseLineItem } from "../types"
import { HEADING, MUTED } from "./purchase-field"
import type { CalculationLevel } from "./purchase-line-items-table"

import { type Locale, localeDirection } from "@/i18n/locales"

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 8 * 1024 * 1024
const DEFAULT_TAX_PERCENT = 15

const MATCH_STYLE: Record<InvoiceMatchSource, { icon: typeof Barcode; className: string }> = {
  memory: { icon: BookmarkCheck, className: "bg-emerald-50 text-emerald-700" },
  sku: { icon: Barcode, className: "bg-blue-50 text-blue-700" },
  name: { icon: Type, className: "bg-amber-50 text-amber-700" },
}

interface ReviewLine extends ScannedInvoiceLine {
  key: string
  productId: string | null
  include: boolean
  // Optional selling price for a product created from this line; with one it's created active.
  sellPrice: string
}

export interface AppliedInvoice {
  items: PurchaseLineItem[]
  attachmentUrl: string | null
  invoiceNumber: string | null
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Upload a supplier's invoice, review what was read and which product each line is, then add the
// lines to the purchase order. Confirmed codes are remembered for this supplier.
export function SupplierInvoiceDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  workspaceId,
  taxLevel,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierId: string
  supplierName: string
  // The purchase's branch -- where a product created from an invoice line belongs.
  workspaceId: string | null
  taxLevel: CalculationLevel
  onApply: (invoice: AppliedInvoice) => void
}) {
  const t = useTranslations("purchases.invoiceScan")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const { products: catalog } = useProductCatalog()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [invoice, setInvoice] = useState<ScannedInvoice | null>(null)
  const [lines, setLines] = useState<ReviewLine[]>([])
  // Products created here from unmatched lines, and which lines are being / were created.
  const [createdProducts, setCreatedProducts] = useState<ProductRecord[]>([])
  const [creatingKeys, setCreatingKeys] = useState<Set<string>>(new Set())
  const [createdKeys, setCreatedKeys] = useState<Set<string>>(new Set())
  // The created ones that had no selling price -- drafts, kept out of the cashier.
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set())
  const [creatingAll, setCreatingAll] = useState(false)
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all")

  const products = useMemo(() => [...catalog, ...createdProducts], [catalog, createdProducts])
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )
  const productOptions = useMemo(
    () =>
      products.map((product) => ({ value: product.id, label: product.name, hint: product.sku })),
    [products]
  )

  function reset() {
    setFileName(null)
    setInvoice(null)
    setLines([])
    setReading(false)
    setCreatedProducts([])
    setCreatingKeys(new Set())
    setCreatedKeys(new Set())
    setDraftKeys(new Set())
    setFilter("all")
  }

  // Creates a product from an invoice line and picks it for that line; its stock comes from this
  // purchase. Given a selling price it's created active (sold in the cashier right away);
  // without one it's a draft, out of the cashier until a price is set.
  async function createProductFor(line: ReviewLine): Promise<boolean> {
    const price = Number(line.sellPrice)
    const priced = line.sellPrice.trim() !== "" && Number.isFinite(price) && price > 0
    setCreatingKeys((current) => new Set(current).add(line.key))
    const sku = line.code?.trim() || `PUR-${Date.now().toString(36).toUpperCase()}-${line.key}`
    try {
      const created = await productListService.createProduct({
        productType: "simple",
        name: line.name.trim(),
        sku,
        category: "",
        description: "",
        status: priced ? "active" : "draft",
        baseUnit: null,
        sellPrice: priced ? price : 0,
        costPrice: line.unitCost,
        stockQuantity: 0,
        minStock: null,
        imageUrls: [],
        attributes: {},
        components: [],
        variantOptions: [],
        variants: [],
        taxRateId: null,
        priceIncludesTax: false,
        workspaceId,
      })
      setCreatedProducts((current) => [
        ...current,
        {
          id: created.id,
          name: created.name,
          sku: created.sku ?? sku,
          category: "",
          status: priced ? "Active" : "Draft",
          availableStock: 0,
          costPrice: line.unitCost,
          sellingPrice: priced ? price : 0,
          currency: "SAR",
          platform: "Madar",
          productType: created.productType,
          baseUnit: null,
          taxRateId: created.taxRateId,
          priceIncludesTax: created.priceIncludesTax,
          image: null,
          activityDate: new Date().toISOString(),
          isNative: true,
        },
      ])
      setCreatedKeys((current) => new Set(current).add(line.key))
      if (!priced) setDraftKeys((current) => new Set(current).add(line.key))
      updateLine(line.key, { productId: created.id, include: true })
      return true
    } catch {
      return false
    } finally {
      setCreatingKeys((current) => {
        const next = new Set(current)
        next.delete(line.key)
        return next
      })
    }
  }

  async function createOne(line: ReviewLine) {
    if (await createProductFor(line)) toast.success(t("toasts.productCreated", { name: line.name }))
    else toast.error(t("toasts.productCreateFailed", { name: line.name }))
  }

  // Creates products for the ticked unmatched lines, or for every unmatched line when none is ticked.
  async function createUnmatched() {
    const unmatchedLines = lines.filter((line) => !line.productId)
    const ticked = unmatchedLines.filter((line) => line.include)
    const pending = ticked.length > 0 ? ticked : unmatchedLines
    setCreatingAll(true)
    let created = 0
    for (const line of pending) {
      if (await createProductFor(line)) created += 1
    }
    setCreatingAll(false)
    if (created === pending.length) toast.success(t("toasts.productsCreated", { count: created }))
    else toast.error(t("toasts.someProductsFailed", { created, failed: pending.length - created }))
  }

  function close() {
    if (reading) return
    onOpenChange(false)
    reset()
  }

  async function read(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t("toasts.badType"))
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("toasts.tooLarge"))
      return
    }
    setFileName(file.name)
    setReading(true)
    try {
      const scanned = await purchaseService.scanInvoice(supplierId, file)
      setInvoice(scanned)
      setLines(
        scanned.lines.map((line, index) => ({
          ...line,
          key: `${index}`,
          productId: line.match?.productId ?? null,
          include: line.match !== null,
          sellPrice: "",
        }))
      )
      if (scanned.lines.length === 0) toast.error(t("toasts.noLines"))
    } catch (error) {
      // Only an invoice Claude actually looked at and couldn't read asks for a clearer file.
      const { code, status } = (error ?? {}) as { code?: string; status?: number }
      toast.error(
        code === "INVOICE_UNREADABLE"
          ? t("toasts.readFailed")
          : code === "INVOICE_READER_NOT_INCLUDED"
            ? t("toasts.notIncluded")
            : status === 503
              ? t("toasts.unavailable")
              : status === 403
                ? t("toasts.forbidden")
                : t("toasts.uploadFailed")
      )
      setFileName(null)
    } finally {
      setReading(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void read(file)
  }

  function updateLine(key: string, patch: Partial<ReviewLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const included = lines.filter((line) => line.include && line.productId)
  const unmatched = lines.filter((line) => !line.productId).length
  const tickedUnmatched = lines.filter((line) => !line.productId && line.include).length
  const visibleLines = lines.filter((line) =>
    filter === "all" ? true : filter === "matched" ? line.productId !== null : !line.productId
  )
  const allVisibleTicked = visibleLines.length > 0 && visibleLines.every((line) => line.include)
  const someVisibleTicked = visibleLines.some((line) => line.include)

  function toggleVisible() {
    const keys = new Set(visibleLines.map((line) => line.key))
    setLines((current) =>
      current.map((line) => (keys.has(line.key) ? { ...line, include: !allVisibleTicked } : line))
    )
  }

  const filterChip = (active: boolean, tone: string) =>
    cn(
      "inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ring-1 transition-colors",
      tone,
      active ? "ring-current" : "ring-transparent hover:ring-current/30"
    )

  function apply() {
    if (!invoice || included.length === 0) return
    const items: PurchaseLineItem[] = []
    for (const line of included) {
      const product = productById.get(line.productId!)
      if (!product) continue
      const existing = items.find((item) => item.productId === product.id)
      if (existing) {
        existing.qty += line.qty
        existing.discount += line.discount
        continue
      }
      items.push({
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        netUnitCost: line.unitCost,
        qty: line.qty,
        discount: line.discount,
        taxPercent: taxLevel === "invoice" ? 0 : (line.taxPercent ?? DEFAULT_TAX_PERCENT),
      })
    }

    // Remembered by code, or by the supplier's line name when the invoice prints no codes. A code
    // that is just the product's own SKU needs no memory -- it already matches by SKU.
    const links = included
      .filter((line) => {
        const product = productById.get(line.productId!)
        return (
          product && (!line.code || line.code.trim().toLowerCase() !== product.sku.toLowerCase())
        )
      })
      .map((line) => ({ code: line.code, name: line.name, productId: line.productId! }))
    void purchaseService.rememberSupplierCodes(supplierId, links).catch(() => undefined)

    onApply({
      items,
      attachmentUrl: invoice.attachmentUrl,
      invoiceNumber: invoice.invoiceNumber,
    })
    toast.success(t("toasts.applied", { count: items.length }))
    onOpenChange(false)
    reset()
  }

  const reviewing = invoice !== null

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={
        <span dir={dir} className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
            <Sparkles className="size-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-[17px] font-extrabold text-[#0b1738]">{t("title")}</span>
            <span className="text-[12px] font-medium text-[#6b7b96]">
              {t("supplier", { name: supplierName })}
            </span>
          </span>
        </span>
      }
      description={
        <span dir={dir} className="text-[13px] text-[#6b7b96]">
          {reviewing ? t("reviewDescription") : t("description")}
        </span>
      }
      contentClassName={cn(
        locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
        reviewing ? "max-w-[min(64rem,calc(100vw-2rem))]" : "max-w-[34rem]",
        "gap-5 p-6"
      )}
      footer={
        reviewing ? (
          <div dir={dir} className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className={cn("flex items-center gap-1.5 text-[12px]", MUTED)}>
              <BookmarkCheck className="size-4 text-emerald-600" />
              {t("rememberNote")}
            </p>
            <div className="flex gap-2">
              <AppButton
                variant="outline"
                className="h-11 rounded-[10px] border-[#e1e7f0] px-5 font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
                onClick={close}
              >
                {tCommon("cancel")}
              </AppButton>
              <AppButton
                className="h-11 rounded-[10px] bg-[#2878ff] px-5 font-bold text-white hover:bg-[#1f63d6]"
                disabled={included.length === 0}
                onClick={apply}
              >
                {t("apply", { count: included.length })}
              </AppButton>
            </div>
          </div>
        ) : undefined
      }
    >
      <div dir={dir}>
        {reading ? (
          <div className="flex flex-col items-center gap-3 rounded-[14px] border border-[#e1e7f0] bg-[#f9fbfe] px-6 py-12 text-center">
            <span className="relative flex size-14 items-center justify-center rounded-full bg-[#eef4ff] text-[#2878ff]">
              <Loader2 className="size-7 animate-spin" />
            </span>
            <p className={cn("text-[14px] font-bold", HEADING)}>{t("reading")}</p>
            <p className={cn("flex items-center gap-1.5 text-[12px]", MUTED)}>
              <FileText className="size-3.5" />
              {fileName}
            </p>
            <p className={cn("text-[12px]", MUTED)}>{t("readingHint")}</p>
          </div>
        ) : !reviewing ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") inputRef.current?.click()
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging
                ? "border-[#2878ff] bg-[#eef4ff]"
                : "border-[#c4d5f0] bg-[#f9fbfe] hover:border-[#2878ff] hover:bg-[#f4f8ff]"
            )}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-white text-[#2878ff] shadow-[0_4px_12px_rgba(40,120,255,0.18)]">
              <UploadCloud className="size-7" />
            </span>
            <p className={cn("text-[14px] font-bold", HEADING)}>{t("dropTitle")}</p>
            <p className={cn("text-[12px]", MUTED)}>{t("dropHint")}</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void read(file)
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4f9] px-3 py-1 font-semibold text-[#0b1738]">
                <FileText className="size-3.5 text-[#6b7b96]" />
                {fileName}
              </span>
              {invoice.invoiceNumber ? (
                <span className="rounded-full bg-[#f1f4f9] px-3 py-1 font-semibold text-[#0b1738]">
                  {t("invoiceNumber", { number: invoice.invoiceNumber })}
                </span>
              ) : null}
              {invoice.invoiceDate ? (
                <span className="rounded-full bg-[#f1f4f9] px-3 py-1 font-semibold text-[#0b1738]">
                  {t("invoiceDate", { date: invoice.invoiceDate })}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
                className={filterChip(filter === "all", "bg-[#eef4ff] text-[#2878ff]")}
              >
                {t("filters.all", { count: lines.length })}
              </button>
              <button
                type="button"
                aria-pressed={filter === "matched"}
                onClick={() => setFilter("matched")}
                className={filterChip(filter === "matched", "bg-emerald-50 text-emerald-700")}
              >
                <CheckCircle2 className="size-3.5" />
                {t("matchedCount", { matched: lines.length - unmatched, total: lines.length })}
              </button>
              <button
                type="button"
                aria-pressed={filter === "unmatched"}
                onClick={() => setFilter("unmatched")}
                className={filterChip(filter === "unmatched", "bg-rose-50 text-rose-600")}
              >
                <AlertTriangle className="size-3.5" />
                {t("unmatchedCount", { count: unmatched })}
              </button>
              {unmatched > 0 ? (
                <button
                  type="button"
                  disabled={creatingAll || creatingKeys.size > 0}
                  onClick={() => void createUnmatched()}
                  className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-[#c4d5f0] bg-white px-3 text-[12px] font-bold text-[#2878ff] transition-colors hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingAll ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <PackagePlus className="size-3.5" />
                  )}
                  {tickedUnmatched > 0
                    ? t("createSelected", { count: tickedUnmatched })
                    : t("createAll", { count: unmatched })}
                </button>
              ) : null}
            </div>
            {draftKeys.size > 0 ? (
              <p className="flex items-center gap-1.5 rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                <AlertTriangle className="size-3.5 shrink-0" />
                {t("draftNote", { count: draftKeys.size })}
              </p>
            ) : null}

            <div className="max-h-[26rem] overflow-auto rounded-[12px] border border-[#e1e7f0]">
              <table className="w-full min-w-[52rem] text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-[#f7f9fd] text-[11.5px] font-semibold text-[#6b7b96]">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={t("table.selectAll")}
                        className="size-4 cursor-pointer accent-[#2878ff]"
                        checked={allVisibleTicked}
                        ref={(input) => {
                          if (input) input.indeterminate = someVisibleTicked && !allVisibleTicked
                        }}
                        disabled={visibleLines.length === 0}
                        onChange={toggleVisible}
                      />
                    </th>
                    <th className="px-3 py-2.5 text-start">{t("table.invoiceLine")}</th>
                    <th className="px-3 py-2.5 text-start">{t("table.qty")}</th>
                    <th className="px-3 py-2.5 text-start">{t("table.unitCost")}</th>
                    <th className="w-[19rem] px-3 py-2.5 text-start">{t("table.product")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map((line) => {
                    const source =
                      line.match && line.productId === line.match.productId ? line.match.by : null
                    const style = source ? MATCH_STYLE[source] : null
                    return (
                      <tr
                        key={line.key}
                        className={cn(
                          "border-t border-[#eef2f7] align-top",
                          !line.include && "bg-[#fbfcfe] opacity-60"
                        )}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={t("table.include", { name: line.name })}
                            className="size-4 cursor-pointer accent-[#2878ff]"
                            checked={line.include}
                            onChange={(event) =>
                              updateLine(line.key, { include: event.target.checked })
                            }
                          />
                        </td>
                        <td className="px-3 py-3">
                          <p className={cn("font-semibold", HEADING)}>{line.name}</p>
                          <p className={cn("mt-0.5 font-mono text-[11px]", MUTED)}>
                            {line.code ?? t("noCode")}
                          </p>
                        </td>
                        <td className={cn("px-3 py-3 font-semibold", HEADING)}>{line.qty}</td>
                        <td className={cn("px-3 py-3", HEADING)}>
                          {formatAmount(line.unitCost)}
                          {line.discount > 0 ? (
                            <p className={cn("text-[11px]", MUTED)}>
                              {t("discount", { amount: formatAmount(line.discount) })}
                            </p>
                          ) : null}
                        </td>
                        <td className="space-y-1.5 px-3 py-3">
                          <AppSearchableSelect
                            value={line.productId ?? ""}
                            options={productOptions}
                            onChange={(value) =>
                              updateLine(line.key, { productId: value, include: true })
                            }
                            placeholder={t("pickProduct")}
                            searchPlaceholder={t("searchProduct")}
                            emptyLabel={t("noProducts")}
                            ariaLabel={t("table.product")}
                          />
                          {createdKeys.has(line.key) && line.productId ? (
                            draftKeys.has(line.key) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-violet-700">
                                <PackagePlus className="size-3" />
                                {t("matchBy.created")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                                <PackagePlus className="size-3" />
                                {t("matchBy.createdActive", {
                                  price: formatAmount(Number(line.sellPrice)),
                                })}
                              </span>
                            )
                          ) : style ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                                style.className
                              )}
                            >
                              <style.icon className="size-3" />
                              {t(`matchBy.${source}`)}
                            </span>
                          ) : line.productId ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#2878ff]">
                              <CheckCircle2 className="size-3" />
                              {t("matchBy.manual")}
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="relative w-36">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="0.01"
                                    value={line.sellPrice}
                                    onChange={(event) =>
                                      updateLine(line.key, { sellPrice: event.target.value })
                                    }
                                    placeholder={t("sellPricePlaceholder")}
                                    aria-label={t("sellPriceLabel", { name: line.name })}
                                    className="h-8 w-full rounded-[8px] border border-[#e1e7f0] bg-white ps-2.5 pe-10 text-[12px] text-[#0b1738] outline-none placeholder:text-[#95a4bd] focus:border-[#2878ff]"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-[10.5px] font-semibold text-[#95a4bd]">
                                    SAR
                                  </span>
                                </div>
                                <span
                                  className={cn(
                                    "text-[10.5px]",
                                    Number(line.sellPrice) > 0 ? "text-emerald-700" : MUTED
                                  )}
                                >
                                  {Number(line.sellPrice) > 0
                                    ? t("sellPriceActiveHint")
                                    : t("sellPriceDraftHint")}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-600">
                                  <AlertTriangle className="size-3" />
                                  {t("matchBy.none")}
                                </span>
                                <button
                                  type="button"
                                  disabled={creatingAll || creatingKeys.has(line.key)}
                                  onClick={() => void createOne(line)}
                                  className="inline-flex items-center gap-1 rounded-full bg-[#2878ff] px-2.5 py-0.5 text-[10.5px] font-bold text-white transition-colors hover:bg-[#1f63d6] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {creatingKeys.has(line.key) ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <PackagePlus className="size-3" />
                                  )}
                                  {t("createProduct")}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {visibleLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={cn("px-3 py-10 text-center text-[12.5px]", MUTED)}>
                        {t("filters.empty")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
