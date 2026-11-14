"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  Package,
  ReceiptText,
  ShoppingCart,
  UserCheck,
  Users,
  UserX,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppCard,
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

import { APPLICATION_LABEL, formatDate, formatRelative, platformAdminService } from "../services"
import type {
  AdminUsageLevel,
  AdminUtilization,
  AdminUtilizationFilters,
  AdminUtilizationSort,
} from "../types/platform-admin.types"
import { CrmDateRange } from "./crm-filters"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { SubscriptionStatusBadge } from "./subscription-status-badge"
import {
  formatCount,
  presetRange,
  UsageBadge,
  usageMeta,
  UTILIZATION_METRICS,
  UtilizationChart,
  type UtilizationRange,
  UtilizationRangeControl,
} from "./utilization-ui"

const PAGE_SIZE = 15
const SEARCH_DEBOUNCE_MS = 300
const SELECT_TRIGGER_CLASSNAME = "h-10 w-[160px] rounded-[10px] text-sm"
const INITIAL_FILTERS: AdminUtilizationFilters = {
  search: "",
  status: "all",
  application: "all",
  platform: "all",
  usage: "all",
}
const USAGE_LEVELS: AdminUsageLevel[] = ["active", "idle", "never"]

// A column header that sorts the table: highest first, a second click flips it.
function SortHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: AdminUtilizationSort
  sort: { key: AdminUtilizationSort; direction: "asc" | "desc" }
  onSort: (key: AdminUtilizationSort) => void
}) {
  const active = sort.key === sortKey
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown
  return (
    <AppTableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
          active && "font-bold text-foreground"
        )}
      >
        {label}
        {active ? <Arrow className="size-3.5" /> : null}
      </button>
    </AppTableHead>
  )
}

// How much every customer actually uses Madar: what they created (products, invoices, orders,
// ...) in total and inside the chosen period, with filters to slice the customer base.
export function MadarAdminUtilization() {
  const router = useRouter()
  const [range, setRange] = useState<UtilizationRange>(() => presetRange(30))
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<{ key: AdminUtilizationSort; direction: "asc" | "desc" }>({
    key: "activity",
    direction: "desc",
  })
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState<{ key: string; data: AdminUtilization } | null>(null)

  // The search box applies after a short pause; everything else applies straight away.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((current) => (current.search === search ? current : { ...current, search }))
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [search])

  const requestKey = JSON.stringify([range.from, range.to, filters, sort, page])
  useEffect(() => {
    let active = true
    platformAdminService
      .getUtilization(filters, {
        from: range.from,
        to: range.to,
        sort: sort.key,
        direction: sort.direction,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((data) => {
        if (active) setLoaded({ key: requestKey, data })
      })
      .catch(() => {
        if (active) toast.error("تعذر تحميل بيانات الاستخدام.")
      })
    return () => {
      active = false
    }
    // requestKey stands for range, filters, sort, and page together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  // The previous numbers stay on screen while the next ones load.
  const data = loaded?.data ?? null
  const loading = loaded?.key !== requestKey
  const summary = data?.summary

  const setFilter = <K extends keyof AdminUtilizationFilters>(
    key: K,
    value: AdminUtilizationFilters[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }
  const onSort = (key: AdminUtilizationSort) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
        : { key, direction: key === "name" ? "asc" : "desc" }
    )
    setPage(1)
  }

  const activeShare =
    summary && summary.customers > 0 ? Math.round((summary.active / summary.customers) * 100) : null
  const kpis: MadarAdminKpi[] = summary
    ? [
        {
          label: "العملاء",
          value: formatCount(summary.customers),
          deltaPct: null,
          icon: Users,
          tone: "blue",
        },
        {
          label: "نشطون في الفترة",
          value: formatCount(summary.active),
          unit: activeShare === null ? undefined : `(${activeShare}٪)`,
          deltaPct: null,
          icon: UserCheck,
          tone: "green",
        },
        {
          label: "منتجات أُضيفت في الفترة",
          value: formatCount(summary.inRange.products),
          unit: `من ${formatCount(summary.totals.products)}`,
          deltaPct: null,
          icon: Package,
          tone: "indigo",
        },
        {
          label: "فواتير صدرت في الفترة",
          value: formatCount(summary.inRange.posInvoices + summary.inRange.salesInvoices),
          unit: `من ${formatCount(summary.totals.posInvoices + summary.totals.salesInvoices)}`,
          deltaPct: null,
          icon: ReceiptText,
          tone: "violet",
        },
        {
          label: "طلبات في الفترة",
          value: formatCount(summary.inRange.orders),
          unit: `من ${formatCount(summary.totals.orders)}`,
          deltaPct: null,
          icon: ShoppingCart,
          tone: "orange",
        },
        {
          label: "لم يبدأوا الاستخدام",
          value: formatCount(summary.never),
          deltaPct: null,
          icon: UserX,
          tone: "rose",
        },
      ]
    : []

  const total = data?.page.total ?? 0
  const rows = data?.page.items ?? []

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">استخدام العملاء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ما أضافه كل عميل في مدار: المنتجات والفواتير والطلبات وغيرها، إجمالًا وخلال الفترة
            المحددة.
          </p>
        </div>
        <UtilizationRangeControl
          range={range}
          onChange={(next) => {
            setRange(next)
            setPage(1)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث باسم العميل أو البريد الإلكتروني..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />

        <AppSelect
          value={filters.status ?? "all"}
          onValueChange={(value) => setFilter("status", value as AdminUtilizationFilters["status"])}
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="الاشتراك" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الاشتراكات</AppSelectItem>
            <AppSelectItem value="trial">تجربة مجانية</AppSelectItem>
            <AppSelectItem value="active">مشترك (مدفوع)</AppSelectItem>
            <AppSelectItem value="overdue">متأخر في الدفع</AppSelectItem>
            <AppSelectItem value="expired">منتهي</AppSelectItem>
            <AppSelectItem value="cancelled">ملغي</AppSelectItem>
            <AppSelectItem value="none">بدون اشتراك</AppSelectItem>
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={filters.usage ?? "all"}
          onValueChange={(value) => setFilter("usage", value as AdminUtilizationFilters["usage"])}
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue placeholder="مستوى الاستخدام" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">كل مستويات الاستخدام</AppSelectItem>
            <AppSelectItem value="active">نشط في الفترة</AppSelectItem>
            <AppSelectItem value="idle">خامل (لا جديد في الفترة)</AppSelectItem>
            <AppSelectItem value="never">لم يبدأ الاستخدام</AppSelectItem>
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={filters.application ?? "all"}
          onValueChange={(value) =>
            setFilter("application", value as AdminUtilizationFilters["application"])
          }
        >
          <AppSelectTrigger className={cn(SELECT_TRIGGER_CLASSNAME, "w-[190px]")}>
            <AppSelectValue placeholder="التطبيق" />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع التطبيقات</AppSelectItem>
            {Object.entries(APPLICATION_LABEL).map(([application, label]) => (
              <AppSelectItem key={application} value={application}>
                {label}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>

        <AppSelect
          value={filters.platform ?? "all"}
          onValueChange={(value) =>
            setFilter("platform", value as AdminUtilizationFilters["platform"])
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

        <CrmDateRange
          from={filters.createdFrom}
          to={filters.createdTo}
          placeholder="تاريخ التسجيل"
          onChange={(next) => {
            setFilters((current) => ({
              ...current,
              createdFrom: next.from,
              createdTo: next.to,
            }))
            setPage(1)
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data === null
          ? Array.from({ length: 6 }, (_, index) => (
              <AppCard
                key={index}
                state="loading"
                className="h-[150px] rounded-2xl border-border/60"
              />
            ))
          : kpis.map((kpi) => <MadarAdminKpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <UtilizationChart
          title="الاستخدام عبر الوقت"
          daily={data?.daily ?? []}
          loading={data === null}
          showActiveCustomers
          className="lg:col-span-2"
        />

        <AppCard
          title="مستوى الاستخدام"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <ul className="space-y-4 pt-2">
            {USAGE_LEVELS.map((level) => {
              const count = summary?.[level] ?? 0
              const share =
                summary && summary.customers > 0 ? Math.round((count / summary.customers) * 100) : 0
              return (
                <li key={level}>
                  <button
                    type="button"
                    className="w-full text-start"
                    onClick={() => setFilter("usage", filters.usage === level ? "all" : level)}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{usageMeta(level).label}</span>
                      <span className="text-muted-foreground">
                        {formatCount(count)} ({share}٪)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-muted">
                      <div
                        className={cn("h-2 rounded-full", usageMeta(level).bar)}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="mb-3 text-xs font-semibold text-muted-foreground">
              ما أُضيف خلال الفترة (والإجمالي)
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {UTILIZATION_METRICS.map((metric) => (
                <li key={metric.key} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{metric.label}</span>
                  <span className="font-semibold whitespace-nowrap" dir="ltr">
                    {formatCount(summary?.inRange[metric.key] ?? 0)}
                    <span className="ms-1 text-xs font-normal text-muted-foreground">
                      / {formatCount(summary?.totals[metric.key] ?? 0)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </AppCard>
      </div>

      <AppCard
        state={data === null ? "loading" : "idle"}
        className={cn(
          "overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm transition-opacity",
          loading && data !== null && "opacity-60"
        )}
      >
        <p className="border-b border-border/60 px-4 py-3 text-xs text-muted-foreground">
          في كل خانة: الإجمالي منذ التسجيل، وتحته بالأخضر ما أُضيف خلال الفترة المحددة. اضغط على
          عنوان العمود للترتيب، وعلى العميل لعرض استخدامه عبر الوقت.
        </p>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <SortHead label="العميل" sortKey="name" sort={sort} onSort={onSort} />
              <AppTableHead>الاشتراك</AppTableHead>
              <SortHead label="الاستخدام" sortKey="activity" sort={sort} onSort={onSort} />
              {UTILIZATION_METRICS.map((metric) => (
                <SortHead
                  key={metric.key}
                  label={metric.label}
                  sortKey={metric.key}
                  sort={sort}
                  onSort={onSort}
                />
              ))}
              <AppTableHead className="whitespace-nowrap">مستخدمون / فروع</AppTableHead>
              <SortHead label="تاريخ التسجيل" sortKey="createdAt" sort={sort} onSort={onSort} />
              <SortHead label="آخر إضافة" sortKey="lastUsedAt" sort={sort} onSort={onSort} />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {rows.map((row) => (
              <AppTableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => router.push(ROUTES.madarAdminCustomerUtilization(row.id))}
              >
                <AppTableCell>
                  <p className="font-medium whitespace-nowrap text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {row.owner?.email ?? "—"}
                  </p>
                </AppTableCell>
                <AppTableCell>
                  <SubscriptionStatusBadge status={row.status} />
                </AppTableCell>
                <AppTableCell>
                  <UsageBadge level={row.usage} />
                </AppTableCell>
                {UTILIZATION_METRICS.map((metric) => (
                  <AppTableCell key={metric.key}>
                    <p
                      className={cn(
                        "font-semibold",
                        row.totals[metric.key] === 0
                          ? "text-muted-foreground/60"
                          : "text-foreground"
                      )}
                    >
                      {formatCount(row.totals[metric.key])}
                    </p>
                    {row.inRange[metric.key] > 0 ? (
                      <p className="text-xs font-medium text-emerald-600" dir="ltr">
                        +{formatCount(row.inRange[metric.key])}
                      </p>
                    ) : null}
                  </AppTableCell>
                ))}
                <AppTableCell className="whitespace-nowrap text-muted-foreground" dir="ltr">
                  {row.members} / {row.branches}
                </AppTableCell>
                <AppTableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(row.createdAt)}
                </AppTableCell>
                <AppTableCell className="whitespace-nowrap text-muted-foreground">
                  {formatRelative(row.lastUsedAt)}
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {data !== null && rows.length === 0 ? (
          <AppTableEmpty title="لا يوجد عملاء مطابقين" description="جرّب تعديل الفلاتر أو البحث." />
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            عرض {rows.length} من {total} عميل
          </p>
          <AppTablePagination
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            onPageChange={setPage}
            previousLabel="السابق"
            nextLabel="التالي"
          />
        </div>
      </AppCard>
    </div>
  )
}
