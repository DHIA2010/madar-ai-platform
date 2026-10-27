"use client"

import { useCallback, useState } from "react"
import { Clock3, CreditCard, MoreHorizontal, Timer, Users, XCircle } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTablePagination,
  AppTableRow,
} from "@/components/app"

import { useAdminPagedList } from "../hooks"
import {
  APPLICATION_LABEL,
  formatDate,
  formatSar,
  knownStartDate,
  nextRenewalDate,
  paymentMethodLabel,
  PLAN_META,
  platformAdminService,
} from "../services"
import type {
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
  BillingInterval,
} from "../types/platform-admin.types"
import { CustomerDetailDialog } from "./customer-detail-dialog"
import { GrantSubscriptionDialog } from "./grant-subscription-dialog"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

import type { SubscriptionApplication } from "@/application/contracts"

const SELECT_TRIGGER_CLASSNAME = "h-10 w-[150px] rounded-[10px] text-sm"
const INITIAL_FILTERS: AdminSubscriptionFilters = {
  search: "",
  application: "all",
  planTier: "all",
  status: "all",
}

type PendingAction =
  | { kind: "renew"; row: AdminSubscriptionRow; interval: BillingInterval }
  | { kind: "cancel"; row: AdminSubscriptionRow }

export function MadarAdminSubscriptions() {
  const onError = useCallback((message: string) => toast.error(message), [])
  const list = useAdminPagedList({
    initialFilters: INITIAL_FILTERS,
    fetchPage: platformAdminService.listSubscriptions,
    fetchSummary: platformAdminService.getSubscriptionSummary,
    onError,
  })
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [acting, setActing] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [grantTarget, setGrantTarget] = useState<{ id: string; name: string } | null>(null)
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  const summary = list.summary
  const kpis: MadarAdminKpi[] = [
    {
      label: "الاشتراكات الملغاة",
      value: String(summary?.cancelled ?? "—"),
      deltaPct: null,
      icon: XCircle,
      tone: "rose",
    },
    {
      label: "متأخرة في الدفع",
      value: String(summary?.overdue ?? "—"),
      deltaPct: null,
      icon: Clock3,
      tone: "orange",
    },
    {
      label: "في التجربة المجانية",
      value: String(summary?.trial ?? "—"),
      deltaPct: null,
      icon: Timer,
      tone: "violet",
    },
    {
      label: "الاشتراكات النشطة",
      value: String(summary?.active ?? "—"),
      deltaPct: null,
      icon: Users,
      tone: "green",
    },
    {
      label: "إجمالي الاشتراكات",
      value: String(summary?.total ?? "—"),
      deltaPct: null,
      icon: CreditCard,
      tone: "blue",
    },
  ]

  async function confirmPending() {
    if (!pending) return
    setActing(true)
    try {
      if (pending.kind === "renew") {
        await platformAdminService.renewSubscription(pending.row.id, pending.interval)
        toast.success(`تم تجديد اشتراك ${pending.row.organizationName}.`)
      } else {
        await platformAdminService.cancelSubscription(pending.row.id)
        toast.success(`تم إلغاء اشتراك ${pending.row.organizationName}.`)
      }
      setPending(null)
      list.reload()
    } catch {
      toast.error(pending.kind === "renew" ? "تعذر تجديد الاشتراك." : "تعذر إلغاء الاشتراك.")
    } finally {
      setActing(false)
    }
  }

  const pendingApplication = pending ? APPLICATION_LABEL[pending.row.application] : ""

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">الاشتراكات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة ومتابعة اشتراكات عملاء مدار في كل تطبيق.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث باسم العميل، البريد، أو معرّف الاشتراك..."
          value={list.filters.search ?? ""}
          onChange={(event) => list.setFilter("search", event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />

        <AppSelect
          value={list.filters.application ?? "all"}
          onValueChange={(value) =>
            list.setFilter("application", value as AdminSubscriptionFilters["application"])
          }
        >
          <AppSelectTrigger className="h-10 w-[180px] rounded-[10px] text-sm">
            <AppSelectValue placeholder="التطبيق" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع التطبيقات</AppSelectItem>
            {(Object.keys(APPLICATION_LABEL) as SubscriptionApplication[]).map((key) => (
              <AppSelectItem key={key} value={key}>
                {APPLICATION_LABEL[key]}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={list.filters.planTier ?? "all"}
          onValueChange={(value) =>
            list.setFilter("planTier", value as AdminSubscriptionFilters["planTier"])
          }
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="الباقة" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الباقات</AppSelectItem>
            <AppSelectItem value="starter">Starter</AppSelectItem>
            <AppSelectItem value="growth">Growth</AppSelectItem>
            <AppSelectItem value="pro">Pro</AppSelectItem>
            <AppSelectItem value="enterprise">Enterprise</AppSelectItem>
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={list.filters.status ?? "all"}
          onValueChange={(value) =>
            list.setFilter("status", value as AdminSubscriptionFilters["status"])
          }
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="الحالة" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الحالات</AppSelectItem>
            <AppSelectItem value="active">نشط</AppSelectItem>
            <AppSelectItem value="trial">تجربة مجانية</AppSelectItem>
            <AppSelectItem value="overdue">متأخر في الدفع</AppSelectItem>
            <AppSelectItem value="expired">منتهي</AppSelectItem>
            <AppSelectItem value="cancelled">ملغي</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>

      <AppCard
        state={list.loading ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>التطبيق</AppTableHead>
              <AppTableHead>الباقة</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>تاريخ الاشتراك</AppTableHead>
              <AppTableHead>التجديد / الانتهاء</AppTableHead>
              <AppTableHead>القيمة</AppTableHead>
              <AppTableHead>طريقة الدفع</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>
                  <button
                    type="button"
                    className="text-start"
                    onClick={() => setDetailId(row.organizationId)}
                  >
                    <p className="font-medium text-foreground hover:underline">
                      {row.organizationName}
                    </p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {row.ownerEmail ?? "—"}
                    </p>
                  </button>
                </AppTableCell>
                <AppTableCell>{APPLICATION_LABEL[row.application]}</AppTableCell>
                <AppTableCell>{row.planTier ? PLAN_META[row.planTier].name : "—"}</AppTableCell>
                <AppTableCell>
                  <SubscriptionStatusBadge status={row.status} />
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatDate(knownStartDate(row))}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatDate(nextRenewalDate(row))}
                </AppTableCell>
                <AppTableCell className="font-medium text-foreground">
                  {formatSar(row.priceHalalas)}
                  {row.billingInterval && row.priceHalalas !== null ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {row.billingInterval === "yearly" ? " / سنة" : " / شهر"}
                    </span>
                  ) : null}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {paymentMethodLabel(row.paymentMethod)}
                </AppTableCell>
                <AppTableCell>
                  <AppDropdownMenu>
                    <AppDropdownMenuTrigger asChild>
                      <AppButton variant="ghost" size="icon-sm" aria-label="إجراءات">
                        <MoreHorizontal className="size-4" />
                      </AppButton>
                    </AppDropdownMenuTrigger>
                    <AppDropdownMenuContent align="end">
                      <AppDropdownMenuItem onSelect={() => setDetailId(row.organizationId)}>
                        عرض تفاصيل العميل
                      </AppDropdownMenuItem>
                      <AppDropdownMenuItem
                        onSelect={() =>
                          setPending({
                            kind: "renew",
                            row,
                            interval: row.billingInterval ?? "monthly",
                          })
                        }
                      >
                        تجديد يدوي
                      </AppDropdownMenuItem>
                      {row.status !== "cancelled" ? (
                        <AppDropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setPending({ kind: "cancel", row })}
                        >
                          إلغاء الاشتراك
                        </AppDropdownMenuItem>
                      ) : null}
                    </AppDropdownMenuContent>
                  </AppDropdownMenu>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {!list.loading && list.rows.length === 0 ? (
          <AppTableEmpty
            title="لا توجد اشتراكات مطابقة"
            description="جرّب تعديل الفلاتر أو البحث."
          />
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            عرض {list.rows.length} من {list.total} نتيجة
          </p>
          <AppTablePagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            previousLabel="السابق"
            nextLabel="التالي"
          />
        </div>
      </AppCard>

      <AppDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={
          <span dir="rtl">
            {pending?.kind === "renew" ? "تجديد يدوي" : "إلغاء الاشتراك"} — {pendingApplication}
          </span>
        }
        description={
          <span dir="rtl">
            {pending?.kind === "renew"
              ? `إضافة فترة جديدة لاشتراك ${pending.row.organizationName} فوق المدة المتبقية، بنفس السعر الحالي.`
              : `سيتم إيقاف ${pendingApplication} لـ ${pending?.row.organizationName} فوراً. يبقى بإمكان العميل تسجيل الدخول والاشتراك مجدداً.`}
          </span>
        }
        contentClassName="[direction:rtl] max-w-[30rem] p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
              onClick={() => setPending(null)}
            >
              تراجع
            </AppButton>
            <AppButton
              variant={pending?.kind === "cancel" ? "destructive" : "default"}
              className="h-12 flex-1 rounded-[10px] text-[14px] font-bold"
              loading={acting}
              onClick={confirmPending}
            >
              {pending?.kind === "renew" ? "تأكيد التجديد" : "تأكيد الإلغاء"}
            </AppButton>
          </div>
        }
      >
        {pending?.kind === "renew" ? (
          <div dir="rtl">
            <label className="mb-1.5 block text-sm font-medium text-foreground">مدة التجديد</label>
            <AppSelect
              value={pending.interval}
              onValueChange={(value) =>
                setPending({ ...pending, interval: value as BillingInterval })
              }
            >
              <AppSelectTrigger className="h-11 w-full rounded-[10px]">
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="monthly">شهر واحد</AppSelectItem>
                <AppSelectItem value="yearly">سنة كاملة</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
        ) : null}
      </AppDialog>

      <CustomerDetailDialog
        customerId={detailId}
        reloadKey={detailReloadKey}
        onClose={() => setDetailId(null)}
        onGrant={setGrantTarget}
      />
      <GrantSubscriptionDialog
        customer={grantTarget}
        onClose={() => setGrantTarget(null)}
        onGranted={() => {
          list.reload()
          setDetailReloadKey((key) => key + 1)
        }}
      />
    </div>
  )
}
