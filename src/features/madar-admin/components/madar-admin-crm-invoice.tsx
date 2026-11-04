"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  Copy,
  Landmark,
  MessageCircle,
  Pencil,
  Printer,
  UserPlus,
} from "lucide-react"
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
  AppTextarea,
} from "@/components/app"

import { crmService, formatDate } from "../services"
import type {
  CrmInvoice,
  InvoicePaymentMethod,
  InvoiceStatus,
  SellerInfo,
} from "../types/crm.types"
import { formatDateTime, whatsappUrl } from "./crm-ui"
import { ActivateAccountDialog } from "./madar-admin-crm-activations"
import {
  DocumentTermsCard,
  printSalesDocument,
  SalesDocument,
  toDocumentItems,
} from "./sales-document"

export const PAYMENT_METHOD_LABEL: Record<InvoicePaymentMethod, string> = {
  card: "بطاقة",
  bank_transfer: "تحويل بنكي",
  cash: "نقدًا",
  other: "أخرى",
}

// What staff can record by hand (online card payments come through the pay link).
const MANUAL_METHODS: { method: InvoicePaymentMethod; label: string }[] = [
  { method: "bank_transfer", label: "تحويل بنكي" },
  { method: "cash", label: "نقدًا" },
  { method: "card", label: "بطاقة / شبكة" },
  { method: "other", label: "أخرى" },
]

const today = () => new Date().toISOString().slice(0, 10)

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; chip: string }> = {
  unpaid: { label: "غير مدفوعة", chip: "bg-amber-50 text-amber-700" },
  paid: { label: "مدفوعة", chip: "bg-emerald-50 text-emerald-700" },
  void: { label: "ملغاة", chip: "bg-slate-100 text-slate-600" },
}

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount
  )

export function MadarAdminCrmInvoice() {
  const invoiceId = useSearchParams().get("id") ?? ""
  const documentRef = useRef<HTMLDivElement>(null)
  const [invoice, setInvoice] = useState<CrmInvoice | null>(null)
  const [seller, setSeller] = useState<SellerInfo | null>(null)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [reference, setReference] = useState("")
  const [method, setMethod] = useState<InvoicePaymentMethod>("bank_transfer")
  const [paidOn, setPaidOn] = useState(today)
  const [savingPaid, setSavingPaid] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [activating, setActivating] = useState(false)
  // Sending the pay link on WhatsApp: to this number, with this message.
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false)
  const [whatsappPhone, setWhatsappPhone] = useState("")
  const [whatsappText, setWhatsappText] = useState("")
  const [savePhone, setSavePhone] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState(false)
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [savingPeriod, setSavingPeriod] = useState(false)

  async function savePeriod(period: { start: string | null; end: string | null }) {
    if (!invoice) return
    if (period.start && period.end && period.end <= period.start) {
      toast.error("تاريخ النهاية يجب أن يكون بعد تاريخ البداية.")
      return
    }
    setSavingPeriod(true)
    try {
      const result = await crmService.setInvoicePeriod(invoice.id, period)
      setInvoice(result.invoice)
      setEditingPeriod(false)
      toast.success(period.start ? "حُفظت فترة الاشتراك." : "أُعيد حساب الفترة تلقائيًا.")
    } catch {
      toast.error("تعذر حفظ فترة الاشتراك.")
    } finally {
      setSavingPeriod(false)
    }
  }

  useEffect(() => {
    if (!invoiceId) return
    let active = true
    crmService
      .getInvoice(invoiceId)
      .then((result) => {
        if (!active) return
        setInvoice(result.invoice)
        setSeller(result.seller)
      })
      .catch(() => toast.error("تعذر تحميل الفاتورة."))
    return () => {
      active = false
    }
  }, [invoiceId])

  if (!invoice || !seller) {
    return <div dir="rtl" className="h-96 animate-pulse rounded-2xl bg-muted" />
  }

  const payLink =
    typeof window === "undefined"
      ? ""
      : new URL(ROUTES.payInvoice(invoice.payUrlToken), window.location.origin).toString()
  const shareText = `مرحبًا ${invoice.customer.contactName ?? invoice.customer.companyName}، هذه فاتورة مدار ${invoice.number} بقيمة ${money(invoice.totals.total)} ر.س. يمكنك الدفع من الرابط: ${payLink}`

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <Link
        href={ROUTES.madarAdminCrmLead(invoice.leadId)}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" />
        {invoice.customer.companyName}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground">
            فاتورة {invoice.number}
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold",
                INVOICE_STATUS_META[invoice.status].chip
              )}
            >
              {INVOICE_STATUS_META[invoice.status].label}
            </span>
          </h1>
          {invoice.quoteId ? (
            <p className="mt-1 text-sm text-muted-foreground">
              من عرض السعر{" "}
              <Link
                href={ROUTES.madarAdminCrmQuote(invoice.quoteId)}
                className="font-semibold text-primary hover:underline"
              >
                {invoice.quoteNumber}
              </Link>
            </p>
          ) : null}
        </div>
        <AppButton
          variant="outline"
          icon={<Printer className="size-4" />}
          className="h-10 rounded-[10px]"
          onClick={() => {
            if (!printSalesDocument(documentRef.current, invoice.number)) {
              toast.error("اسمح بالنوافذ المنبثقة للطباعة.")
            }
          }}
        >
          طباعة / PDF
        </AppButton>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <SalesDocument
          ref={documentRef}
          kind="invoice"
          number={invoice.number}
          issuedAt={invoice.createdAt}
          dateLabel={invoice.dueDate}
          statusLabel={invoice.status === "paid" ? "مدفوعة" : null}
          seller={seller}
          customer={invoice.customer}
          items={toDocumentItems(invoice.items)}
          totals={invoice.totals}
          notes={invoice.notes}
          terms={invoice.terms ?? seller.invoiceTerms}
          subscription={
            invoice.subscriptionStart && invoice.subscriptionEnd
              ? { start: invoice.subscriptionStart, end: invoice.subscriptionEnd }
              : null
          }
        />

        <div className="flex h-fit flex-col gap-4 xl:sticky xl:top-24">
          {invoice.status === "unpaid" ? (
            <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
              <h2 className="text-base font-bold">الدفع</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                أرسل رابط الدفع للعميل ليدفع بالبطاقة، أو سجّل الدفع عند وصول التحويل البنكي.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 p-2.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
                  {payLink}
                </span>
                <button
                  type="button"
                  aria-label="نسخ رابط الدفع"
                  onClick={() => {
                    void navigator.clipboard.writeText(payLink)
                    toast.success("نُسخ رابط الدفع.")
                  }}
                  className="rounded-lg p-1.5 hover:bg-background"
                >
                  <Copy className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWhatsappPhone(invoice.customer.phone ?? "")
                    setWhatsappText(shareText)
                    setSavePhone(!invoice.customer.phone)
                    setSendingWhatsapp(true)
                  }}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="size-4" />
                  إرسال الرابط عبر واتساب
                </button>
                <AppButton
                  variant="outline"
                  icon={<Landmark className="size-4" />}
                  className="h-10 rounded-[10px]"
                  onClick={() => setMarkingPaid(true)}
                >
                  تسجيل الدفع يدويًا
                </AppButton>
                <AppButton
                  variant="ghost"
                  icon={<Ban className="size-4" />}
                  className="h-10 rounded-[10px] text-rose-600 hover:bg-rose-50"
                  onClick={() => setVoiding(true)}
                >
                  إلغاء الفاتورة
                </AppButton>
              </div>
            </AppCard>
          ) : null}

          {invoice.status === "paid" ? (
            <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-base font-bold text-emerald-700">
                <BadgeCheck className="size-5" />
                مدفوعة
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">التاريخ</dt>
                  <dd className="font-semibold">{formatDate(invoice.paidAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">الطريقة</dt>
                  <dd className="font-semibold">
                    {invoice.paymentMethod ? PAYMENT_METHOD_LABEL[invoice.paymentMethod] : "—"}
                  </dd>
                </div>
                {invoice.paymentReference ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">المرجع</dt>
                    <dd className="truncate font-mono text-xs font-semibold" dir="ltr">
                      {invoice.paymentReference}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </AppCard>
          ) : null}

          <DocumentTermsCard
            terms={invoice.terms}
            defaultTerms={seller.invoiceTerms}
            onSave={async (terms) => {
              try {
                const result = await crmService.setInvoiceTerms(invoice.id, terms)
                setInvoice(result.invoice)
                toast.success("حُفظت الشروط والأحكام.")
              } catch {
                toast.error("تعذر حفظ الشروط.")
                throw new Error("save failed")
              }
            }}
          />

          {invoice.subscriptionStart && invoice.subscriptionEnd ? (
            <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">فترة الاشتراك</h2>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodStart(invoice.subscriptionStart ?? "")
                    setPeriodEnd(invoice.subscriptionEnd ?? "")
                    setEditingPeriod(true)
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-primary/5"
                >
                  <Pencil className="size-3.5" />
                  تعديل
                </button>
              </div>
              <dl className="mt-3 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">بداية الاشتراك</dt>
                  <dd className="font-semibold">{formatDate(invoice.subscriptionStart)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">نهاية الاشتراك</dt>
                  <dd className="font-semibold">{formatDate(invoice.subscriptionEnd)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {invoice.subscriptionDatesManual
                  ? "حُددت يدويًا."
                  : invoice.activatedAt
                    ? "الفترة المفعّلة على حساب العميل."
                    : "محسوبة تلقائيًا من تاريخ الدفع (أو الإصدار) وأطول مدة باقة في الفاتورة."}
              </p>
            </AppCard>
          ) : null}

          {invoice.hasPackages || (invoice.status === "paid" && !invoice.organizationId) ? (
            <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
              <h2 className="text-base font-bold">تفعيل الحساب</h2>
              {invoice.activatedAt ? (
                <p className="mt-2 flex items-start gap-2 text-sm text-emerald-700">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" />
                  فُعّل حساب العميل في {formatDateTime(invoice.activatedAt)}.
                </p>
              ) : null}
              {invoice.activatedAt && invoice.organizationId ? (
                <Link
                  href={ROUTES.madarAdminCustomer(invoice.organizationId)}
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  عرضه في العملاء
                </Link>
              ) : invoice.activatedAt ? null : invoice.status === "paid" ? (
                <>
                  <p className="mt-2 flex items-start gap-2 text-sm text-amber-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {invoice.organizationId
                      ? "الفاتورة مدفوعة ولم تُفعَّل الباقات بعد."
                      : "الفاتورة مدفوعة وليس للعميل حساب في مدار بعد."}
                  </p>
                  <AppButton
                    className="mt-3 h-10 w-full rounded-[10px]"
                    icon={<UserPlus className="size-4" />}
                    onClick={() => setActivating(true)}
                  >
                    تفعيل الحساب
                  </AppButton>
                </>
              ) : invoice.organizationId ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  تُفعَّل الباقات تلقائيًا على حساب العميل في مدار عند دفع الفاتورة.
                </p>
              ) : (
                <p className="mt-2 flex items-start gap-2 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  ليس لهذا العميل حساب في مدار بعد. بعد الدفع يمكنك تفعيل حسابه من هنا، أو تُفعَّل
                  الباقات تلقائيًا عند تسجيله بنفس البريد.
                </p>
              )}
            </AppCard>
          ) : null}
        </div>
      </div>

      <AppDialog
        open={sendingWhatsapp}
        onOpenChange={setSendingWhatsapp}
        title={<span dir="rtl">إرسال رابط الدفع عبر واتساب</span>}
        contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              className="h-11 flex-1 rounded-[10px] bg-emerald-600 hover:bg-emerald-700"
              icon={<MessageCircle className="size-4" />}
              disabled={whatsappPhone.replace(/\D/g, "").length < 9 || !whatsappText.trim()}
              onClick={() => {
                const phone = whatsappPhone.trim()
                window.open(
                  `${whatsappUrl(phone)}?text=${encodeURIComponent(whatsappText)}`,
                  "_blank",
                  "noopener"
                )
                setSendingWhatsapp(false)
                if (savePhone && phone !== invoice.customer.phone) {
                  crmService
                    .updateLead(invoice.leadId, { phone })
                    .then(() => {
                      setInvoice((current) =>
                        current ? { ...current, customer: { ...current.customer, phone } } : current
                      )
                      toast.success("حُفظ الرقم في بيانات العميل.")
                    })
                    .catch(() => toast.error("تعذر حفظ الرقم."))
                }
              }}
            >
              فتح واتساب
            </AppButton>
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px]"
              onClick={() => setSendingWhatsapp(false)}
            >
              إلغاء
            </AppButton>
          </div>
        }
      >
        <div dir="rtl" className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">رقم الجوال</span>
            <AppInput
              type="tel"
              dir="ltr"
              value={whatsappPhone}
              placeholder="05XXXXXXXX"
              onChange={(event) => setWhatsappPhone(event.target.value)}
              className="h-11 rounded-[10px] text-right"
            />
          </label>
          {whatsappPhone.trim() && whatsappPhone.trim() !== (invoice.customer.phone ?? "") ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={savePhone}
                onChange={(event) => setSavePhone(event.target.checked)}
                className="size-4 accent-emerald-600"
              />
              حفظ الرقم في بيانات العميل
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">الرسالة</span>
            <AppTextarea
              rows={5}
              value={whatsappText}
              onChange={(event) => setWhatsappText(event.target.value)}
              className="rounded-[10px] text-sm leading-6"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            يُفتح واتساب برسالة جاهزة تتضمن رابط الدفع، راجعها ثم اضغط إرسال.
          </p>
        </div>
      </AppDialog>
      <AppDialog
        open={editingPeriod}
        onOpenChange={setEditingPeriod}
        title={<span dir="rtl">فترة الاشتراك</span>}
        contentClassName="[direction:rtl] max-w-[28rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              className="h-11 flex-1 rounded-[10px]"
              loading={savingPeriod}
              disabled={!periodStart || !periodEnd}
              onClick={() => void savePeriod({ start: periodStart, end: periodEnd })}
            >
              حفظ
            </AppButton>
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px]"
              onClick={() => setEditingPeriod(false)}
            >
              إلغاء
            </AppButton>
          </div>
        }
      >
        <div dir="rtl" className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">بداية الاشتراك</span>
            <AppDateField value={periodStart} onChange={setPeriodStart} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">نهاية الاشتراك</span>
            <AppDateField value={periodEnd} onChange={setPeriodEnd} />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            {invoice.activatedAt
              ? "الاشتراك مفعّل: ستتغير مدته على حساب العميل إلى هذه الفترة."
              : invoice.status === "paid"
                ? "تُفعَّل الباقات على هذه الفترة عند تفعيل حساب العميل."
                : "تُفعَّل الباقات على هذه الفترة عند الدفع."}
          </p>
          {invoice.subscriptionDatesManual && !invoice.activatedAt ? (
            <button
              type="button"
              onClick={() => void savePeriod({ start: null, end: null })}
              className="w-fit text-sm font-semibold text-primary hover:underline"
            >
              إعادة الحساب التلقائي
            </button>
          ) : null}
        </div>
      </AppDialog>
      <ActivateAccountDialog
        invoice={activating ? invoice : null}
        onClose={() => setActivating(false)}
        onActivated={setInvoice}
      />
      <AppDialog
        open={markingPaid}
        onOpenChange={setMarkingPaid}
        title={<span dir="rtl">تسجيل الدفع يدويًا</span>}
        description={
          <span dir="rtl">
            سجّل دفع {money(invoice.totals.total)} ر.س الذي تم خارج رابط الدفع. ستُفعَّل الباقات
            وتُسجَّل الصفقة كرابحة.
          </span>
        }
        contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              className="h-11 flex-1 rounded-[10px]"
              loading={savingPaid}
              onClick={async () => {
                setSavingPaid(true)
                try {
                  const result = await crmService.markInvoicePaid(invoice.id, {
                    method,
                    reference: reference.trim() || null,
                    paidAt: paidOn || null,
                  })
                  setInvoice(result.invoice)
                  setMarkingPaid(false)
                  toast.success("سُجّل الدفع.")
                } catch {
                  toast.error("تعذر تسجيل الدفع.")
                } finally {
                  setSavingPaid(false)
                }
              }}
            >
              تأكيد الدفع
            </AppButton>
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px]"
              onClick={() => setMarkingPaid(false)}
            >
              إلغاء
            </AppButton>
          </div>
        }
      >
        <div dir="rtl" className="space-y-4">
          <div>
            <span className="mb-2 block text-sm font-semibold">طريقة الدفع</span>
            <div className="grid grid-cols-2 gap-2">
              {MANUAL_METHODS.map((option) => (
                <button
                  key={option.method}
                  type="button"
                  onClick={() => setMethod(option.method)}
                  className={cn(
                    "h-11 rounded-[10px] border-2 text-sm font-semibold transition-colors",
                    method === option.method
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">تاريخ الدفع</span>
            <AppDateField value={paidOn} onChange={setPaidOn} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">
              {method === "bank_transfer" ? "رقم الحوالة" : "رقم الإيصال أو المرجع"} (اختياري)
            </span>
            <AppInput
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              dir="ltr"
              className="h-11 text-right"
            />
          </label>
        </div>
      </AppDialog>

      <AppConfirmDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={<span dir="rtl">إلغاء الفاتورة</span>}
        description={<span dir="rtl">ستُلغى الفاتورة {invoice.number} ولن يعمل رابط الدفع.</span>}
        confirmLabel="إلغاء الفاتورة"
        confirmTone="destructive"
        cancelLabel="تراجع"
        onConfirm={async () => {
          const result = await crmService.voidInvoice(invoice.id)
          setInvoice(result.invoice)
          toast.success("أُلغيت الفاتورة.")
        }}
      />
    </div>
  )
}
