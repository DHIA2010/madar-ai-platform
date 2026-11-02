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
  Sparkles,
  Type,
  UploadCloud,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppDialog, AppSearchableSelect } from "@/components/app"

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
  taxLevel,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierId: string
  supplierName: string
  taxLevel: CalculationLevel
  onApply: (invoice: AppliedInvoice) => void
}) {
  const t = useTranslations("purchases.invoiceScan")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const { products } = useProductCatalog()
  const inputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [invoice, setInvoice] = useState<ScannedInvoice | null>(null)
  const [lines, setLines] = useState<ReviewLine[]>([])

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
        }))
      )
      if (scanned.lines.length === 0) toast.error(t("toasts.noLines"))
    } catch (error) {
      // Only an invoice Claude actually looked at and couldn't read asks for a clearer file.
      const { code, status } = (error ?? {}) as { code?: string; status?: number }
      toast.error(
        code === "INVOICE_UNREADABLE"
          ? t("toasts.readFailed")
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
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                {t("matchedCount", { matched: lines.length - unmatched, total: lines.length })}
              </span>
              {unmatched > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-600">
                  <AlertTriangle className="size-3.5" />
                  {t("unmatchedCount", { count: unmatched })}
                </span>
              ) : null}
            </div>

            <div className="max-h-[26rem] overflow-auto rounded-[12px] border border-[#e1e7f0]">
              <table className="w-full min-w-[52rem] text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-[#f7f9fd] text-[11.5px] font-semibold text-[#6b7b96]">
                  <tr>
                    <th className="w-10 px-3 py-2.5" />
                    <th className="px-3 py-2.5 text-start">{t("table.invoiceLine")}</th>
                    <th className="px-3 py-2.5 text-start">{t("table.qty")}</th>
                    <th className="px-3 py-2.5 text-start">{t("table.unitCost")}</th>
                    <th className="w-[19rem] px-3 py-2.5 text-start">{t("table.product")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
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
                            className="size-4 cursor-pointer accent-[#2878ff] disabled:cursor-not-allowed"
                            checked={line.include && line.productId !== null}
                            disabled={!line.productId}
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
                          {style ? (
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-600">
                              <AlertTriangle className="size-3" />
                              {t("matchBy.none")}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
