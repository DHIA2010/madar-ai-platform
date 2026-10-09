"use client"

import { type KeyboardEvent, useMemo, useState } from "react"
import Link from "next/link"
import { ScanLine, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppInput } from "@/components/app"

import type { ProductRecord } from "@/features/products"

import { useProductCatalog } from "../hooks"
import {
  DEFAULT_PURCHASE_CURRENCY,
  lineItemSubtotal,
  purchaseGrandTotal,
  purchaseItemsSubtotal,
  type PurchaseLineItem,
} from "../types"
import { FIELD_CLASS, HEADING, MUTED, PANEL } from "./purchase-field"

const DEFAULT_TAX_PERCENT = 15

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    // currency isn't a valid ISO 4217 code -- fall back to a plain number with the code suffixed
    // rather than crashing the page.
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`
  }
}

export function PurchaseLineItemsTable({
  items,
  onItemsChange,
  orderTaxPercent,
  discountAmount,
  shippingAmount,
  otherCosts,
  currency = DEFAULT_PURCHASE_CURRENCY,
}: {
  items: PurchaseLineItem[]
  onItemsChange: (items: PurchaseLineItem[]) => void
  orderTaxPercent: number
  discountAmount: number
  shippingAmount: number
  otherCosts: number
  currency?: string
}) {
  // Real products only (useProductCatalog already filters to native "Madar" ones) -- a purchase
  // line item's productId is a real foreign key on the backend, so only products that actually
  // exist there can be picked.
  const { products, isLoading } = useProductCatalog()

  const [searchValue, setSearchValue] = useState("")
  const [resultsOpen, setResultsOpen] = useState(false)

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )

  const filteredProducts = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) return []
    return products
      .filter((product) => !items.some((item) => item.productId === product.id))
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
      )
      .slice(0, 8)
  }, [products, items, searchValue])

  function addLineItem(product: ProductRecord) {
    if (items.some((item) => item.productId === product.id)) {
      // Scanning (or re-selecting) a product already on the order bumps its quantity instead of
      // adding a duplicate row -- matches how a barcode scanner is actually used at a receiving desk.
      onItemsChange(
        items.map((item) => (item.productId === product.id ? { ...item, qty: item.qty + 1 } : item))
      )
      return
    }
    onItemsChange([
      ...items,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        netUnitCost: product.costPrice ?? 0,
        qty: 1,
        discount: 0,
        taxPercent: DEFAULT_TAX_PERCENT,
      },
    ])
  }

  function handleSelectProduct(product: ProductRecord) {
    addLineItem(product)
    setSearchValue("")
    setResultsOpen(false)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return
    event.preventDefault()
    const query = searchValue.trim().toLowerCase()
    if (!query) return

    const exactSkuMatch = products.find((product) => product.sku.toLowerCase() === query)
    if (exactSkuMatch) {
      handleSelectProduct(exactSkuMatch)
      return
    }
    if (filteredProducts.length > 0) {
      handleSelectProduct(filteredProducts[0])
      return
    }
    toast.error(
      `لم يتم العثور على منتج مطابق لـ "${searchValue.trim()}". أضفه من صفحة المنتجات أولاً.`
    )
  }

  function updateItem(id: string, patch: Partial<PurchaseLineItem>) {
    onItemsChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeItem(id: string) {
    onItemsChange(items.filter((item) => item.id !== id))
  }

  const subtotal = purchaseItemsSubtotal(items)
  const grandTotal = purchaseGrandTotal({
    items,
    orderTaxPercent,
    discountAmount,
    shippingAmount,
    otherCosts,
  })

  return (
    <div className="space-y-4">
      <div className="relative">
        <AppInput
          value={searchValue}
          onChange={(event) => {
            setSearchValue(event.target.value)
            setResultsOpen(true)
          }}
          onFocus={() => setResultsOpen(true)}
          onBlur={() => {
            // onMouseDown on the result rows below fires before this, so the click still
            // registers even though blur closes the list right after.
            setTimeout(() => setResultsOpen(false), 150)
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder={
            isLoading ? "جارٍ تحميل المنتجات..." : "ابحث أو امسح الباركود / رمز المنتج (SKU)..."
          }
          disabled={isLoading}
          startIcon={<ScanLine className="size-4" />}
          className={FIELD_CLASS}
        />
        {resultsOpen && searchValue.trim() ? (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[12px] border border-[#e1e7f0] bg-white shadow-lg">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onMouseDown={() => handleSelectProduct(product)}
                  className="flex w-full items-center justify-between gap-3 border-b border-[#eef1f6] px-3 py-2.5 text-start last:border-b-0 hover:bg-[#f7f9fd]"
                >
                  <span className={cn("font-medium", HEADING)}>{product.name}</span>
                  <span className={cn("shrink-0 text-[11px]", MUTED)}>
                    {product.sku} · المخزون: {product.availableStock ?? "—"} ·{" "}
                    {formatMoney(product.costPrice ?? 0, currency)}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-2.5 text-[12px] text-[#95a4bd]">
                لم يتم العثور على منتج مطابق.{" "}
                <Link
                  href={ROUTES.productsAdd}
                  target="_blank"
                  className="font-semibold text-[#2878ff] hover:underline"
                >
                  أضفه من صفحة المنتجات
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className={cn(PANEL, "overflow-hidden")}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[#e1e7f0] bg-[#f7f9fd] text-start">
              <th className={cn("px-3 py-2.5 text-start font-semibold", MUTED)}>المنتج</th>
              <th className={cn("px-3 py-2.5 text-start font-semibold", MUTED)}>تكلفة الوحدة</th>
              <th className={cn("px-3 py-2.5 text-start font-semibold", MUTED)}>المخزون الحالي</th>
              <th className={cn("w-20 px-3 py-2.5 text-start font-semibold", MUTED)}>الكمية</th>
              <th className={cn("w-24 px-3 py-2.5 text-start font-semibold", MUTED)}>الخصم</th>
              <th className={cn("w-20 px-3 py-2.5 text-start font-semibold", MUTED)}>الضريبة %</th>
              <th className={cn("px-3 py-2.5 text-start font-semibold", MUTED)}>الإجمالي الفرعي</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className={cn("px-3 py-8 text-center text-[13px]", MUTED)}>
                  لم يتم اختيار أي منتج
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-[#eef1f6] last:border-b-0">
                  <td className={cn("px-3 py-2.5 font-medium", HEADING)}>
                    {item.productName}
                    <span className={cn("block text-[10.5px] font-normal", MUTED)}>{item.sku}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.netUnitCost}
                      onChange={(event) =>
                        updateItem(item.id, {
                          netUnitCost: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      className={cn(
                        "h-9 w-full rounded-[8px] border px-2 text-[12.5px]",
                        FIELD_CLASS,
                        "h-9"
                      )}
                    />
                  </td>
                  <td className={cn("px-3 py-2.5", MUTED)}>
                    {productById.get(item.productId)?.availableStock ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(event) =>
                        updateItem(item.id, { qty: Math.max(1, Number(event.target.value) || 1) })
                      }
                      className={cn(
                        "h-9 w-full rounded-[8px] border px-2 text-[12.5px]",
                        FIELD_CLASS,
                        "h-9"
                      )}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={0}
                      value={item.discount}
                      onChange={(event) =>
                        updateItem(item.id, {
                          discount: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      className={cn(
                        "h-9 w-full rounded-[8px] border px-2 text-[12.5px]",
                        FIELD_CLASS,
                        "h-9"
                      )}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={item.taxPercent}
                      onChange={(event) =>
                        updateItem(item.id, {
                          taxPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                        })
                      }
                      className={cn(
                        "h-9 w-full rounded-[8px] border px-2 text-[12.5px]",
                        FIELD_CLASS,
                        "h-9"
                      )}
                    />
                  </td>
                  <td className={cn("px-3 py-2.5 font-bold", HEADING)}>
                    {formatMoney(lineItemSubtotal(item), currency)}
                  </td>
                  <td className="px-3 py-2.5">
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="إزالة"
                      className="border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </AppButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-full max-w-[22rem] space-y-2 rounded-[12px] border border-[#e1e7f0] p-4">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={MUTED}>المجموع الفرعي</span>
            <span className={cn("font-semibold", HEADING)}>{formatMoney(subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={MUTED}>الضريبة على الفاتورة ({orderTaxPercent}%)</span>
            <span className={cn("font-semibold", HEADING)}>
              {formatMoney(subtotal * (orderTaxPercent / 100), currency)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={MUTED}>الخصم على الفاتورة</span>
            <span className="font-semibold text-rose-600">
              -{formatMoney(discountAmount, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={MUTED}>الشحن</span>
            <span className={cn("font-semibold", HEADING)}>
              {formatMoney(shippingAmount, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={MUTED}>تكاليف أخرى</span>
            <span className={cn("font-semibold", HEADING)}>
              {formatMoney(Number.isFinite(otherCosts) ? otherCosts : 0, currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-[#e1e7f0] pt-2 text-[14px]">
            <span className={cn("font-extrabold", HEADING)}>الإجمالي الكلي</span>
            <span className="font-extrabold text-[#2878ff]">
              {formatMoney(grandTotal, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
