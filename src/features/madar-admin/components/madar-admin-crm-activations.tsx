"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Rocket, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDialog,
  AppInput,
  AppSearchInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { crmService, formatDate } from "../services"
import type { CrmInvoice } from "../types/crm.types"
import { interestLabel } from "./crm-filters"

const money = (amount: number) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ر.س`

// The apps a paid invoice switches on, in words.
function invoiceApps(invoice: CrmInvoice) {
  return [
    ...new Set(
      invoice.items
        .filter((item) => item.kind === "package" && item.application)
        .map((item) => interestLabel(item.application as string))
    ),
  ]
}

// "تفعيل الحساب": confirms the customer's sign-in email, then creates (or links) their Madar
// account, switches the invoice's apps on and emails them a welcome with a set-password link.
export function ActivateAccountDialog({
  invoice,
  onClose,
  onActivated,
}: {
  invoice: CrmInvoice | null
  onClose: () => void
  onActivated: (invoice: CrmInvoice) => void
}) {
  const [email, setEmail] = useState("")
  const [contactName, setContactName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // Prefill from the customer each time the dialog opens for an invoice.
  if (invoice && openedFor !== invoice.id) {
    setOpenedFor(invoice.id)
    setEmail(invoice.customer.email ?? "")
    setContactName(invoice.customer.contactName ?? "")
    setError(null)
  }

  async function activate() {
    if (!invoice) return
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("أدخل بريدًا إلكترونيًا صحيحًا يدخل به العميل.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await crmService.activateAccount(invoice.id, {
        email: email.trim(),
        contactName: contactName.trim() || null,
      })
      toast.success(
        result.newAccount
          ? "أُنشئ حساب العميل وفُعّلت الباقات، وأُرسلت له رسالة الترحيب."
          : "رُبط حساب العميل الحالي وفُعّلت الباقات، وأُرسلت له رسالة."
      )
      onActivated(result.invoice)
      onClose()
    } catch {
      setError("تعذر تفعيل الحساب. تأكد من البريد وحاول مرة أخرى.")
    } finally {
      setSaving(false)
    }
  }

  const apps = invoice ? invoiceApps(invoice) : []
  return (
    <AppDialog
      open={invoice !== null}
      onOpenChange={(next) => {
        if (!next) {
          setOpenedFor(null)
          onClose()
        }
      }}
      title={<span dir="rtl">تفعيل حساب {invoice?.customer.companyName}</span>}
      contentClassName="[direction:rtl] max-w-[30rem] gap-5 p-6"
      footer={
        <div className="flex w-full gap-2">
          <AppButton
            className="h-11 flex-1 rounded-[10px]"
            loading={saving}
            icon={<Rocket className="size-4" />}
            onClick={() => void activate()}
          >
            تفعيل الحساب
          </AppButton>
          <AppButton variant="outline" className="h-11 flex-1 rounded-[10px]" onClick={onClose}>
            إلغاء
          </AppButton>
        </div>
      }
    >
      <div dir="rtl" className="flex flex-col gap-4 text-sm">
        <ul className="space-y-1.5 rounded-xl bg-muted/50 p-4 text-[13px] leading-6 text-muted-foreground">
          <li>• يُنشأ حساب في مدار باسم الشركة (أو يُربط حسابه إن كان مسجلًا بنفس البريد).</li>
          <li>
            • تُفعَّل الباقات المدفوعة
            {apps.length ? (
              <span className="font-semibold text-foreground">: {apps.join("، ")}</span>
            ) : null}
            .
          </li>
          <li>• تصل العميل رسالة ترحيب برابط لتعيين كلمة المرور والدخول (صالح 7 أيام).</li>
        </ul>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
            بريد الدخول *
          </span>
          <AppInput
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            wrapperClassName="w-full"
            className="h-11 rounded-[10px]"
            placeholder="owner@company.com"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
            اسم صاحب الحساب
          </span>
          <AppInput
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            wrapperClassName="w-full"
            className="h-11 rounded-[10px]"
            placeholder={invoice?.customer.companyName}
          />
        </label>
        {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
      </div>
    </AppDialog>
  )
}

// بانتظار التفعيل: paid sales invoices whose customer still needs a Madar account (or whose apps
// aren't switched on yet).
export function MadarAdminCrmActivations() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [invoices, setInvoices] = useState<CrmInvoice[] | null>(null)
  const [activating, setActivating] = useState<CrmInvoice | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      crmService
        .listActivations({ search: search.trim() || undefined })
        .then((result) => {
          if (active) setInvoices(result)
        })
        .catch(() => toast.error("تعذر تحميل القائمة."))
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search, reload])

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">بانتظار التفعيل</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          فواتير مدفوعة لعملاء لم تُفعَّل حساباتهم في مدار بعد. اضغط «تفعيل الحساب» لإنشاء الحساب
          وتفعيل الباقات وإرسال رسالة الترحيب للعميل.
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="ابحث بالرقم أو اسم العميل أو البريد..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-80"
          className="h-10 rounded-[10px]"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>الفاتورة</AppTableHead>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>التطبيقات</AppTableHead>
              <AppTableHead>المبلغ</AppTableHead>
              <AppTableHead>تاريخ الدفع</AppTableHead>
              <AppTableHead>الحساب</AppTableHead>
              <AppTableHead />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(invoices ?? []).map((invoice) => (
              <AppTableRow
                key={invoice.id}
                className="cursor-pointer"
                onClick={() => router.push(ROUTES.madarAdminCrmInvoice(invoice.id))}
              >
                <AppTableCell className="font-mono text-sm font-bold">
                  {invoice.number}
                </AppTableCell>
                <AppTableCell>
                  <Link
                    href={ROUTES.madarAdminCrmLead(invoice.leadId)}
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-primary hover:underline"
                  >
                    {invoice.customer.companyName}
                  </Link>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {invoice.customer.email ?? "بلا بريد"}
                  </p>
                </AppTableCell>
                <AppTableCell className="text-sm">
                  {invoiceApps(invoice).join("، ") || "—"}
                </AppTableCell>
                <AppTableCell className="font-semibold">{money(invoice.totals.total)}</AppTableCell>
                <AppTableCell className="text-sm text-muted-foreground">
                  {formatDate(invoice.paidAt)}
                </AppTableCell>
                <AppTableCell>
                  <span
                    className={
                      invoice.organizationId
                        ? "rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700"
                        : "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
                    }
                  >
                    {invoice.organizationId ? "له حساب" : "بلا حساب"}
                  </span>
                </AppTableCell>
                <AppTableCell>
                  <AppButton
                    className="h-9 rounded-lg"
                    icon={<UserPlus className="size-4" />}
                    onClick={(event) => {
                      event.stopPropagation()
                      setActivating(invoice)
                    }}
                  >
                    تفعيل الحساب
                  </AppButton>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
        {invoices === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : invoices.length === 0 ? (
          <AppTableEmpty
            title="لا توجد فواتير بانتظار التفعيل"
            description="تظهر هنا الفواتير المدفوعة لعملاء ليس لهم حساب مفعّل بعد."
          />
        ) : null}
      </div>
      <ActivateAccountDialog
        invoice={activating}
        onClose={() => setActivating(null)}
        onActivated={() => setReload((key) => key + 1)}
      />
    </div>
  )
}
