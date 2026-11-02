"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ExternalLink, FileText, Plus, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppDateField, AppForm, AppInput, AppSearchableSelect } from "@/components/app"

import { useSuppliers } from "@/features/suppliers"
import { useWorkspace } from "@/features/workspace"

import { purchaseService } from "../services"
import {
  DEFAULT_PURCHASE_CURRENCY,
  EMPTY_PURCHASE_FORM_VALUES,
  type Purchase,
  type PurchaseFormValues,
} from "../types"
import { FIELD_CLASS, PANEL, PurchaseField, SuffixInput } from "./purchase-field"
import type { CalculationLevel } from "./purchase-line-items-table"
import { PurchaseLineItemsTable } from "./purchase-line-items-table"
import { type AppliedInvoice, SupplierInvoiceDialog } from "./supplier-invoice-dialog"

import { type Locale, localeDirection } from "@/i18n/locales"

// Tax can be entered per product line (each row's own "الضريبة %" column) or once for the whole
// invoice (the "الضريبة على الفاتورة" field below) -- never both at once, to avoid double-counting.
// There's no persisted "level" field on a purchase: switching the toggle just zeroes out whichever
// side goes inactive (see handleTaxLevelChange), so the existing orderTaxPercent/per-line
// taxPercent fields alone fully capture which level was actually used. Editing an existing purchase
// re-infers the level from whichever side already has a non-zero value.
//
// Discount has no such toggle -- a per-line discount and the invoice-level discountAmount are both
// always active and simply sum together in the summary (see displayedDiscount in
// purchase-line-items-table.tsx).
function inferTaxLevel(purchase: PurchaseFormValues): CalculationLevel {
  if (purchase.items.some((item) => item.taxPercent > 0)) return "product"
  if (purchase.orderTaxPercent > 0) return "invoice"
  return "product"
}

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
    invoiceAttachmentUrl: purchase.invoiceAttachmentUrl ?? null,
  }
}

export function PurchaseForm({ initialPurchase }: { initialPurchase?: Purchase }) {
  const t = useTranslations("purchases.form")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const { suppliers } = useSuppliers()
  const { availableWorkspaces } = useWorkspace()
  const isEditing = Boolean(initialPurchase)

  const [values, setValues] = useState<PurchaseFormValues>(() =>
    initialPurchase
      ? purchaseToFormValues(initialPurchase)
      : { ...EMPTY_PURCHASE_FORM_VALUES, date: new Date().toISOString().slice(0, 10) }
  )
  const [taxLevel, setTaxLevel] = useState<CalculationLevel>(() => inferTaxLevel(values))
  const [submitting, setSubmitting] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const selectedSupplier = suppliers.find((supplier) => supplier.id === values.supplierId)

  // Lines read from the supplier's invoice join the order; a product already on it gets the
  // invoice's quantity added rather than a second row.
  function applyInvoice(invoice: AppliedInvoice) {
    setValues((current) => {
      const items = [...current.items]
      for (const line of invoice.items) {
        const index = items.findIndex((item) => item.productId === line.productId)
        if (index === -1) items.push(line)
        else items[index] = { ...items[index], qty: items[index].qty + line.qty }
      }
      return {
        ...current,
        items,
        invoiceAttachmentUrl: invoice.attachmentUrl ?? current.invoiceAttachmentUrl,
        referenceNumber: current.referenceNumber.trim()
          ? current.referenceNumber
          : (invoice.invoiceNumber ?? ""),
      }
    })
  }

  function set<K extends keyof PurchaseFormValues>(key: K, value: PurchaseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleTaxLevelChange(level: CalculationLevel) {
    setTaxLevel(level)
    if (level === "product") {
      set("orderTaxPercent", 0)
    } else {
      setValues((current) => ({
        ...current,
        items: current.items.map((item) => ({ ...item, taxPercent: 0 })),
      }))
    }
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!values.supplierId || !values.date.trim() || !values.warehouseId) {
      toast.error(t("toasts.validationRequired"))
      return
    }
    if (values.items.length === 0) {
      toast.error(t("toasts.validationItems"))
      return
    }

    setSubmitting(true)
    try {
      if (initialPurchase) {
        await purchaseService.update(initialPurchase.id, values)
        toast.success(t("toasts.updateSuccess", { code: initialPurchase.code }))
      } else {
        const created = await purchaseService.create(values)
        toast.success(t("toasts.createSuccess", { code: created.code }))
      }
      router.push(ROUTES.purchases)
    } catch {
      toast.error(t("toasts.saveError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppForm dir={localeDirection(locale as Locale)} onSubmit={handleSubmit} className="space-y-5">
      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PurchaseField label={t("supplier")} required>
            <AppSearchableSelect
              value={values.supplierId}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
                hint: supplier.companyDetails.companyName,
              }))}
              onChange={handleSupplierChange}
              placeholder={t("supplierPlaceholder")}
              searchPlaceholder={t("supplierSearchPlaceholder")}
              emptyLabel={t("supplierEmptyLabel")}
              ariaLabel={t("supplier")}
            />
          </PurchaseField>
          <PurchaseField label={t("date")} required>
            <AppDateField value={values.date} onChange={(value) => set("date", value)} />
          </PurchaseField>
          <PurchaseField label={t("warehouse")} required>
            <AppSearchableSelect
              value={values.warehouseId}
              options={availableWorkspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
              }))}
              onChange={(value) => set("warehouseId", value)}
              placeholder={t("warehousePlaceholder")}
              searchPlaceholder={t("warehouseSearchPlaceholder")}
              emptyLabel={t("warehouseEmptyLabel")}
              ariaLabel={t("warehouse")}
            />
          </PurchaseField>
          <PurchaseField label={t("dueDate")}>
            <AppDateField value={values.dueDate} onChange={(value) => set("dueDate", value)} />
          </PurchaseField>
          <PurchaseField label={t("deliveryDate")}>
            <AppDateField
              value={values.deliveryDate}
              onChange={(value) => set("deliveryDate", value)}
            />
          </PurchaseField>
        </div>
      </section>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#dbe6fb] bg-gradient-to-l from-[#f4f8ff] to-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.3)]">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-[#0b1738]">{t("invoiceUpload.title")}</p>
              <p className="text-[12px] text-[#6b7b96]">
                {values.supplierId ? t("invoiceUpload.hint") : t("invoiceUpload.pickSupplierFirst")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {values.invoiceAttachmentUrl ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 py-1 ps-3 pe-1 text-[12px] font-semibold text-emerald-700">
                <FileText className="size-3.5" />
                <a
                  href={values.invoiceAttachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {t("invoiceUpload.attached")}
                  <ExternalLink className="size-3" />
                </a>
                <button
                  type="button"
                  aria-label={t("invoiceUpload.remove")}
                  onClick={() => set("invoiceAttachmentUrl", null)}
                  className="flex size-5 items-center justify-center rounded-full hover:bg-emerald-100"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : null}
            <AppButton
              type="button"
              disabled={!values.supplierId}
              onClick={() => setInvoiceOpen(true)}
              icon={<Sparkles className="size-4" />}
              className="h-10 gap-2 rounded-full bg-[#2878ff] px-4 text-[12.5px] font-bold text-white shadow-[0_6px_16px_rgba(40,120,255,0.28)] hover:bg-[#1f63d6] disabled:opacity-50 disabled:shadow-none"
            >
              {t("invoiceUpload.button")}
            </AppButton>
          </div>
        </div>
        <PurchaseLineItemsTable
          items={values.items}
          onItemsChange={(items) => set("items", items)}
          orderTaxPercent={values.orderTaxPercent}
          discountAmount={values.discountAmount}
          shippingAmount={values.shippingAmount}
          otherCosts={values.otherCosts}
          currency={values.currency}
          taxLevel={taxLevel}
          onTaxLevelChange={handleTaxLevelChange}
        />
      </section>

      <section className={cn(PANEL, "p-4 md:p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PurchaseField label={t("orderTax")}>
            <SuffixInput
              value={values.orderTaxPercent}
              onChange={(value) => set("orderTaxPercent", value)}
              suffix="%"
              disabled={taxLevel === "product"}
            />
          </PurchaseField>
          <PurchaseField label={t("orderDiscount")}>
            <SuffixInput
              value={values.discountAmount}
              onChange={(value) => set("discountAmount", value)}
              suffix={values.currency}
            />
          </PurchaseField>
          <PurchaseField label={t("shipping")}>
            <SuffixInput
              value={values.shippingAmount}
              onChange={(value) => set("shippingAmount", value)}
              suffix={values.currency}
            />
          </PurchaseField>
          <PurchaseField label={t("otherCosts")}>
            <SuffixInput
              value={values.otherCosts}
              onChange={(value) => set("otherCosts", value)}
              suffix={values.currency}
            />
          </PurchaseField>
        </div>

        <div className="mt-4">
          <PurchaseField label={t("referenceNumber")}>
            <AppInput
              value={values.referenceNumber}
              onChange={(event) => set("referenceNumber", event.target.value)}
              placeholder={t("referenceNumberPlaceholder")}
              className={FIELD_CLASS}
            />
          </PurchaseField>
        </div>

        <div className="mt-4">
          <PurchaseField label={t("notes")}>
            <textarea
              value={values.note}
              onChange={(event) => set("note", event.target.value)}
              placeholder={t("notesPlaceholder")}
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
          {tCommon("cancel")}
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
          {isEditing ? t("saveChanges") : t("createPurchase")}
        </AppButton>
      </div>
      {values.supplierId ? (
        <SupplierInvoiceDialog
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          supplierId={values.supplierId}
          supplierName={selectedSupplier?.name ?? ""}
          taxLevel={taxLevel}
          onApply={applyInvoice}
        />
      ) : null}
    </AppForm>
  )
}
