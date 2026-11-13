"use client"

import { type ReactNode, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight, FileText, Save } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppDateField,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { customerListService, type CustomerRecord } from "@/features/customers"
import { productListService, type ProductRecord } from "@/features/products"

import { emptyLine, emptyParty, PAYMENT_MEANS, SECTORS } from "../domain/catalog"
import { computeTotals } from "../domain/totals"
import { todayString, useInvoicingError } from "../hooks/use-invoicing"
import { salesInvoiceService } from "../services/invoicing.service"
import type {
  AdvanceOption,
  DiscountType,
  DocumentLine,
  InvoiceInput,
  InvoiceKind,
  Party,
  PaymentMeans,
  QuotationDetail,
  QuotationInput,
  SalesInvoiceDetail,
  Sector,
  TaxType,
} from "../types/invoicing.types"
import { CustomerSection } from "./customer-section"
import { type EditorLine, LinesEditor, withKey, withoutKey } from "./lines-editor"
import {
  Field,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  Segmented,
  TextArea,
  TextInput,
} from "./primitives"
import { FIELD, HEADING, MUTED, PANEL, SECTION_TITLE } from "./styles"
import { prepaidTotal, TotalsCard } from "./totals-card"

import { type Locale, localeDirection } from "@/i18n/locales"

// Everything either document can hold; a quotation ignores the invoice fields and the reverse.
export interface EditorValues {
  sector: Sector
  customerId: string | null
  customer: Party
  title: string | null
  reference: string | null
  issueDate: string
  discountType: DiscountType
  discountValue: number
  retentionPercent: number
  paymentTerms: string | null
  terms: string | null
  notes: string | null
  lines: DocumentLine[]
  validUntil: string | null
  advancePercent: number
  taxType: TaxType
  invoiceKind: InvoiceKind
  quotationId: string | null
  supplyDate: string | null
  supplyEndDate: string | null
  dueDate: string | null
  paymentMeans: PaymentMeans
  claimNumber: number | null
  prepayments: InvoiceInput["prepayments"]
}

export const emptyEditorValues = (): EditorValues => ({
  sector: "general",
  customerId: null,
  customer: emptyParty(),
  title: null,
  reference: null,
  issueDate: todayString(),
  discountType: "amount",
  discountValue: 0,
  retentionPercent: 0,
  paymentTerms: null,
  terms: null,
  notes: null,
  lines: [emptyLine()],
  validUntil: todayString(30),
  advancePercent: 0,
  taxType: "standard",
  invoiceKind: "regular",
  quotationId: null,
  supplyDate: null,
  supplyEndDate: null,
  dueDate: null,
  paymentMeans: "30",
  claimNumber: null,
  prepayments: [],
})

const baseInput = (values: EditorValues) => ({
  sector: values.sector,
  customerId: values.customerId,
  customer: values.customer,
  title: values.title,
  reference: values.reference,
  issueDate: values.issueDate,
  discountType: values.discountType,
  discountValue: values.discountValue,
  retentionPercent: values.retentionPercent,
  paymentTerms: values.paymentTerms,
  terms: values.terms,
  notes: values.notes,
  lines: values.lines,
})

export const toQuotationInput = (values: EditorValues): QuotationInput => ({
  ...baseInput(values),
  validUntil: values.validUntil,
  advancePercent: values.advancePercent,
})

export const toInvoiceInput = (values: EditorValues): InvoiceInput => ({
  ...baseInput(values),
  retentionPercent: values.invoiceKind === "advance" ? 0 : values.retentionPercent,
  taxType: values.taxType,
  invoiceKind: values.invoiceKind,
  quotationId: values.quotationId,
  supplyDate: values.supplyDate,
  supplyEndDate: values.supplyEndDate,
  dueDate: values.dueDate,
  paymentMeans: values.paymentMeans,
  claimNumber: values.invoiceKind === "progress" ? values.claimNumber : null,
  prepayments: values.invoiceKind === "advance" ? [] : values.prepayments,
})

// A saved line as the editor holds it: the fields a document sends, without the server's totals.
const editableLine = (line: DocumentLine): DocumentLine => ({
  lineType: line.lineType,
  productId: line.productId,
  quotationLineId: line.quotationLineId,
  description: line.description,
  details: line.details,
  unit: line.unit,
  quantity: line.quantity,
  unitPrice: line.unitPrice,
  discountPercent: line.discountPercent,
  taxCategory: line.taxCategory,
  taxRate: line.taxRate,
  exemptionCode: line.exemptionCode,
  exemptionReason: line.exemptionReason,
  progressPrevious: line.progressPrevious,
  progressCurrent: line.progressCurrent,
})

export const quotationToValues = (quotation: QuotationDetail): EditorValues => ({
  ...emptyEditorValues(),
  sector: quotation.sector,
  customerId: quotation.customerId,
  customer: quotation.customer,
  title: quotation.title,
  reference: quotation.reference,
  issueDate: quotation.issueDate.slice(0, 10),
  discountType: quotation.discountType,
  discountValue: quotation.discountValue,
  retentionPercent: quotation.retentionPercent,
  paymentTerms: quotation.paymentTerms,
  terms: quotation.terms,
  notes: quotation.notes,
  lines: quotation.lines.map((line) => ({ ...editableLine(line), quotationLineId: null })),
  validUntil: quotation.validUntil ? quotation.validUntil.slice(0, 10) : null,
  advancePercent: quotation.advancePercent,
})

export const invoiceToValues = (invoice: SalesInvoiceDetail): EditorValues => ({
  ...emptyEditorValues(),
  sector: invoice.sector,
  customerId: invoice.customerId,
  customer: invoice.customer,
  title: invoice.title,
  reference: invoice.reference,
  issueDate: todayString(),
  discountType: invoice.discountType,
  discountValue: invoice.discountValue,
  retentionPercent: invoice.retentionPercent,
  paymentTerms: invoice.paymentTerms,
  terms: invoice.terms,
  notes: invoice.notes,
  lines: invoice.lines.map(editableLine),
  taxType: invoice.taxType,
  invoiceKind: invoice.invoiceKind,
  quotationId: invoice.quotationId,
  supplyDate: invoice.supplyDate ? invoice.supplyDate.slice(0, 10) : null,
  supplyEndDate: invoice.supplyEndDate ? invoice.supplyEndDate.slice(0, 10) : null,
  dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : null,
  paymentMeans: invoice.paymentMeans,
  claimNumber: invoice.claimNumber,
  prepayments: invoice.prepayments.map((entry) => ({
    advanceInvoiceId: entry.advanceInvoiceId,
    netAmount: entry.netAmount,
  })),
})

const VALIDITY_PRESETS = [7, 15, 30, 60]
const DUE_PRESETS = [0, 15, 30, 60]

export function DocumentEditor({
  kind,
  heading,
  subheading,
  backHref,
  initial,
  quotation = null,
  invoiceId = null,
  banner,
  onSubmit,
}: {
  kind: "quotation" | "invoice"
  heading: string
  subheading?: string
  backHref: string
  initial: EditorValues
  // The quotation an invoice bills (fixes its kind and feeds a progress claim's quantities).
  quotation?: QuotationDetail | null
  invoiceId?: string | null
  banner?: ReactNode
  onSubmit: (values: EditorValues) => Promise<void>
}) {
  const t = useTranslations("invoicing.editor")
  const tSectors = useTranslations("invoicing.sectors")
  const tMeans = useTranslations("invoicing.paymentMeans")
  const tCommon = useTranslations("invoicing.common")
  const locale = useLocale() as Locale
  const describeError = useInvoicingError()
  const [values, setValues] = useState<EditorValues>(initial)
  const [lines, setLines] = useState<EditorLine[]>(() => initial.lines.map(withKey))
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [advances, setAdvances] = useState<AdvanceOption[]>([])
  // Until the list answers, the prepayments an invoice already holds are kept as they are.
  const [advancesReady, setAdvancesReady] = useState(false)
  const [syncCustomer, setSyncCustomer] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<EditorValues>) => setValues((current) => ({ ...current, ...patch }))

  useEffect(() => {
    let cancelled = false
    customerListService
      .listCustomers()
      .then((items) => !cancelled && setCustomers(items))
      .catch(() => undefined)
    productListService
      .listProducts()
      .then(
        (items) => !cancelled && setProducts(items.filter((item) => item.status !== "Archived"))
      )
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Issued advance payment invoices this invoice may deduct: the same quotation's or customer's.
  const advanceInvoice = values.invoiceKind === "advance"
  useEffect(() => {
    if (kind !== "invoice" || advanceInvoice || (!values.customerId && !values.quotationId)) {
      setAdvances([])
      setAdvancesReady(true)
      return
    }
    let cancelled = false
    setAdvancesReady(false)
    salesInvoiceService
      .advances({
        customerId: values.customerId,
        quotationId: values.quotationId,
        excludeInvoiceId: invoiceId,
      })
      .then((items) => {
        if (cancelled) return
        setAdvances(items)
        setAdvancesReady(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [kind, advanceInvoice, values.customerId, values.quotationId, invoiceId])

  const totals = useMemo(
    () => computeTotals(lines, { type: values.discountType, value: values.discountValue }),
    [lines, values.discountType, values.discountValue]
  )
  const contractQuantities = useMemo(() => {
    if (kind !== "invoice" || values.invoiceKind !== "progress" || !quotation) return null
    return Object.fromEntries(quotation.lines.map((line) => [line.id, line.quantity]))
  }, [kind, values.invoiceKind, quotation])
  const business = kind === "invoice" ? values.taxType === "standard" : true
  const showRetention =
    !advanceInvoice && (values.sector === "contracting" || values.retentionPercent > 0)
  const Back = localeDirection(locale) === "rtl" ? ArrowRight : ArrowLeft

  const submit = async () => {
    const items = lines.filter((line) => line.lineType === "item")
    if (!values.customer.name.trim()) {
      toast.error(t("validation.customer"))
      return
    }
    if (!items.length) {
      toast.error(t("validation.items"))
      return
    }
    if (items.some((line) => !line.description.trim())) {
      toast.error(t("validation.description"))
      return
    }
    if (items.some((line) => line.taxCategory !== "S" && !line.exemptionReason?.trim())) {
      toast.error(t("validation.exemption"))
      return
    }
    const prepaid = prepaidTotal(values.prepayments, advances)
    if (kind === "invoice" && !advanceInvoice && prepaid > totals.totalAmount + 0.004) {
      toast.error(t("validation.prepaid"))
      return
    }
    setSaving(true)
    try {
      let customerId = values.customerId
      if (syncCustomer) {
        const { customer } = values
        const record = {
          name: customer.name.trim(),
          email: customer.email,
          phone: customer.phone,
          isBusinessCustomer: !!(customer.vatNumber || customer.idValue),
          vatNumber: customer.vatNumber,
          commercialRegistration: customer.idScheme === "CRN" ? customer.idValue : undefined,
          buildingNumber: customer.address.buildingNumber,
          secondaryNumber: customer.address.secondaryNumber,
          street: customer.address.street,
          city: customer.address.city,
          district: customer.address.district,
          postalCode: customer.address.postalCode,
          countryCode: customer.address.countryCode,
        }
        // The document carries its own copy of the buyer, so it's saved even when the customers
        // list refuses the record (a duplicate phone, say).
        try {
          if (customerId) await customerListService.updateCustomer(customerId, record)
          else {
            const created = await customerListService.createCustomer({
              ...record,
              notes: null,
              region: customer.address.city,
            })
            customerId = created.id
          }
        } catch {
          toast.warning(t("customer.syncFailed"))
        }
      }
      await onSubmit({
        ...values,
        customerId,
        lines: lines.map(withoutKey),
        prepayments: values.prepayments.filter(
          (entry) =>
            entry.netAmount > 0 &&
            (!advancesReady || advances.some((advance) => advance.id === entry.advanceInvoiceId))
        ),
      })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const saveButton = (
    <AppButton
      loading={saving}
      onClick={submit}
      icon={<Save className="size-4" />}
      className={PRIMARY_BUTTON}
    >
      {t("save")}
    </AppButton>
  )

  return (
    <div dir={localeDirection(locale)} className="space-y-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            aria-label={tCommon("back")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fc]"
          >
            <Back className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className={cn("truncate text-[21px] leading-8 font-extrabold", HEADING)}>
              {heading}
            </h1>
            {subheading ? (
              <p className={cn("truncate text-[12.5px]", MUTED)}>{subheading}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AppButton asChild variant="outline" className={SECONDARY_BUTTON}>
            <Link href={backHref}>{tCommon("cancel")}</Link>
          </AppButton>
          {saveButton}
        </div>
      </header>

      {banner}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className={cn(PANEL, "p-5")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={SECTION_TITLE}>{t("basics.title")}</h2>
              {quotation ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1 text-[11.5px] font-bold text-[#4f46e5]">
                  <FileText className="size-3.5" />
                  {t("basics.fromQuotation", { number: quotation.number })}
                </span>
              ) : null}
            </div>

            {kind === "invoice" ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <Field
                  group
                  label={t("basics.taxType")}
                  hint={
                    values.taxType === "standard"
                      ? t("basics.standardHint")
                      : t("basics.simplifiedHint")
                  }
                >
                  <Segmented
                    className="w-full"
                    value={values.taxType}
                    onChange={(taxType) => set({ taxType })}
                    options={[
                      { value: "standard", label: t("basics.standard") },
                      { value: "simplified", label: t("basics.simplified") },
                    ]}
                  />
                </Field>
                <Field
                  group
                  label={t("basics.kind")}
                  hint={quotation ? t("basics.kindLocked") : t("basics.kindHint")}
                >
                  <Segmented
                    className="w-full"
                    value={values.invoiceKind}
                    disabled={!!quotation}
                    onChange={(invoiceKind) =>
                      set({
                        invoiceKind,
                        ...(invoiceKind === "advance"
                          ? { prepayments: [], retentionPercent: 0 }
                          : {}),
                      })
                    }
                    options={[
                      { value: "regular", label: t("basics.regular") },
                      { value: "advance", label: t("basics.advance") },
                      { value: "progress", label: t("basics.progress"), disabled: !quotation },
                    ]}
                  />
                </Field>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field group label={t("basics.sector")} className="sm:col-span-2 lg:col-span-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {SECTORS.map((sector) => (
                    <button
                      key={sector}
                      type="button"
                      onClick={() => set({ sector })}
                      className={cn(
                        "rounded-[14px] border px-3.5 py-2.5 text-start transition",
                        values.sector === sector
                          ? "border-[#4f46e5] bg-[#f5f6ff] ring-2 ring-[#4f46e5]/10"
                          : "border-[#e1e7f0] hover:bg-[#f7f9fc]"
                      )}
                    >
                      <span
                        className={cn(
                          "block text-[13px] font-extrabold",
                          values.sector === sector ? "text-[#4f46e5]" : HEADING
                        )}
                      >
                        {tSectors(`${sector}.name`)}
                      </span>
                      <span className={cn("block text-[11.5px] leading-5", MUTED)}>
                        {tSectors(`${sector}.hint`)}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("basics.subject")} className="sm:col-span-2">
                <TextInput
                  value={values.title}
                  onChange={(title) => set({ title: title || null })}
                  placeholder={t(`basics.subjectPlaceholder.${values.sector}`)}
                />
              </Field>
              <Field label={t("basics.reference")}>
                <TextInput
                  value={values.reference}
                  onChange={(reference) => set({ reference: reference || null })}
                  placeholder={t("basics.referencePlaceholder")}
                />
              </Field>

              {kind === "quotation" ? (
                <>
                  <Field label={t("basics.issueDate")}>
                    <AppDateField
                      value={values.issueDate}
                      onChange={(issueDate) => set({ issueDate: issueDate || todayString() })}
                    />
                  </Field>
                  <Field group label={t("basics.validUntil")} className="lg:col-span-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[200px] flex-1">
                        <AppDateField
                          value={values.validUntil ?? ""}
                          onChange={(validUntil) => set({ validUntil: validUntil || null })}
                          placeholder={t("basics.noExpiry")}
                        />
                      </div>
                      {VALIDITY_PRESETS.map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => set({ validUntil: todayString(days) })}
                          className={cn(
                            "h-9 rounded-full border px-3 text-[12px] font-bold transition",
                            values.validUntil === todayString(days)
                              ? "border-[#4f46e5] bg-[#f5f6ff] text-[#4f46e5]"
                              : "border-[#e1e7f0] text-[#5b6b85] hover:bg-[#f7f9fc]"
                          )}
                        >
                          {t("basics.days", { count: days })}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field
                    label={
                      values.sector === "general" ? t("basics.supplyDate") : t("basics.supplyFrom")
                    }
                    hint={t("basics.supplyHint")}
                  >
                    <AppDateField
                      value={values.supplyDate ?? ""}
                      onChange={(supplyDate) => set({ supplyDate: supplyDate || null })}
                      placeholder={t("basics.sameAsIssue")}
                    />
                  </Field>
                  {values.sector === "general" ? null : (
                    <Field label={t("basics.supplyTo")}>
                      <AppDateField
                        value={values.supplyEndDate ?? ""}
                        onChange={(supplyEndDate) => set({ supplyEndDate: supplyEndDate || null })}
                        placeholder="—"
                      />
                    </Field>
                  )}
                  <Field label={t("basics.paymentMeans")}>
                    <AppSelect
                      value={values.paymentMeans}
                      onValueChange={(paymentMeans) =>
                        set({ paymentMeans: paymentMeans as PaymentMeans })
                      }
                    >
                      <AppSelectTrigger
                        className={cn(FIELD, "px-2.5")}
                        aria-label={t("basics.paymentMeans")}
                      >
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {PAYMENT_MEANS.map((means) => (
                          <AppSelectItem key={means} value={means}>
                            {tMeans(means)}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  </Field>
                  <Field group label={t("basics.dueDate")} className="sm:col-span-2 lg:col-span-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[200px] flex-1 sm:max-w-[280px]">
                        <AppDateField
                          value={values.dueDate ?? ""}
                          onChange={(dueDate) => set({ dueDate: dueDate || null })}
                          placeholder={t("basics.noDueDate")}
                        />
                      </div>
                      {DUE_PRESETS.map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => set({ dueDate: todayString(days) })}
                          className={cn(
                            "h-9 rounded-full border px-3 text-[12px] font-bold transition",
                            values.dueDate === todayString(days)
                              ? "border-[#4f46e5] bg-[#f5f6ff] text-[#4f46e5]"
                              : "border-[#e1e7f0] text-[#5b6b85] hover:bg-[#f7f9fc]"
                          )}
                        >
                          {days === 0 ? t("basics.dueNow") : t("basics.days", { count: days })}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
            </div>
          </section>

          <CustomerSection
            customers={customers}
            customerId={values.customerId}
            customer={values.customer}
            business={business}
            syncCustomer={syncCustomer}
            onSyncCustomerChange={setSyncCustomer}
            onChange={({ customerId, customer }) => set({ customerId, customer })}
          />

          <LinesEditor
            sector={values.sector}
            lines={lines}
            onChange={setLines}
            products={products}
            contractQuantities={contractQuantities}
          />

          <section className={cn(PANEL, "p-5")}>
            <h2 className={SECTION_TITLE}>{t("terms.title")}</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <Field label={t("terms.paymentTerms")} className="lg:col-span-2">
                <TextInput
                  value={values.paymentTerms}
                  onChange={(paymentTerms) => set({ paymentTerms: paymentTerms || null })}
                  placeholder={t(`terms.paymentTermsPlaceholder.${values.sector}`)}
                />
              </Field>
              <Field label={t("terms.terms")} hint={t("terms.termsHint")}>
                <TextArea
                  rows={5}
                  value={values.terms}
                  onChange={(terms) => set({ terms: terms || null })}
                  placeholder={t(`terms.termsPlaceholder.${values.sector}`)}
                />
              </Field>
              <Field label={t("terms.notes")} hint={t("terms.notesHint")}>
                <TextArea
                  rows={5}
                  value={values.notes}
                  onChange={(notes) => set({ notes: notes || null })}
                />
              </Field>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <TotalsCard
            kind={kind}
            totals={totals}
            discountType={values.discountType}
            discountValue={values.discountValue}
            onDiscountChange={set}
            retentionPercent={values.retentionPercent}
            onRetentionChange={(retentionPercent) => set({ retentionPercent })}
            showRetention={showRetention}
            advancePercent={values.advancePercent}
            onAdvanceChange={(advancePercent) => set({ advancePercent })}
            advances={advances}
            prepayments={values.prepayments}
            onPrepaymentsChange={(prepayments) => set({ prepayments })}
            allowPrepayments={kind === "invoice" && !advanceInvoice}
            footer={
              <div className="space-y-2">
                <AppButton
                  fullWidth
                  loading={saving}
                  onClick={submit}
                  icon={<Save className="size-4" />}
                  className={cn(PRIMARY_BUTTON, "w-full justify-center")}
                >
                  {t("save")}
                </AppButton>
                <p className={cn("text-center text-[11.5px] leading-5", MUTED)}>
                  {kind === "invoice" ? t("saveHintInvoice") : t("saveHintQuotation")}
                </p>
              </div>
            }
          />
        </aside>
      </div>
    </div>
  )
}
