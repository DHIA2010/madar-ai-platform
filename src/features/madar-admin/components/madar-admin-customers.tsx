"use client"

import { useCallback, useState } from "react"
import { CalendarClock, Clock3, MoreHorizontal, Timer, UserCheck, Users } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
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
  formatDate,
  formatRelative,
  formatSar,
  knownStartDate,
  nextRenewalDate,
  PLAN_META,
  platformAdminService,
  STORE_PLATFORM_KEY,
} from "../services"
import type { AdminCustomer, AdminCustomerFilters } from "../types/platform-admin.types"
import { CustomerDetailDialog } from "./customer-detail-dialog"
import { GrantSubscriptionDialog } from "./grant-subscription-dialog"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

const SELECT_TRIGGER_CLASSNAME = "h-10 w-[150px] rounded-[10px] text-sm"
const INITIAL_FILTERS: AdminCustomerFilters = {
  search: "",
  platform: "all",
  planTier: "all",
  status: "all",
}

// The earliest-ending running subscription -- the customer's next renewal/trial end.
function nextRenewal(customer: AdminCustomer): string | null {
  const dates = customer.subscriptions
    .map(nextRenewalDate)
    .filter((date): date is string => date !== null)
    .sort()
  return dates[0] ?? null
}

function firstSubscribedAt(customer: AdminCustomer): string | null {
  const dates = customer.subscriptions
    .map(knownStartDate)
    .filter((date) => date !== null)
    .sort()
  return dates[0] ?? null
}

export function MadarAdminCustomers() {
  const onError = useCallback((message: string) => toast.error(message), [])
  const list = useAdminPagedList({
    initialFilters: INITIAL_FILTERS,
    fetchPage: platformAdminService.listCustomers,
    fetchSummary: platformAdminService.getCustomerSummary,
    onError,
  })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [grantTarget, setGrantTarget] = useState<{ id: string; name: string } | null>(null)
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  const summary = list.summary
  const kpis: MadarAdminKpi[] = [
    {
      label: "تجديد خلال 7 أيام",
      value: String(summary?.renewingSoon ?? "—"),
      deltaPct: null,
      icon: CalendarClock,
      tone: "rose",
    },
    {
      label: "متأخرون في الدفع",
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
      label: "العملاء النشطين",
      value: String(summary?.active ?? "—"),
      deltaPct: null,
      icon: UserCheck,
      tone: "green",
    },
    {
      label: "إجمالي العملاء",
      value: String(summary?.total ?? "—"),
      deltaPct: null,
      icon: Users,
      tone: "blue",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">العملاء</h1>
        <p className="mt-1 text-sm text-muted-foreground">إدارة جميع العملاء المسجلين في مدار.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث باسم العميل أو البريد الإلكتروني..."
          value={list.filters.search ?? ""}
          onChange={(event) => list.setFilter("search", event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />

        <AppSelect
          value={list.filters.platform ?? "all"}
          onValueChange={(value) =>
            list.setFilter("platform", value as AdminCustomerFilters["platform"])
          }
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="المنصة" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع المنصات</AppSelectItem>
            <AppSelectItem value="salla">سلة</AppSelectItem>
            <AppSelectItem value="zid">زد</AppSelectItem>
            <AppSelectItem value="shopify">Shopify</AppSelectItem>
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={list.filters.planTier ?? "all"}
          onValueChange={(value) =>
            list.setFilter("planTier", value as AdminCustomerFilters["planTier"])
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
            list.setFilter("status", value as AdminCustomerFilters["status"])
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
            <AppSelectItem value="none">بدون اشتراك</AppSelectItem>
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
              <AppTableHead>المنصة</AppTableHead>
              <AppTableHead>الباقة</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>تاريخ الاشتراك</AppTableHead>
              <AppTableHead>تاريخ التجديد</AppTableHead>
              <AppTableHead>الإيراد الشهري</AppTableHead>
              <AppTableHead>آخر نشاط</AppTableHead>
              <AppTableHead className="w-10" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((customer) => (
              <AppTableRow
                key={customer.id}
                className="cursor-pointer"
                onClick={() => setDetailId(customer.id)}
              >
                <AppTableCell>
                  <p className="font-medium text-foreground">{customer.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {customer.owner?.email ?? "—"}
                  </p>
                </AppTableCell>
                <AppTableCell>
                  {customer.platforms.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {customer.platforms.map((platform) => (
                        <PlatformChip key={platform} platform={STORE_PLATFORM_KEY[platform]} />
                      ))}
                    </div>
                  )}
                </AppTableCell>
                <AppTableCell>
                  {customer.planTier ? PLAN_META[customer.planTier].name : "—"}
                </AppTableCell>
                <AppTableCell>
                  <SubscriptionStatusBadge status={customer.status} />
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatDate(firstSubscribedAt(customer))}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatDate(nextRenewal(customer))}
                </AppTableCell>
                <AppTableCell className="font-medium text-foreground">
                  {formatSar(customer.monthlyRevenueHalalas)}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatRelative(customer.lastActivityAt)}
                </AppTableCell>
                <AppTableCell onClick={(event) => event.stopPropagation()}>
                  <AppDropdownMenu>
                    <AppDropdownMenuTrigger asChild>
                      <AppButton variant="ghost" size="icon-sm" aria-label="إجراءات">
                        <MoreHorizontal className="size-4" />
                      </AppButton>
                    </AppDropdownMenuTrigger>
                    <AppDropdownMenuContent align="end">
                      <AppDropdownMenuItem onSelect={() => setDetailId(customer.id)}>
                        عرض التفاصيل
                      </AppDropdownMenuItem>
                      <AppDropdownMenuItem
                        onSelect={() => setGrantTarget({ id: customer.id, name: customer.name })}
                      >
                        تفعيل اشتراك
                      </AppDropdownMenuItem>
                    </AppDropdownMenuContent>
                  </AppDropdownMenu>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {!list.loading && list.rows.length === 0 ? (
          <AppTableEmpty title="لا يوجد عملاء مطابقين" description="جرّب تعديل الفلاتر أو البحث." />
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
