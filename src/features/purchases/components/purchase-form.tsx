"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDateField, AppForm, AppInput, AppSearchableSelect } from "@/components/app"

import { useSuppliers } from "@/features/suppliers"

import { purchaseService, WAREHOUSES } from "../services"
import {
  DEFAULT_PURCHASE_CURRENCY,
  EMPTY_PURCHASE_FORM_VALUES,
  type Purchase,
  type PurchaseFormValues,
} from "../types"
import { FIELD_CLASS, HEADING, PANEL, PurchaseField, SuffixInput } from "./purchase-field"
import { PurchaseLineItemsTable } from "./purchase-line-items-table"

function purchaseToFormValues(purchase: Purchase): PurchaseFormValues {
  return {
    supplierId: purchase.supplierId,
    warehouseId: purchase.warehouseId,
    date: purchase.date,
    dueDate: purchase.dueDate ?? "",
    deliveryDate: purchase.deliveryDate ?? "",
    status: purchase.status,
    items: purchase.items,
    orderTaxPercent: purchase.orderTaxPercent,
    discountAmount: purchase.discountAmount,
    shippingAmount: purchase.shippingAmount,
    otherCosts: purchase.otherCosts,
    currency: purchase.currency,
    paymentMethod: purchase.paymentMethod,
    referenceNumber: purchase.referenceNumber,
    note: purchase.note,
  }
}

export function PurchaseForm({ initialPurchase }: { initialPurchase?: Purchase }) {
  const router = useRouter()
  const { suppliers } = useSuppliers()
  const isEditing = Boolean(initialPurchase)

  const [values, setValues] = useState<PurchaseFormValues>(() =>
    initialPurchase
      ? purchaseToFormValues(initialPurchase)
      : { ...EMPTY_PURCHASE_FORM_VALUES, date: new Date().toISOString().slice(0, 10) }
  )
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof PurchaseFormValues>(key: K, value: PurchaseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  // Only SAR is supported anywhere in procurement, so a purchase's currency is always this fixed
  // value -- never chosen independently or derived per-supplier.
  function handleSupplierChange(supplierId: string) {
    setValues((current) => ({
      ...current,
      supplierId,
      currency: DEFAULT_PURCHASE_CURRENCY,
    }))
  }

  const currencyLabel = "ريال سعودي (SAR)"

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!values.supplierId || !values.date.trim() || !values.warehouseId) {
      toast.error("يرجى تعبئة المورد والتاريخ والمستودع.")
      return
    }
    if (values.items.length === 0) {
      toast.error("يرجى إضافة منتج واحد على الأقل.")
      return
    }

    setSubmitting(true)
    try {
      if (initialPurchase) {
        await purchaseService.update(initialPurchase.id, values)
        toast.success(`تم تحديث أمر الشراء ${initialPurchase.code}.`)
      } else {
        const created = await purchaseService.create(values)
        toast.success(`تم إنشاء أمر الشراء ${created.code}.`)
      }
      router.push(ROUTES.purchases)
    } catch {
      toast.error("تعذر حفظ أمر الشراء. حاول مرة أخرى.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppForm dir="rtl" onSubmit={handleSubmit} className="space-y-5">
      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PurchaseField label="المورد" required>
            <AppSearchableSelect
              value={values.supplierId}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
                hint: supplier.companyDetails.companyName,
              }))}
              onChange={handleSupplierChange}
              placeholder="اختر المورد"
              searchPlaceholder="ابحث عن مورد..."
              emptyLabel="لا يوجد موردون"
              ariaLabel="المورد"
            />
          </PurchaseField>
          <PurchaseField label="العملة">
            <div
              className={cn(
                "flex h-11 items-center justify-between rounded-[12px] border border-[#e1e7f0] bg-[#f7f9fd] px-3 text-[13px]",
                HEADING
              )}
            >
              <span className="font-semibold">{currencyLabel}</span>
              <span className="text-[11px] font-normal text-[#95a4bd]">حسب المورد</span>
            </div>
          </PurchaseField>
          <PurchaseField label="التاريخ" required>
            <AppDateField value={values.date} onChange={(value) => set("date", value)} />
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
              searchPlaceholder="ابحث..."
              emptyLabel="لا توجد مستودعات"
              ariaLabel="المستودع"
            />
          </PurchaseField>
          <PurchaseField label="تاريخ الإستحقاق">
            <AppDateField value={values.dueDate} onChange={(value) => set("dueDate", value)} />
          </PurchaseField>
          <PurchaseField label="تاريخ التوريد">
            <AppDateField
              value={values.deliveryDate}
              onChange={(value) => set("deliveryDate", value)}
            />
          </PurchaseField>
        </div>
      </section>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <PurchaseLineItemsTable
          items={values.items}
          onItemsChange={(items) => set("items", items)}
          orderTaxPercent={values.orderTaxPercent}
          discountAmount={values.discountAmount}
          shippingAmount={values.shippingAmount}
          otherCosts={values.otherCosts}
          currency={values.currency}
        />
      </section>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PurchaseField label="الضريبة على الفاتورة">
            <SuffixInput
              value={values.orderTaxPercent}
              onChange={(value) => set("orderTaxPercent", value)}
              suffix="%"
            />
          </PurchaseField>
          <PurchaseField label="الخصم على الفاتورة">
            <SuffixInput
              value={values.discountAmount}
              onChange={(value) => set("discountAmount", value)}
              suffix={values.currency}
            />
          </PurchaseField>
          <PurchaseField label="الشحن">
            <SuffixInput
              value={values.shippingAmount}
              onChange={(value) => set("shippingAmount", value)}
              suffix={values.currency}
            />
          </PurchaseField>
          <PurchaseField label="تكاليف أخرى">
            <SuffixInput
              value={values.otherCosts}
              onChange={(value) => set("otherCosts", value)}
              suffix={values.currency}
            />
          </PurchaseField>
        </div>

        <div className="mt-4">
          <PurchaseField label="رقم المرجع / الفاتورة">
            <AppInput
              value={values.referenceNumber}
              onChange={(event) => set("referenceNumber", event.target.value)}
              placeholder="رقم الفاتورة أو المرجع"
              className={FIELD_CLASS}
            />
          </PurchaseField>
        </div>

        <div className="mt-4">
          <PurchaseField label="ملاحظات">
            <textarea
              value={values.note}
              onChange={(event) => set("note", event.target.value)}
              placeholder="أضف ملاحظة قصيرة..."
              rows={3}
              className={cn(
                "w-full resize-none p-3 outline-none focus:border-[#2878ff]",
                FIELD_CLASS,
                "h-auto rounded-[12px] border"
              )}
            />
          </PurchaseField>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <AppButton
          type="button"
          variant="outline"
          className="h-11 rounded-[12px] border-[#c4d5f0] px-6 text-[13.5px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
          onClick={() => router.push(ROUTES.purchases)}
        >
          إلغاء
        </AppButton>
        <AppButton
          type="submit"
          loading={submitting}
          icon={
            isEditing ? undefined : (
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20">
                <Plus className="size-3.5" strokeWidth={2.5} />
              </span>
            )
          }
          className="h-11 gap-2 rounded-full bg-[#2878ff] px-6 text-[13.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] transition-all hover:-translate-y-px hover:bg-[#1f63d6] hover:shadow-[0_8px_20px_rgba(40,120,255,0.34)] active:translate-y-0"
        >
          {isEditing ? "حفظ التغييرات" : "إنشاء أمر الشراء"}
        </AppButton>
      </div>
    </AppForm>
  )
}
