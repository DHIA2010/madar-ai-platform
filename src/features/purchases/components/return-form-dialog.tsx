"use client"

import { type KeyboardEvent, useEffect, useMemo, useState } from "react"
import { CheckCheck, ScanLine, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppDateField, AppDialog, AppInput, AppSearchableSelect } from "@/components/app"

import type { Supplier } from "@/features/suppliers"

import { returnService, WAREHOUSES } from "../services"
import {
  EMPTY_RETURN_FORM_VALUES,
  type Purchase,
  type PurchaseReturn,
  type ReturnFormValues,
  returnItemsTotalAmount,
  returnItemsTotalQty,
} from "../types"
import { FIELD_CLASS, PurchaseField } from "./purchase-field"

function formatMoney(value: number) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`
}

// Create-only -- there's no edit flow in the current UI (no edit button on a return row) and no
// backend endpoint for a full return update (only create + a status-only PATCH, see
// src/identity-platform/procurement/returns-service.ts), so this dialog never took an
// initialReturn to begin with in practice.
export function ReturnFormDialog({
  open,
  onOpenChange,
  purchases,
  suppliers,
  allReturns,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchases: Purchase[]
  suppliers: Supplier[]
  allReturns: PurchaseReturn[]
  onCreated: () => void
}) {
  const [values, setValues] = useState<ReturnFormValues>(EMPTY_RETURN_FORM_VALUES)
  const [submitting, setSubmitting] = useState(false)
  // The search box is a pure "find and add" control -- its dropdown closes the moment an item is
  // picked. Selected items live in `values.items` and render in their own always-visible list
  // below, independent of whatever's currently typed in the search box.
  const [itemSearch, setItemSearch] = useState("")
  const [searchResultsOpen, setSearchResultsOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(EMPTY_RETURN_FORM_VALUES)
      setItemSearch("")
      setSearchResultsOpen(false)
    }
  }, [open])

  function set<K extends keyof ReturnFormValues>(key: K, value: ReturnFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handlePurchaseChange(purchaseId: string) {
    const purchase = purchases.find((entry) => entry.id === purchaseId)
    setValues((current) => ({
      ...current,
      purchaseId,
      supplierId: purchase?.supplierId ?? current.supplierId,
      warehouseId: purchase?.warehouseId ?? current.warehouseId,
      // A return's items belong to one specific purchase -- switching the purchase invalidates
      // whatever was selected before.
      items: [],
    }))
    setItemSearch("")
    setSearchResultsOpen(false)
  }

  const selectedPurchase: Purchase | undefined = purchases.find(
    (entry) => entry.id === values.purchaseId
  )

  // How many units of each product this purchase has already had returned, across every other
  // return against it -- caps how much more can be returned now, so the same unit can never be
  // returned twice. The backend re-validates this too (defense in depth), see returns-repository.ts.
  const alreadyReturnedByProduct = useMemo(() => {
    const map = new Map<string, number>()
    if (!selectedPurchase) return map
    for (const entry of allReturns) {
      if (entry.purchaseId !== selectedPurchase.id) continue
      for (const item of entry.items) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.qty)
      }
    }
    return map
  }, [allReturns, selectedPurchase])

  function maxReturnableFor(productId: string, purchasedQty: number): number {
    return Math.max(0, purchasedQty - (alreadyReturnedByProduct.get(productId) ?? 0))
  }

  // Sets every item on the purchase to its full remaining returnable qty in one click -- they
  // immediately show up in the persistent selected-items list below.
  function selectAllItems() {
    if (!selectedPurchase) return
    const items = selectedPurchase.items
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unitCost: item.netUnitCost,
        qty: maxReturnableFor(item.productId, item.qty),
      }))
      .filter((item) => item.qty > 0)
    setValues((current) => ({ ...current, items }))
  }

  function deselectAllItems() {
    setValues((current) => ({ ...current, items: [] }))
  }

  // True once every returnable item on the purchase is fully selected -- flips the button from
  // "تحديد الكل" to "إلغاء التحديد" so it reads as a toggle, not a one-way action.
  const isAllSelected = useMemo(() => {
    if (!selectedPurchase) return false
    const returnable = selectedPurchase.items
      .map((item) => ({
        productId: item.productId,
        maxQty: Math.max(0, item.qty - (alreadyReturnedByProduct.get(item.productId) ?? 0)),
      }))
      .filter((item) => item.maxQty > 0)
    if (returnable.length === 0) return false
    return returnable.every((item) => {
      const currentQty = values.items.find((entry) => entry.productId === item.productId)?.qty ?? 0
      return currentQty === item.maxQty
    })
  }, [selectedPurchase, values.items, alreadyReturnedByProduct])

  // Dropdown suggestions for the search box -- only products not already selected, so once an
  // item is added it drops out of "things you can still add" and shows up in the selected list
  // below instead (mirrors purchase-line-items-table's product search).
  const filteredSearchItems = useMemo(() => {
    if (!selectedPurchase) return []
    const query = itemSearch.trim().toLowerCase()
    if (!query) return []
    return selectedPurchase.items
      .filter((item) => !values.items.some((entry) => entry.productId === item.productId))
      .filter((item) => {
        const maxQty = Math.max(0, item.qty - (alreadyReturnedByProduct.get(item.productId) ?? 0))
        return maxQty > 0
      })
      .filter(
        (item) =>
          item.productName.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query)
      )
      .slice(0, 8)
  }, [selectedPurchase, itemSearch, values.items, alreadyReturnedByProduct])

  function setItemQty(
    product: { productId: string; productName: string; sku: string; unitCost: number },
    purchasedQty: number,
    qty: number
  ) {
    const clamped = Math.max(0, Math.min(qty, maxReturnableFor(product.productId, purchasedQty)))
    setValues((current) => {
      const withoutItem = current.items.filter((entry) => entry.productId !== product.productId)
      if (clamped <= 0) return { ...current, items: withoutItem }
      return {
        ...current,
        items: [...withoutItem, { ...product, qty: clamped }],
      }
    })
  }

  // Picking a suggestion adds it at its full returnable qty (fixing the "defaults to 0" issue)
  // and closes the dropdown -- the item now appears in the persistent selected list instead.
  function addItemToSelection(item: {
    productId: string
    productName: string
    sku: string
    netUnitCost: number
    qty: number
  }) {
    setItemQty(
      {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unitCost: item.netUnitCost,
      },
      item.qty,
      item.qty
    )
    setItemSearch("")
    setSearchResultsOpen(false)
  }

  function removeSelectedItem(productId: string) {
    setValues((current) => ({
      ...current,
      items: current.items.filter((entry) => entry.productId !== productId),
    }))
  }

  // Enter on an exact SKU match adds that item directly, matching the scan-to-add convention
  // already used in the purchase line-items table.
  function handleItemSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return
    event.preventDefault()
    if (!selectedPurchase) return
    const query = itemSearch.trim().toLowerCase()
    if (!query) return
    const exactMatch = selectedPurchase.items.find((item) => item.sku.toLowerCase() === query)
    if (!exactMatch) {
      if (filteredSearchItems.length > 0) {
        addItemToSelection(filteredSearchItems[0])
      } else {
        toast.error(`لم يتم العثور على منتج مطابق لـ "${itemSearch.trim()}".`)
      }
      return
    }
    const maxQty = maxReturnableFor(exactMatch.productId, exactMatch.qty)
    if (maxQty <= 0) {
      toast.error(`تم إرجاع "${exactMatch.productName}" بالكامل مسبقًا.`)
      setItemSearch("")
      return
    }
    addItemToSelection(exactMatch)
    toast.success(`تمت إضافة ${exactMatch.productName} (الكمية ${maxQty}).`)
  }

  // The always-visible list of currently selected items, independent of search state.
  const selectedRows = useMemo(() => {
    if (!selectedPurchase) return []
    return values.items.map((entry) => {
      const purchaseItem = selectedPurchase.items.find((item) => item.productId === entry.productId)
      const purchasedQty = purchaseItem?.qty ?? entry.qty
      const maxQty = Math.max(
        0,
        purchasedQty - (alreadyReturnedByProduct.get(entry.productId) ?? 0)
      )
      return { ...entry, purchasedQty, maxQty }
    })
  }, [selectedPurchase, values.items, alreadyReturnedByProduct])

  const totalReturnQty = returnItemsTotalQty(values.items)
  const totalReturnAmount = returnItemsTotalAmount(values.items)

  async function handleSubmit() {
    if (!values.purchaseId || !values.warehouseId || !values.returnDate.trim()) {
      toast.error("يرجى تعبئة أمر الشراء والمستودع وتاريخ الإرجاع.")
      return
    }
    if (values.items.length === 0 || totalReturnQty <= 0) {
      toast.error("يرجى تحديد كمية الإرجاع لصنف واحد على الأقل.")
      return
    }

    setSubmitting(true)
    try {
      const created = await returnService.create(values)
      toast.success(`تم إنشاء المرتجع ${created.code}.`)
      onCreated()
      onOpenChange(false)
    } catch {
      toast.error("تعذر حفظ المرتجع. حاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
      title={
        <span dir="rtl" className="text-[18px] font-extrabold text-[#0b1738]">
          إضافة مرتجع شراء
        </span>
      }
      contentClassName="[direction:rtl] max-w-[36rem] gap-5 p-6"
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            variant="outline"
            className="h-11 flex-1 rounded-[10px] text-[13.5px] font-semibold"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            إلغاء
          </AppButton>
          <AppButton
            loading={submitting}
            className="h-11 flex-1 rounded-[10px] bg-[#2878ff] text-[13.5px] font-bold text-white hover:bg-[#1f63d6]"
            onClick={() => void handleSubmit()}
          >
            حفظ المرتجع
          </AppButton>
        </div>
      }
    >
      <div dir="rtl" className="max-h-[70vh] space-y-4 overflow-y-auto pe-1">
        <PurchaseField label="أمر الشراء" required>
          <AppSearchableSelect
            value={values.purchaseId}
            options={purchases.map((purchase) => ({
              value: purchase.id,
              label: purchase.code,
              hint: purchase.supplierName,
            }))}
            onChange={handlePurchaseChange}
            placeholder="اختر أمر الشراء"
            searchPlaceholder="ابحث برقم الطلب..."
            emptyLabel="لا توجد أوامر شراء"
            ariaLabel="أمر الشراء"
          />
        </PurchaseField>

        <div className="grid grid-cols-2 gap-4">
          <PurchaseField label="المورد">
            <AppInput
              value={suppliers.find((entry) => entry.id === values.supplierId)?.name ?? ""}
              disabled
              className={cn(FIELD_CLASS, "bg-[#f7f9fd]")}
            />
          </PurchaseField>
          <PurchaseField label="المستودع" required>
            <AppSearchableSelect
              value={values.warehouseId}
              options={WAREHOUSES.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.name,
              }))}
              onChange={(value) => set("warehouseId", value)}
              placeholder="اختر المستودع"
              ariaLabel="المستودع"
            />
          </PurchaseField>
        </div>

        <PurchaseField label="العناصر القابلة للإرجاع" required>
          {!selectedPurchase ? (
            <p className="rounded-[12px] border border-dashed border-[#e1e7f0] p-4 text-center text-[12.5px] text-[#95a4bd]">
              اختر أمر الشراء أولاً لعرض عناصره.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <AppInput
                    placeholder="ابحث أو امسح الباركود / رمز المنتج (SKU)..."
                    value={itemSearch}
                    onChange={(event) => {
                      setItemSearch(event.target.value)
                      setSearchResultsOpen(true)
                    }}
                    onFocus={() => setSearchResultsOpen(true)}
                    onBlur={() => {
                      // onMouseDown on the result rows below fires before this, so the click
                      // still registers even though blur closes the list right after.
                      setTimeout(() => setSearchResultsOpen(false), 150)
                    }}
                    onKeyDown={handleItemSearchKeyDown}
                    startIcon={<ScanLine className="size-4" />}
                    className={cn(FIELD_CLASS, "h-9")}
                  />
                  {searchResultsOpen && itemSearch.trim() ? (
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-[10px] border border-[#e1e7f0] bg-white shadow-lg">
                      {filteredSearchItems.length > 0 ? (
                        filteredSearchItems.map((item) => {
                          const maxQty = maxReturnableFor(item.productId, item.qty)
                          return (
                            <button
                              key={item.productId}
                              type="button"
                              onMouseDown={() => addItemToSelection(item)}
                              className="flex w-full items-center justify-between gap-3 border-b border-[#eef1f6] px-3 py-2.5 text-start last:border-b-0 hover:bg-[#f7f9fd]"
                            >
                              <span className="truncate text-[12.5px] font-medium text-[#0b1738]">
                                {item.productName}
                              </span>
                              <span className="shrink-0 text-[11px] text-[#95a4bd]">
                                {item.sku} · القابل للإرجاع {maxQty}
                              </span>
                            </button>
                          )
                        })
                      ) : (
                        <p className="px-3 py-2.5 text-center text-[12px] text-[#95a4bd]">
                          لا توجد منتجات مطابقة.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
                <AppButton
                  type="button"
                  variant="outline"
                  icon={
                    isAllSelected ? <X className="size-4" /> : <CheckCheck className="size-4" />
                  }
                  className={cn(
                    "h-9 shrink-0 gap-1.5 rounded-[10px] px-3 text-[12px] font-semibold",
                    isAllSelected
                      ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                      : "border-[#c4d5f0] text-[#2878ff] hover:bg-[#eef4ff]"
                  )}
                  onClick={isAllSelected ? deselectAllItems : selectAllItems}
                >
                  {isAllSelected ? "إلغاء التحديد" : "تحديد الكل"}
                </AppButton>
              </div>
              {selectedRows.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-[#e1e7f0] p-4 text-center text-[12px] text-[#95a4bd]">
                  ابحث عن منتج لإضافته، أو اضغط &quot;تحديد الكل&quot; لإضافة جميع العناصر.
                </p>
              ) : (
                selectedRows.map((item) => (
                  <div
                    key={item.productId}
                    role="button"
                    tabIndex={0}
                    onClick={() => removeSelectedItem(item.productId)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return
                      event.preventDefault()
                      removeSelectedItem(item.productId)
                    }}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-[#2878ff] bg-[#f3f7ff] p-3 transition-colors hover:border-rose-300 hover:bg-rose-50"
                    title="اضغط لإزالة الصنف"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-[#0b1738]">
                        {item.productName}
                      </p>
                      <p className="text-[11px] text-[#95a4bd]">
                        {item.sku} · تم شراء {item.purchasedQty} · القابل للإرجاع {item.maxQty}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={item.maxQty}
                      value={item.qty}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setItemQty(
                          {
                            productId: item.productId,
                            productName: item.productName,
                            sku: item.sku,
                            unitCost: item.unitCost,
                          },
                          item.purchasedQty,
                          Number(event.target.value) || 0
                        )
                      }
                      className={cn(
                        "h-9 w-20 shrink-0 rounded-[8px] border px-2 text-center text-[12.5px]",
                        FIELD_CLASS,
                        "h-9"
                      )}
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </PurchaseField>

        {values.items.length > 0 ? (
          <div className="flex items-center justify-between rounded-[10px] bg-[#f7f9fd] px-3 py-2.5 text-[12.5px]">
            <span className="font-semibold text-[#0b1738]">
              إجمالي الكمية المرتجعة: {totalReturnQty} صنف
            </span>
            <span className="font-bold text-[#2878ff]">
              إجمالي المبلغ: {formatMoney(totalReturnAmount)}
            </span>
          </div>
        ) : null}

        <PurchaseField label="تاريخ الإرجاع" required>
          <AppDateField value={values.returnDate} onChange={(value) => set("returnDate", value)} />
        </PurchaseField>

        <PurchaseField label="ملاحظات الإرجاع">
          <textarea
            value={values.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="أضف وصفًا مختصرًا للإرجاع..."
            rows={3}
            className={cn(
              "w-full resize-none p-3 outline-none focus:border-[#2878ff]",
              FIELD_CLASS,
              "h-auto rounded-[12px] border"
            )}
          />
        </PurchaseField>
      </div>
    </AppDialog>
  )
}
