"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, FileText, Package, PenLine, Plus, Printer, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppConfirmDialog,
  AppDateField,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTextarea,
} from "@/components/app"

import { APPLICATION_LABEL, crmService } from "../services"
import type {
  CrmCatalogEntry,
  CrmLeadDetail,
  CrmQuote,
  QuoteStatus,
  SalesInterval,
  SalesItemInput,
  SellerInfo,
} from "../types/crm.types"
import {
  DocumentTermsCard,
  printSalesDocument,
  SalesDocument,
  toDocumentItems,
} from "./sales-document"

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; chip: string }> = {
  draft: { label: "مسودة", chip: "bg-slate-100 text-slate-700" },
  sent: { label: "مرسل", chip: "bg-blue-50 text-blue-700" },
  accepted: { label: "مقبول", chip: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "مرفوض", chip: "bg-rose-50 text-rose-700" },
  converted: { label: "تحول إلى فاتورة", chip: "bg-violet-50 text-violet-700" },
}

// One editable line.
type Line =
  | {
      key: string
      kind: "package"
      application: string
      packageId: string
      interval: SalesInterval
    }
  | { key: string; kind: "custom"; description: string; quantity: string; unitPrice: string }

let lineCounter = 0
const newKey = () => `line-${(lineCounter += 1)}`

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount
  )

export function MadarAdminCrmQuote() {
  const params = useSearchParams()
  const quoteId = params.get("id")
  const leadIdParam = params.get("leadId")
  // A new invoice written directly (no quote first) uses the same editor.
  const asInvoice = !quoteId && params.get("type") === "invoice"
  const router = useRouter()
  const documentRef = useRef<HTMLDivElement>(null)

  const [catalog, setCatalog] = useState<CrmCatalogEntry[]>([])
  const [quote, setQuote] = useState<CrmQuote | null>(null)
  const [seller, setSeller] = useState<SellerInfo | null>(null)
  const [lead, setLead] = useState<CrmLeadDetail["lead"] | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [discount, setDiscount] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [dueDate, setDueDate] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    crmService
      .catalog()
      .then(setCatalog)
      .catch(() => toast.error("تعذر تحميل الباقات."))
  }, [])

  // Loads the quote being edited (or the lead a new one is for).
  useEffect(() => {
    let active = true
    if (quoteId) {
      crmService
        .getQuote(quoteId)
        .then(({ quote: loaded, seller: from }) => {
          if (!active) return
          setQuote(loaded)
          setSeller(from)
          setLines(
            loaded.items.map(
              (item): Line =>
                item.kind === "package" && item.packageId && item.interval
                  ? {
                      key: newKey(),
                      kind: "package",
                      application: item.application ?? "",
                      packageId: item.packageId,
                      interval: item.interval,
                    }
                  : {
                      key: newKey(),
                      kind: "custom",
                      description: item.description,
                      quantity: String(item.quantity),
                      unitPrice: String(item.unitPriceHalalas / 100),
                    }
            )
          )
          setDiscount(loaded.totals.discount ? String(loaded.totals.discount) : "")
          setValidUntil(loaded.validUntil ?? "")
          setNotes(loaded.notes ?? "")
          return crmService.getLead(loaded.leadId)
        })
        .then((detail) => {
          if (active && detail) setLead(detail.lead)
        })
        .catch(() => toast.error("تعذر تحميل عرض السعر."))
    } else if (leadIdParam) {
      crmService
        .getLead(leadIdParam)
        .then((detail) => {
          if (active) setLead(detail.lead)
        })
        .catch(() => toast.error("تعذر تحميل العميل المحتمل."))
    }
    return () => {
      active = false
    }
  }, [quoteId, leadIdParam])

  const packageById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; monthlyPrice: number | null; yearlyPrice: number | null }
    >()
    for (const entry of catalog) for (const pkg of entry.packages) map.set(pkg.id, pkg)
    return map
  }, [catalog])

  const priced = lines.map((line) => {
    if (line.kind === "package") {
      const pkg = packageById.get(line.packageId)
      const price = pkg ? (line.interval === "yearly" ? pkg.yearlyPrice : pkg.monthlyPrice) : null
      return { quantity: 1, unitPrice: price ?? 0 }
    }
    return {
      quantity: Math.max(1, Number(line.quantity) || 1),
      unitPrice: Number(line.unitPrice) || 0,
    }
  })
  const subtotal = priced.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const discountValue = Math.min(Math.max(0, Number(discount) || 0), subtotal)
  const vat = Math.round((subtotal - discountValue) * 15) / 100
  const total = subtotal - discountValue + vat

  const locked = quote?.status === "converted"

  function addPackageLine() {
    const first = catalog[0]
    const pkg = first?.packages[0]
    if (!first || !pkg) return
    setLines((current) => [
      ...current,
      {
        key: newKey(),
        kind: "package",
        application: first.application,
        packageId: pkg.id,
        interval: pkg.monthlyPrice !== null ? "monthly" : "yearly",
      },
    ])
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? ({ ...line, ...patch } as Line) : line))
    )
  }

  function toInput(): SalesItemInput[] {
    return lines.map((line) =>
      line.kind === "package"
        ? { kind: "package", packageId: line.packageId, interval: line.interval }
        : {
            kind: "custom",
            description: line.description.trim(),
            quantity: Math.max(1, Math.round(Number(line.quantity) || 1)),
            unitPrice: Number(line.unitPrice) || 0,
          }
    )
  }

  async function save() {
    if (lines.length === 0) {
      toast.error("أضف بندًا واحدًا على الأقل.")
      return
    }
    if (lines.some((line) => line.kind === "custom" && !line.description.trim())) {
      toast.error("اكتب وصفًا لكل بند.")
      return
    }
    setSaving(true)
    const input = {
      items: toInput(),
      discount: discountValue,
      validUntil: validUntil || null,
      notes: notes.trim() || null,
    }
    try {
      if (quote) {
        const result = await crmService.updateQuote(quote.id, input)
        setQuote(result.quote)
        setSeller(result.seller)
        toast.success("حُفظ عرض السعر.")
      } else if (lead && asInvoice) {
        const result = await crmService.createInvoice(lead.id, {
          items: input.items,
          discount: input.discount,
          dueDate: input.validUntil,
          notes: input.notes,
        })
        toast.success(`أُنشئت الفاتورة ${result.invoice.number}.`)
        router.replace(ROUTES.madarAdminCrmInvoice(result.invoice.id))
      } else if (lead) {
        const result = await crmService.createQuote(lead.id, input)
        toast.success(`أُنشئ عرض السعر ${result.quote.number}.`)
        router.replace(ROUTES.madarAdminCrmQuote(result.quote.id))
      }
    } catch {
      toast.error("تعذر حفظ عرض السعر.")
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(status: "sent" | "accepted" | "rejected" | "draft") {
    if (!quote) return
    try {
      const result = await crmService.setQuoteStatus(quote.id, status)
      setQuote(result.quote)
      toast.success(`أصبح عرض السعر «${QUOTE_STATUS_META[status].label}».`)
    } catch {
      toast.error("تعذر تحديث الحالة.")
    }
  }

  if ((!quoteId && !leadIdParam) || (!lead && !quote)) {
    return <div dir="rtl" className="h-96 animate-pulse rounded-2xl bg-muted" />
  }

  const customer = quote?.customer ?? {
    companyName: lead?.companyName ?? "",
    contactName: lead?.contactName ?? null,
    phone: lead?.phone ?? null,
    email: lead?.email ?? null,
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <Link
        href={lead ? ROUTES.madarAdminCrmLead(lead.id) : ROUTES.madarAdminCrmQuotes}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" />
        {lead ? lead.companyName : "عروض الأسعار"}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground">
            {quote ? `عرض سعر ${quote.number}` : asInvoice ? "فاتورة جديدة" : "عرض سعر جديد"}
            {quote ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  QUOTE_STATUS_META[quote.status].chip
                )}
              >
                {QUOTE_STATUS_META[quote.status].label}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">لـ {customer.companyName}</p>
        </div>
        {quote ? (
          <div className="flex flex-wrap gap-2">
            {!locked ? (
              <>
                {quote.status === "draft" ? (
                  <AppButton
                    variant="outline"
                    className="h-10 rounded-[10px]"
                    onClick={() => void setStatus("sent")}
                  >
                    تحديد كمرسل
                  </AppButton>
                ) : null}
                {quote.status !== "accepted" ? (
                  <AppButton
                    variant="outline"
                    className="h-10 rounded-[10px]"
                    onClick={() => void setStatus("accepted")}
                  >
                    قبِل العميل
                  </AppButton>
                ) : null}
                {quote.status !== "rejected" ? (
                  <AppButton
                    variant="outline"
                    className="h-10 rounded-[10px] text-rose-600"
                    onClick={() => void setStatus("rejected")}
                  >
                    رفض العميل
                  </AppButton>
                ) : null}
                <AppButton
                  icon={<FileText className="size-4" />}
                  className="h-10 rounded-[10px]"
                  onClick={() => setConverting(true)}
                >
                  تحويل إلى فاتورة
                </AppButton>
              </>
            ) : quote.invoiceId ? (
              <AppButton
                icon={<FileText className="size-4" />}
                className="h-10 rounded-[10px]"
                onClick={() => router.push(ROUTES.madarAdminCrmInvoice(quote.invoiceId!))}
              >
                عرض الفاتورة
              </AppButton>
            ) : null}
            <AppButton
              variant="outline"
              icon={<Printer className="size-4" />}
              className="h-10 rounded-[10px]"
              onClick={() => {
                if (!printSalesDocument(documentRef.current, quote.number)) {
                  toast.error("اسمح بالنوافذ المنبثقة للطباعة.")
                }
              }}
            >
              طباعة / PDF
            </AppButton>
            {!locked ? (
              <AppButton
                variant="ghost"
                aria-label="حذف"
                className="h-10 rounded-[10px] text-rose-600 hover:bg-rose-50"
                onClick={() => setDeleting(true)}
              >
                <Trash2 className="size-4" />
              </AppButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <div className="flex flex-col gap-4">
          {!locked ? (
            <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
              <h2 className="text-base font-bold">البنود</h2>
              <div className="mt-4 space-y-3">
                {lines.map((line) => {
                  const entry = catalog.find((item) =>
                    line.kind === "package" ? item.application === line.application : false
                  )
                  const pkg = line.kind === "package" ? packageById.get(line.packageId) : null
                  return (
                    <div
                      key={line.key}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3"
                    >
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {line.kind === "package" ? (
                          <Package className="size-4" />
                        ) : (
                          <PenLine className="size-4" />
                        )}
                      </span>
                      {line.kind === "package" ? (
                        <>
                          <AppSelect
                            value={line.application}
                            onValueChange={(application) => {
                              const next = catalog.find((item) => item.application === application)
                                ?.packages[0]
                              if (next)
                                update(line.key, {
                                  application,
                                  packageId: next.id,
                                  interval: next.monthlyPrice !== null ? "monthly" : "yearly",
                                })
                            }}
                          >
                            <AppSelectTrigger className="h-10 w-[170px]">
                              <AppSelectValue />
                            </AppSelectTrigger>
                            <AppSelectContent>
                              {catalog.map((item) => (
                                <AppSelectItem key={item.application} value={item.application}>
                                  {APPLICATION_LABEL[
                                    item.application as keyof typeof APPLICATION_LABEL
                                  ] ?? item.application}
                                </AppSelectItem>
                              ))}
                            </AppSelectContent>
                          </AppSelect>
                          <AppSelect
                            value={line.packageId}
                            onValueChange={(packageId) => update(line.key, { packageId })}
                          >
                            <AppSelectTrigger className="h-10 w-[150px]">
                              <AppSelectValue />
                            </AppSelectTrigger>
                            <AppSelectContent>
                              {(entry?.packages ?? []).map((option) => (
                                <AppSelectItem key={option.id} value={option.id}>
                                  {option.name}
                                </AppSelectItem>
                              ))}
                            </AppSelectContent>
                          </AppSelect>
                          <AppSelect
                            value={line.interval}
                            onValueChange={(interval) =>
                              update(line.key, { interval: interval as SalesInterval })
                            }
                          >
                            <AppSelectTrigger className="h-10 w-[110px]">
                              <AppSelectValue />
                            </AppSelectTrigger>
                            <AppSelectContent>
                              {pkg?.monthlyPrice !== null ? (
                                <AppSelectItem value="monthly">شهري</AppSelectItem>
                              ) : null}
                              {pkg?.yearlyPrice !== null ? (
                                <AppSelectItem value="yearly">سنوي</AppSelectItem>
                              ) : null}
                            </AppSelectContent>
                          </AppSelect>
                          <span className="ms-auto text-sm font-bold">
                            {money(
                              (line.interval === "yearly" ? pkg?.yearlyPrice : pkg?.monthlyPrice) ??
                                0
                            )}{" "}
                            ر.س
                          </span>
                        </>
                      ) : (
                        <>
                          <AppInput
                            value={line.description}
                            onChange={(event) =>
                              update(line.key, { description: event.target.value })
                            }
                            placeholder="وصف البند، مثال: تدريب الموظفين"
                            wrapperClassName="min-w-[200px] flex-1"
                            className="h-10"
                          />
                          <AppInput
                            value={line.quantity}
                            onChange={(event) => update(line.key, { quantity: event.target.value })}
                            inputMode="numeric"
                            dir="ltr"
                            aria-label="الكمية"
                            wrapperClassName="w-[72px]"
                            className="h-10 text-center"
                          />
                          <AppInput
                            value={line.unitPrice}
                            onChange={(event) =>
                              update(line.key, { unitPrice: event.target.value })
                            }
                            inputMode="decimal"
                            dir="ltr"
                            placeholder="السعر"
                            aria-label="سعر الوحدة"
                            wrapperClassName="w-[110px]"
                            className="h-10 text-right"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        aria-label="حذف البند"
                        onClick={() =>
                          setLines((current) => current.filter((other) => other.key !== line.key))
                        }
                        className="text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )
                })}
                {lines.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                    أضف باقة من مدار أو بندًا مخصصًا.
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <AppButton
                  variant="outline"
                  icon={<Plus className="size-4" />}
                  className="h-10 rounded-[10px]"
                  disabled={catalog.length === 0}
                  onClick={addPackageLine}
                >
                  باقة من مدار
                </AppButton>
                <AppButton
                  variant="outline"
                  icon={<Plus className="size-4" />}
                  className="h-10 rounded-[10px]"
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      {
                        key: newKey(),
                        kind: "custom",
                        description: "",
                        quantity: "1",
                        unitPrice: "",
                      },
                    ])
                  }
                >
                  بند مخصص
                </AppButton>
              </div>

              <div className="mt-5 grid gap-4 border-t border-border/60 pt-5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">الخصم (ر.س، قبل الضريبة)</span>
                  <AppInput
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    inputMode="decimal"
                    dir="ltr"
                    className="h-10 text-right"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">
                    {asInvoice ? "تاريخ الاستحقاق" : "صالح حتى"}
                  </span>
                  <AppDateField value={validUntil} onChange={setValidUntil} />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-semibold">
                    {asInvoice ? "ملاحظات تظهر في الفاتورة" : "ملاحظات تظهر في العرض"}
                  </span>
                  <AppTextarea
                    dir="rtl"
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder={
                      asInvoice
                        ? "مثال: يرجى السداد خلال 7 أيام من تاريخ الفاتورة."
                        : "مثال: يشمل العرض التدريب والإعداد. الدفع خلال 7 أيام من الموافقة."
                    }
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end">
                <AppButton
                  className="h-11 rounded-[10px] px-8"
                  loading={saving}
                  onClick={() => void save()}
                >
                  {quote ? "حفظ التعديلات" : asInvoice ? "إنشاء الفاتورة" : "إنشاء عرض السعر"}
                </AppButton>
              </div>
            </AppCard>
          ) : null}

          {quote && seller ? (
            <SalesDocument
              ref={documentRef}
              kind="quote"
              number={quote.number}
              issuedAt={quote.createdAt}
              dateLabel={quote.validUntil}
              seller={seller}
              customer={quote.customer}
              items={toDocumentItems(quote.items)}
              totals={quote.totals}
              notes={quote.notes}
              terms={quote.terms ?? seller.quoteTerms}
            />
          ) : null}
          {quote && seller ? (
            <DocumentTermsCard
              terms={quote.terms}
              defaultTerms={seller.quoteTerms}
              onSave={async (terms) => {
                try {
                  const result = await crmService.setQuoteTerms(quote.id, terms)
                  setQuote(result.quote)
                  toast.success("حُفظت الشروط والأحكام.")
                } catch {
                  toast.error("تعذر حفظ الشروط.")
                  throw new Error("save failed")
                }
              }}
            />
          ) : null}
        </div>

        <AppCard className="h-fit rounded-2xl border-border/60 p-5 shadow-sm xl:sticky xl:top-24">
          <h2 className="text-base font-bold">الإجمالي</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">المجموع الفرعي</dt>
              <dd className="font-semibold">
                {money(locked ? quote!.totals.subtotal : subtotal)} ر.س
              </dd>
            </div>
            <div className="flex justify-between text-emerald-700">
              <dt>الخصم</dt>
              <dd className="font-semibold">
                − {money(locked ? quote!.totals.discount : discountValue)} ر.س
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">ضريبة القيمة المضافة 15٪</dt>
              <dd className="font-semibold">{money(locked ? quote!.totals.vat : vat)} ر.س</dd>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-3 text-lg font-black">
              <dt>الإجمالي</dt>
              <dd>{money(locked ? quote!.totals.total : total)} ر.س</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            أسعار الباقات من إعدادات الأسعار في مدار. عند دفع الفاتورة تُفعَّل الباقات تلقائيًا على
            حساب العميل.
          </p>
        </AppCard>
      </div>

      <AppDialog
        open={converting}
        onOpenChange={setConverting}
        title={<span dir="rtl">تحويل إلى فاتورة</span>}
        description={
          <span dir="rtl">
            ستُنشأ فاتورة بنفس البنود والإجمالي، مع رابط دفع للعميل. لا يمكن تعديل عرض السعر بعد
            التحويل.
          </span>
        }
        contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              className="h-11 flex-1 rounded-[10px]"
              onClick={async () => {
                if (!quote) return
                try {
                  const result = await crmService.convertQuote(quote.id, dueDate || null)
                  toast.success(`أُنشئت الفاتورة ${result.invoice.number}.`)
                  router.push(ROUTES.madarAdminCrmInvoice(result.invoice.id))
                } catch {
                  toast.error("تعذر إنشاء الفاتورة.")
                }
              }}
            >
              إنشاء الفاتورة
            </AppButton>
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px]"
              onClick={() => setConverting(false)}
            >
              إلغاء
            </AppButton>
          </div>
        }
      >
        <label dir="rtl" className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">تاريخ الاستحقاق (اختياري)</span>
          <AppDateField value={dueDate} onChange={setDueDate} />
        </label>
      </AppDialog>

      <AppConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={<span dir="rtl">حذف عرض السعر</span>}
        description={<span dir="rtl">سيُحذف عرض السعر {quote?.number} نهائيًا.</span>}
        confirmLabel="حذف"
        confirmTone="destructive"
        cancelLabel="إلغاء"
        onConfirm={async () => {
          if (!quote) return
          await crmService.deleteQuote(quote.id)
          toast.success("حُذف عرض السعر.")
          router.push(lead ? ROUTES.madarAdminCrmLead(lead.id) : ROUTES.madarAdminCrmQuotes)
        }}
      />
    </div>
  )
}
