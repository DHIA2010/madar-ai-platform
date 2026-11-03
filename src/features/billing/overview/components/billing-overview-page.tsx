"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import type { LucideIcon } from "lucide-react"
import {
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Eye,
  Landmark,
  Layers,
  Loader2,
  Printer,
  Receipt,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppDialog,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  type BillingOverview,
  billingOverviewService,
  type BillingPayment,
  type BillingSubscription,
} from "../services/billing-overview.service"

import { type Locale, localeDirection } from "@/i18n/locales"

// Same surface language as the Categories / Inventory list pages.
const PANEL =
  "rounded-[16px] border border-[#e1e7f0] bg-white shadow-[0_1px_2px_rgba(11,23,56,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
} as const

const SUBSCRIPTION_TONE: Record<BillingSubscription["status"], string> = {
  active: "border-emerald-100 bg-emerald-50 text-emerald-700",
  trial: "border-blue-100 bg-blue-50 text-blue-700",
  overdue: "border-amber-100 bg-amber-50 text-amber-700",
  expired: "border-rose-100 bg-rose-50 text-rose-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
}

const PAYMENT_TONE: Record<BillingPayment["status"], string> = {
  paid: "border-emerald-100 bg-emerald-50 text-emerald-700",
  pending: "border-amber-100 bg-amber-50 text-amber-700",
  failed: "border-rose-100 bg-rose-50 text-rose-700",
  rejected: "border-rose-100 bg-rose-50 text-rose-700",
}

const DAY_MS = 86_400_000

const STATUS_ORDER: Record<BillingSubscription["status"], number> = {
  active: 0,
  overdue: 1,
  trial: 2,
  expired: 3,
  cancelled: 4,
}

// A subscription's application -> its marketplace page (same duplication convention as the
// catalog's own copies of this list).
const MARKETPLACE_ID: Record<string, string> = {
  advertising: "advertising-campaigns",
  ecommerce: "ecommerce",
  pos: "pos",
  procurement: "procurement",
  ai: "ai",
  customReports: "custom-reports",
  expenses: "madar-apps-expenses",
  madarComplete: "madar-complete",
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
}) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-[12.5px] font-semibold", MUTED)}>{label}</p>
        <span
          className={cn("flex size-9 items-center justify-center rounded-[10px]", KPI_TONE[tone])}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("mt-3 text-[22px] font-extrabold", HEADING)}>{value}</p>
    </div>
  )
}

function StatusBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
        tone
      )}
    >
      {children}
    </span>
  )
}

// Opens the receipt alone in a new window, with the page's own styles, and prints it.
function printElement(element: HTMLElement, title: string, dir: "rtl" | "ltr") {
  const popup = window.open("", "_blank", "width=820,height=900")
  if (!popup) return false
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("")
  popup.document.write(
    `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${title}</title>${styles}` +
      `<style>body{background:#fff;padding:32px}@page{margin:16mm}</style></head>` +
      `<body>${element.outerHTML}</body></html>`
  )
  popup.document.close()
  popup.addEventListener("load", () => {
    popup.focus()
    popup.print()
  })
  return true
}

// "الفوترة": the organization's subscription to each app and every payment it has made.
export function BillingOverviewPage() {
  const t = useTranslations("billing.overview")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [failed, setFailed] = useState(false)
  const [viewTarget, setViewTarget] = useState<BillingPayment | null>(null)
  // When the data arrived: "days left" counts from here.
  const [loadedAt, setLoadedAt] = useState(0)
  const receiptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    billingOverviewService
      .get()
      .then((result) => {
        if (cancelled) return
        setOverview(result)
        setLoadedAt(Date.now())
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        toast.error(t("toasts.loadFailed"))
      })
    return () => {
      cancelled = true
    }
  }, [t])

  // Latin digits in both languages, like the rest of Madar.
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale]
  )
  const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "—")
  const formatMoney = (amount: number, currency = "SAR") =>
    `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} ${currency === "SAR" ? t("sar") : currency}`

  const appName = (application: string) =>
    t.has(`applications.${application}`) ? t(`applications.${application}`) : application
  const intervalLabel = (interval: string | null) => (interval ? t(`intervals.${interval}`) : "—")
  const daysLeft = (endsAt: string | null) =>
    endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - loadedAt) / DAY_MS)) : null

  // Running subscriptions first, then the ones that have lapsed.
  const subscriptions = [...(overview?.subscriptions ?? [])].sort(
    (left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
  )
  const payments = overview?.payments ?? []
  const live = subscriptions.filter((s) => s.status === "active" || s.status === "trial")
  const paid = payments.filter((p) => p.status === "paid")
  const totalPaid = paid.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const nextRenewal = live
    .filter((s) => s.status === "active" && s.endsAt)
    .map((s) => s.endsAt as string)
    .sort()[0]

  if (failed) {
    return (
      <div dir={dir} className={cn(PANEL, "p-10 text-center")}>
        <p className={cn("text-[15px] font-bold", HEADING)}>{t("loadFailedTitle")}</p>
        <p className={cn("mt-1 text-[13px]", MUTED)}>{t("loadFailedDescription")}</p>
      </div>
    )
  }

  return (
    <div dir={dir} className="flex flex-col gap-4">
      <div>
        <h1 className={cn("text-2xl font-bold", HEADING)}>{t("heading")}</h1>
        <p className={cn("mt-1 text-sm", MUTED)}>{t("subheading")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpis.active")} value={live.length} icon={Layers} tone="blue" />
        <KpiCard
          label={t("kpis.nextRenewal")}
          value={nextRenewal ? formatDate(nextRenewal) : "—"}
          icon={CalendarClock}
          tone="amber"
        />
        <KpiCard
          label={t("kpis.totalPaid")}
          value={formatMoney(totalPaid)}
          icon={Wallet}
          tone="emerald"
        />
        <KpiCard label={t("kpis.invoices")} value={paid.length} icon={Receipt} tone="violet" />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={cn("text-[16px] font-bold", HEADING)}>{t("subscriptions.title")}</h2>
          <AppButton
            variant="outline"
            className="h-10 rounded-full border-[#c4d5f0] px-4 text-[13px] font-semibold text-[#2878ff] hover:bg-[#eef4ff]"
            onClick={() => router.push(ROUTES.marketplace)}
          >
            {t("subscriptions.browse")}
          </AppButton>
        </div>

        {overview === null ? (
          <div
            className={cn(PANEL, "flex items-center justify-center gap-2 py-12 text-[13px]", MUTED)}
          >
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className={cn(PANEL, "p-8 text-center")}>
            <p className={cn("text-[14px] font-bold", HEADING)}>{t("subscriptions.emptyTitle")}</p>
            <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subscriptions.emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subscriptions.map((subscription) => {
              const left = daysLeft(subscription.endsAt)
              const lapsed =
                subscription.status === "expired" ||
                subscription.status === "overdue" ||
                subscription.status === "cancelled"
              return (
                <div key={subscription.id} className={cn(PANEL, "flex flex-col gap-4 p-5")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
                        <BadgeCheck className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className={cn("truncate text-[15px] font-bold", HEADING)}>
                          {appName(subscription.application)}
                        </p>
                        <p className={cn("truncate text-[12.5px]", MUTED)}>
                          {subscription.packageName ?? t(`sources.${subscription.source}`)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge tone={SUBSCRIPTION_TONE[subscription.status]}>
                      {t(`subscriptionStatus.${subscription.status}`)}
                    </StatusBadge>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-[12px] bg-[#f9fbfe] p-3 text-[12.5px]">
                    <div>
                      <dt className={MUTED}>{t("subscriptions.price")}</dt>
                      <dd className={cn("mt-0.5 font-bold", HEADING)}>
                        {subscription.price === null || subscription.price === 0
                          ? t("subscriptions.free")
                          : `${formatMoney(subscription.price, subscription.currency)} / ${intervalLabel(subscription.billingInterval)}`}
                      </dd>
                    </div>
                    <div>
                      <dt className={MUTED}>{t("subscriptions.startedAt")}</dt>
                      <dd className={cn("mt-0.5 font-bold", HEADING)}>
                        {formatDate(subscription.startedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className={MUTED}>
                        {subscription.status === "trial"
                          ? t("subscriptions.trialEnds")
                          : lapsed
                            ? t("subscriptions.endedAt")
                            : t("subscriptions.renewsAt")}
                      </dt>
                      <dd className={cn("mt-0.5 font-bold", HEADING)}>
                        {subscription.endsAt
                          ? formatDate(subscription.endsAt)
                          : t("subscriptions.noEnd")}
                      </dd>
                    </div>
                    <div>
                      <dt className={MUTED}>{t("subscriptions.daysLeft")}</dt>
                      <dd className={cn("mt-0.5 font-bold", HEADING)}>
                        {left === null || lapsed ? "—" : t("subscriptions.days", { count: left })}
                      </dd>
                    </div>
                  </dl>

                  {subscription.status !== "active" || (left !== null && left <= 7) ? (
                    <AppButton
                      className="h-10 rounded-full bg-[#2878ff] text-[13px] font-semibold text-white hover:bg-[#1f63d6]"
                      onClick={() => {
                        const appId = MARKETPLACE_ID[subscription.application]
                        router.push(appId ? ROUTES.marketplaceDetails(appId) : ROUTES.marketplace)
                      }}
                    >
                      {subscription.source === "trial"
                        ? t("subscriptions.subscribe")
                        : t("subscriptions.renew")}
                    </AppButton>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={cn("text-[16px] font-bold", HEADING)}>{t("payments.title")}</h2>
        <div className={cn(PANEL, "overflow-hidden")}>
          <AppTable>
            <AppTableHeader>
              <AppTableRow>
                <AppTableHead>{t("payments.number")}</AppTableHead>
                <AppTableHead>{t("payments.date")}</AppTableHead>
                <AppTableHead>{t("payments.application")}</AppTableHead>
                <AppTableHead>{t("payments.package")}</AppTableHead>
                <AppTableHead>{t("payments.method")}</AppTableHead>
                <AppTableHead>{t("payments.amount")}</AppTableHead>
                <AppTableHead>{t("payments.status")}</AppTableHead>
                <AppTableHead className="w-16">{t("payments.actions")}</AppTableHead>
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {payments.map((payment) => (
                <AppTableRow key={payment.id}>
                  <AppTableCell>
                    <span className={cn("font-mono text-[13px] font-bold", HEADING)}>
                      {payment.invoiceNumber ?? "—"}
                    </span>
                  </AppTableCell>
                  <AppTableCell className={cn("text-[13px]", HEADING)}>
                    {formatDate(payment.date)}
                  </AppTableCell>
                  <AppTableCell className={cn("text-[13px] font-semibold", HEADING)}>
                    {appName(payment.application)}
                  </AppTableCell>
                  <AppTableCell className={cn("text-[13px]", HEADING)}>
                    {payment.packageName ?? "—"}
                    {payment.billingInterval ? (
                      <span className={cn("ms-1 text-[12px]", MUTED)}>
                        ({intervalLabel(payment.billingInterval)})
                      </span>
                    ) : null}
                  </AppTableCell>
                  <AppTableCell>
                    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px]", HEADING)}>
                      {payment.method === "card" ? (
                        <CreditCard className="size-4 text-[#6b7b96]" />
                      ) : (
                        <Landmark className="size-4 text-[#6b7b96]" />
                      )}
                      {t(`methods.${payment.method}`)}
                    </span>
                  </AppTableCell>
                  <AppTableCell>
                    <span className={cn("text-[13px] font-bold whitespace-nowrap", HEADING)}>
                      {payment.amount === null
                        ? "—"
                        : formatMoney(payment.amount, payment.currency)}
                    </span>
                    {payment.discount ? (
                      <span className="block text-[11.5px] font-semibold text-emerald-600">
                        {t("payments.discount", {
                          amount: formatMoney(payment.discount, payment.currency),
                        })}
                      </span>
                    ) : null}
                  </AppTableCell>
                  <AppTableCell>
                    <StatusBadge tone={PAYMENT_TONE[payment.status]}>
                      {t(`paymentStatus.${payment.status}`)}
                    </StatusBadge>
                  </AppTableCell>
                  <AppTableCell>
                    <AppButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("payments.view")}
                      className="rounded-[8px] border border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100"
                      onClick={() => setViewTarget(payment)}
                    >
                      <Eye className="size-4" />
                    </AppButton>
                  </AppTableCell>
                </AppTableRow>
              ))}
            </AppTableBody>
          </AppTable>

          {overview === null ? (
            <div className={cn("flex items-center justify-center gap-2 py-16 text-[13px]", MUTED)}>
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : payments.length === 0 ? (
            <AppTableEmpty
              title={t("payments.emptyTitle")}
              description={t("payments.emptyDescription")}
            />
          ) : null}
        </div>
      </section>

      <AppDialog
        open={viewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setViewTarget(null)
        }}
        title={t("receipt.title")}
        contentClassName={cn(
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]",
          "max-w-[34rem] gap-5 p-6"
        )}
        footer={
          <div className="flex w-full gap-2">
            {viewTarget?.status === "paid" ? (
              <AppButton
                icon={<Printer className="size-4" />}
                className="h-11 flex-1 gap-2 rounded-[10px] bg-[#2878ff] font-semibold text-white hover:bg-[#1f63d6]"
                onClick={() => {
                  if (
                    receiptRef.current &&
                    !printElement(receiptRef.current, viewTarget.invoiceNumber ?? "", dir)
                  ) {
                    toast.error(t("toasts.popupBlocked"))
                  }
                }}
              >
                {t("receipt.print")}
              </AppButton>
            ) : null}
            <AppButton
              variant="outline"
              className="h-11 flex-1 rounded-[10px] border-[#e1e7f0] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
              onClick={() => setViewTarget(null)}
            >
              {t("receipt.close")}
            </AppButton>
          </div>
        }
      >
        {viewTarget && overview ? (
          <div ref={receiptRef} dir={dir} className="space-y-4 text-[#0b1738]">
            <div className="flex items-start justify-between gap-3 border-b border-[#e1e7f0] pb-4">
              <div>
                <p className="text-[20px] font-extrabold text-[#2878ff]">{t("receipt.brand")}</p>
                <p className="text-[12px]">{t("receipt.kind")}</p>
              </div>
              <div className="text-end">
                <p className="font-mono text-[14px] font-bold">{viewTarget.invoiceNumber ?? "—"}</p>
                <p className="text-[12px]">{formatDate(viewTarget.date)}</p>
                <div className="mt-1">
                  <StatusBadge tone={PAYMENT_TONE[viewTarget.status]}>
                    {t(`paymentStatus.${viewTarget.status}`)}
                  </StatusBadge>
                </div>
              </div>
            </div>

            <div className="rounded-[12px] border border-[#e1e7f0] p-3 text-[13px]">
              <p className="text-[11px] font-semibold">{t("receipt.billedTo")}</p>
              <p className="mt-0.5 font-bold">{overview.organization.name}</p>
              {overview.organization.taxNumber ? (
                <p className="text-[12px]">
                  {t("receipt.taxNumber")}: {overview.organization.taxNumber}
                </p>
              ) : null}
            </div>

            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#e1e7f0] text-[11.5px]">
                  <th className="py-2 text-start font-semibold">{t("receipt.item")}</th>
                  <th className="py-2 text-end font-semibold">{t("payments.amount")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#eef2f7]">
                  <td className="py-2.5">
                    <p className="font-semibold">
                      {t("receipt.line", { application: appName(viewTarget.application) })}
                    </p>
                    <p className="text-[12px]">
                      {[viewTarget.packageName, intervalLabel(viewTarget.billingInterval)]
                        .filter((part) => part && part !== "—")
                        .join(" · ")}
                    </p>
                  </td>
                  <td className="py-2.5 text-end font-semibold whitespace-nowrap">
                    {viewTarget.amount === null
                      ? "—"
                      : formatMoney(
                          viewTarget.originalAmount ?? viewTarget.amount,
                          viewTarget.currency
                        )}
                  </td>
                </tr>
                {viewTarget.discount ? (
                  <tr className="border-b border-[#eef2f7] text-emerald-700">
                    <td className="py-2">{t("receipt.discount")}</td>
                    <td className="py-2 text-end whitespace-nowrap">
                      −{formatMoney(viewTarget.discount, viewTarget.currency)}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td className="pt-3 text-[14px] font-extrabold">{t("receipt.total")}</td>
                  <td className="pt-3 text-end text-[14px] font-extrabold whitespace-nowrap">
                    {viewTarget.amount === null
                      ? "—"
                      : formatMoney(viewTarget.amount, viewTarget.currency)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-[#f9fbfe] p-3 text-[12.5px]">
              <div>
                <p className="text-[11px] font-semibold">{t("payments.method")}</p>
                <p className="mt-0.5 font-bold">{t(`methods.${viewTarget.method}`)}</p>
              </div>
              {viewTarget.reference ? (
                <div>
                  <p className="text-[11px] font-semibold">{t("receipt.reference")}</p>
                  <p className="mt-0.5 font-mono text-[11.5px] font-bold break-all">
                    {viewTarget.reference}
                  </p>
                </div>
              ) : null}
            </div>

            {viewTarget.status === "rejected" && viewTarget.rejectionReason ? (
              <div className="rounded-[12px] border border-rose-100 bg-rose-50 p-3 text-[12.5px] text-rose-700">
                <p className="font-semibold">{t("receipt.rejectionReason")}</p>
                <p className="mt-0.5">{viewTarget.rejectionReason}</p>
              </div>
            ) : null}
            {viewTarget.status === "pending" ? (
              <p className="rounded-[12px] border border-amber-100 bg-amber-50 p-3 text-[12.5px] text-amber-700">
                {t("receipt.pendingNote")}
              </p>
            ) : null}
          </div>
        ) : null}
      </AppDialog>
    </div>
  )
}
