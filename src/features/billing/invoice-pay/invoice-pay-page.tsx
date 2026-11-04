"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { BadgeCheck, Loader2, Lock } from "lucide-react"

import { ASSETS } from "@/constants/assets"

import {
  loadMoyasarStylesheet,
  loadMoyasarWidget,
  removeMoyasarStylesheet,
} from "../moyasar/services"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// The invoice as the customer sees it (GET /v1/public/invoices/:token).
interface PublicInvoice {
  number: string
  status: "unpaid" | "paid"
  items: { description: string; quantity: number; unitPrice: number; total: number }[]
  totals: { subtotal: number; discount: number; vat: number; total: number }
  dueDate: string | null
  issuedAt: string
  paidAt: string | null
  subscriptionStart: string | null
  subscriptionEnd: string | null
  terms: string
  customer: { companyName: string }
  seller: {
    name: string
    legalName: string
    vatNumber: string
    commercialRegistration: string
    address: string
  }
}

const SEPARATOR = String.fromCharCode(47)
const invoicePath = (token: string, action?: string) =>
  ["", "v1", "public", "invoices", encodeURIComponent(token), ...(action ? [action] : [])].join(
    SEPARATOR
  )

const api = (path: string, init?: RequestInit) =>
  fetch(new URL(path, getClientEnvironment().API_BASE_URL), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount
  )
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "—"

// The page a customer opens from the link in an invoice Madar's sales team sent: the invoice,
// and paying it by card. Moyasar sends them back here (?id=…) and the payment is checked server-side.
export function InvoicePayPage() {
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const returnedPaymentId = params.get("id")
  const formRef = useRef<HTMLDivElement>(null)
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "confirming" | "missing" | "failed">(
    "loading"
  )
  const [paymentError, setPaymentError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    const load = returnedPaymentId
      ? api(invoicePath(token, "confirm"), {
          method: "POST",
          body: JSON.stringify({ moyasarPaymentId: returnedPaymentId }),
        })
      : api(invoicePath(token))
    load
      .then(async (response) => {
        if (!active) return
        if (!response.ok) {
          setState("missing")
          return
        }
        const loaded = (await response.json()) as PublicInvoice
        setInvoice(loaded)
        setState("ready")
        if (returnedPaymentId && loaded.status !== "paid") {
          setPaymentError("لم تكتمل عملية الدفع. لم يُخصم أي مبلغ، ويمكنك المحاولة مرة أخرى.")
        }
      })
      .catch(() => {
        if (active) setState("failed")
      })
    return () => {
      active = false
    }
  }, [token, returnedPaymentId])

  // The card form, once the invoice is known to be unpaid.
  useEffect(() => {
    if (!invoice || invoice.status !== "unpaid" || !formRef.current) return
    loadMoyasarStylesheet()
    let cancelled = false
    Promise.all([api(invoicePath(token, "checkout"), { method: "POST" }), loadMoyasarWidget()])
      .then(async ([response]) => {
        if (cancelled || !formRef.current) return
        if (!response.ok || !window.Moyasar) throw new Error("checkout")
        const checkout = (await response.json()) as {
          invoiceId: string
          amount: number
          currency: string
          publishableKey: string
        }
        const callback = new URL(window.location.href)
        callback.search = ""
        callback.searchParams.set("token", token)
        window.Moyasar.init({
          element: formRef.current,
          publishable_api_key: checkout.publishableKey,
          amount: checkout.amount,
          currency: checkout.currency,
          description: `فاتورة مدار ${invoice.number}`,
          callback_url: callback.toString(),
          methods: ["creditcard"],
          metadata: { crm_invoice_id: checkout.invoiceId },
          on_failure: () =>
            setPaymentError("تعذر إتمام الدفع. تحقق من بيانات البطاقة وحاول مرة أخرى."),
        })
      })
      .catch(() => setPaymentError("الدفع الإلكتروني غير متاح حاليًا. تواصل معنا لإتمام الدفع."))
    return () => {
      cancelled = true
      removeMoyasarStylesheet()
    }
  }, [invoice, token])

  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-[#f5f8fd] px-4 py-10">
      <main className="mx-auto w-full max-w-[640px]">
        <div className="flex justify-center">
          <Image
            src={ASSETS.logo}
            alt="مدار"
            width={778}
            height={325}
            priority
            className="h-12 w-auto"
          />
        </div>

        <div className="mt-6 rounded-[28px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(11,23,56,0.35)] ring-1 ring-slate-100 sm:p-8">
          {!token || state === "missing" ? (
            <p className="py-10 text-center text-lg font-bold text-[#0b1738]">
              رابط الفاتورة غير صالح أو انتهى.
            </p>
          ) : state === "failed" ? (
            <p className="py-10 text-center text-lg font-bold text-[#0b1738]">
              تعذر تحميل الفاتورة، حاول مرة أخرى.
            </p>
          ) : !invoice ? (
            <div className="flex justify-center py-16 text-slate-400">
              <Loader2 className="size-7 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-bold text-slate-500">فاتورة ضريبية</p>
                  <p className="mt-1 font-mono text-lg font-black text-[#0b1738]" dir="ltr">
                    {invoice.number}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">إلى: {invoice.customer.companyName}</p>
                </div>
                <div className="text-end text-xs leading-5 text-slate-500">
                  <p className="font-bold text-[#0b1738]">
                    {invoice.seller.legalName || invoice.seller.name}
                  </p>
                  {invoice.seller.vatNumber ? (
                    <p>الرقم الضريبي: {invoice.seller.vatNumber}</p>
                  ) : null}
                  <p>تاريخ الإصدار: {date(invoice.issuedAt)}</p>
                  {invoice.dueDate ? <p>الاستحقاق: {date(invoice.dueDate)}</p> : null}
                  {invoice.subscriptionStart && invoice.subscriptionEnd ? (
                    <p>
                      فترة الاشتراك: {date(invoice.subscriptionStart)} —{" "}
                      {date(invoice.subscriptionEnd)}
                    </p>
                  ) : null}
                </div>
              </div>

              <ul className="divide-y divide-slate-100">
                {invoice.items.map((item, index) => (
                  <li key={index} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="font-semibold text-[#0b1738]">
                      {item.description}
                      {item.quantity > 1 ? (
                        <span className="text-slate-500"> × {item.quantity}</span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-[#0b1738]">{money(item.total)} ر.س</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <dt>المجموع الفرعي</dt>
                  <dd>{money(invoice.totals.subtotal)} ر.س</dd>
                </div>
                {invoice.totals.discount > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <dt>الخصم</dt>
                    <dd>− {money(invoice.totals.discount)} ر.س</dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-slate-600">
                  <dt>ضريبة القيمة المضافة 15٪</dt>
                  <dd>{money(invoice.totals.vat)} ر.س</dd>
                </div>
                <div className="flex justify-between pt-2 text-lg font-black text-[#0b1738]">
                  <dt>الإجمالي</dt>
                  <dd>{money(invoice.totals.total)} ر.س</dd>
                </div>
              </dl>
              {invoice.terms?.trim() ? (
                <details className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-bold text-[#0b1738]">
                    الشروط والأحكام
                  </summary>
                  <p className="mt-2 leading-6 whitespace-pre-wrap text-slate-600">
                    {invoice.terms}
                  </p>
                </details>
              ) : null}

              {invoice.status === "paid" ? (
                <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-emerald-50 p-6 text-center">
                  <BadgeCheck className="size-10 text-emerald-600" />
                  <p className="text-lg font-black text-emerald-800">تم الدفع، شكرًا لك</p>
                  <p className="text-sm text-emerald-700">
                    دُفعت الفاتورة في {date(invoice.paidAt)}، وسيتم تفعيل اشتراكك في مدار.
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-[#0b1738]">
                    <Lock className="size-4" />
                    ادفع بالبطاقة بأمان
                  </p>
                  {paymentError ? (
                    <p className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                      {paymentError}
                    </p>
                  ) : null}
                  <div ref={formRef} className="mysr-form" />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
