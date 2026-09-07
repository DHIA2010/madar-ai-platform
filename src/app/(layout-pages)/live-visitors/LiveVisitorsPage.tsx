"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  DollarSign,
  Eye,
  Globe,
  Layers,
  Loader2,
  Monitor,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Users,
} from "lucide-react"

import { AppEmpty } from "@/components/app"
import { tajawal } from "@/features/campaign-links/components/design/fonts"
import { WorldMapIllustration } from "@/features/live-visitors/components/world-map"
import {
  liveVisitorsService,
  type LiveDashboardRecord,
  type LiveVisitorRecord,
} from "@/features/live-visitors/services/live-visitors.service"

// The page polls rather than streaming: the underlying presence table is already a
// query-time-filtered snapshot (tracking_live_visitors, migration 043) with no push channel, and
// a 15s refresh is well inside the 5-minute live window so a visitor can't appear and vanish
// between renders.
const REFRESH_INTERVAL_MS = 15_000

const DONUT_COLORS = ["#2563eb", "#7c3aed", "#10b981", "#0891b2", "#f59e0b", "#64748b"]
const COUNTRY_BAR_COLORS = ["#2563eb", "#60a5fa", "#93c5fd", "#bfdbfe"]

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Live durations are read at a glance, so they stay as mm:ss rather than "منذ 3 دقائق".
function formatDuration(fromIso: string, toIso: string) {
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function visitorInitial(visitor: LiveVisitorRecord) {
  const source = visitor.city ?? visitor.country ?? visitor.visitorId
  return source.trim().charAt(0).toUpperCase() || "?"
}

function visitorLocation(visitor: LiveVisitorRecord) {
  const parts = [visitor.city, visitor.country].filter(Boolean)
  return parts.length > 0 ? parts.join("، ") : "موقع غير معروف"
}

function visitorPage(visitor: LiveVisitorRecord) {
  if (visitor.productName) return visitor.productName
  if (visitor.currentPageTitle) return visitor.currentPageTitle
  if (!visitor.currentPageUrl) return "—"
  try {
    return new URL(visitor.currentPageUrl).pathname || "/"
  } catch {
    return visitor.currentPageUrl
  }
}

interface KpiCardProps {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  iconClassName: string
  wide?: boolean
}

function KpiCard({ label, value, hint, icon, iconClassName, wide }: KpiCardProps) {
  return (
    <div
      className="flex min-h-[100px] min-w-0 shrink flex-col gap-1.5 rounded-xl border border-[#e8edf3] bg-white px-[18px] py-4 shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
      style={{ flexGrow: wide ? 1.6 : 1, flexBasis: 0 }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 text-xs font-medium text-[#8098b4]">{label}</div>
          <div className="text-[26px] font-extrabold leading-[1.1] text-[#0d1b3e]" dir="ltr">
            {value}
          </div>
        </div>
        <div
          className={`flex size-[42px] shrink-0 items-center justify-center rounded-[10px] ${iconClassName}`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-0.5 text-[11px] text-[#8098b4]">{hint}</div>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)] ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-[#e8edf3] px-[18px] py-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold text-[#0d1b3e]">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function DonutChart({
  entries,
  total,
}: {
  entries: LiveDashboardRecord["trafficSources"]
  total: number
}) {
  const radius = 65
  const circumference = 2 * Math.PI * radius
  let cumulative = 0

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <g transform="rotate(-90, 100, 100)">
            {total === 0 ? (
              <circle cx={100} cy={100} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={24} />
            ) : (
              entries.map((entry, index) => {
                const length = (entry.visitors / total) * circumference
                const offset = -(cumulative / total) * circumference
                cumulative += entry.visitors
                return (
                  <circle
                    key={entry.label || `unknown-${index}`}
                    cx={100}
                    cy={100}
                    r={radius}
                    fill="none"
                    stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                    strokeWidth={24}
                    strokeDasharray={`${Math.max(0, length - 2)} ${circumference - length + 2}`}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                  />
                )
              })
            )}
          </g>
          <text
            x="100"
            y="97"
            textAnchor="middle"
            className="fill-[#0d1b3e] text-2xl font-extrabold"
          >
            {total}
          </text>
          <text x="100" y="114" textAnchor="middle" className="fill-[#8098b4] text-[10px]">
            إجمالي الزوار
          </text>
        </svg>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {entries.length === 0 ? (
          <span className="text-xs text-[#8098b4]">لا توجد بيانات بعد</span>
        ) : (
          entries.map((entry, index) => (
            <div key={entry.label || `unknown-${index}`} className="flex items-center">
              <div className="flex min-w-0 flex-1 items-center gap-[7px]">
                <div
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}
                />
                <span className="truncate text-[12.5px] font-medium text-[#334155]">
                  {entry.label || "غير معروف"}
                </span>
              </div>
              <span
                className="min-w-[28px] shrink-0 text-center text-xs font-semibold text-[#0d1b3e]"
                dir="ltr"
              >
                {entry.visitors}
              </span>
              <span
                className="min-w-[54px] shrink-0 text-left text-[11.5px] text-[#8098b4]"
                dir="ltr"
              >
                ({entry.share}%)
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function LiveVisitorsPage() {
  const [data, setData] = useState<LiveDashboardRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setIsLoading(true)
    try {
      const dashboard = await liveVisitorsService.getDashboard()
      setData(dashboard)
      setLoadError(null)
      setRefreshedAt(new Date().toISOString())
    } catch (error) {
      // A failed background refresh keeps the last good snapshot on screen rather than blanking
      // a dashboard someone is watching; only the very first load surfaces an error state.
      if (!options.silent) {
        setLoadError(error instanceof Error ? error.message : "تعذر تحميل بيانات الزوار.")
      }
    } finally {
      if (!options.silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load({ silent: true }), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  const summary = data?.summary
  const now = refreshedAt ?? new Date().toISOString()
  const windowLabel = data ? `خلال آخر ${data.windowMinutes} دقائق` : "—"

  const filteredVisitors = useMemo(() => {
    const visitors = data?.visitors ?? []
    const term = search.trim().toLowerCase()
    if (!term) return visitors
    return visitors.filter((visitor) =>
      [
        visitor.country,
        visitor.city,
        visitor.deviceType,
        visitor.browser,
        visitor.trafficSource,
        visitor.currentPageUrl,
        visitor.currentPageTitle,
        visitor.productName,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    )
  }, [data?.visitors, search])

  const maxCountryShare = Math.max(1, ...(data?.countries ?? []).map((entry) => entry.share))

  return (
    <div className={`${tajawal.className} bg-[#f1f5f9] px-[22px] py-5`} dir="rtl">
      {/* Header */}
      <div className="mb-4">
        <div className="mb-3.5 flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold leading-[1.3] text-[#0d1b3e]">
                الزوار المباشرون
              </h1>
              <div className="flex items-center gap-1.5 rounded-[20px] border border-[#d1fae5] bg-[#ecfdf5] px-2.5 py-[3px]">
                <span className="size-[7px] animate-pulse rounded-full bg-[#10b981]" />
                <span className="text-xs font-semibold text-[#10b981]">مباشر</span>
              </div>
              {isLoading ? <Loader2 className="size-4 animate-spin text-[#8098b4]" /> : null}
            </div>
            <p className="text-[12.5px] text-[#8098b4]">
              تابع الزوار النشطين الآن عبر جميع منصات التجارة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-3 py-[7px]">
            <Search className="size-[15px] text-[#b0c0d4]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن بلد، جهاز، صفحة..."
              className="flex-1 border-none bg-transparent text-[12.5px] text-[#334155] outline-none placeholder:text-[#b0c0d4]"
            />
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="mb-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {loadError}
        </div>
      ) : null}

      {/* KPI row 1 */}
      <div className="mb-3 flex items-stretch gap-3">
        <KpiCard
          label="الزوار المباشرون الآن"
          value={String(summary?.liveVisitors ?? 0)}
          hint={windowLabel}
          icon={<Users className="size-5 text-[#7c3aed]" />}
          iconClassName="bg-[#f5f3ff]"
        />
        <KpiCard
          label="عدد المنصات النشطة"
          value={String(summary?.activePlatforms ?? 0)}
          hint="متاجر مرتبطة"
          icon={<Layers className="size-5 text-[#10b981]" />}
          iconClassName="bg-[#ecfdf5]"
        />
        <KpiCard
          label="مشاهدات الصفحات الآن"
          value={String(summary?.pageViews ?? 0)}
          hint={windowLabel}
          icon={<Eye className="size-5 text-[#7c3aed]" />}
          iconClassName="bg-[#f5f3ff]"
        />
        <KpiCard
          label="معدل التفاعل"
          value={`${summary?.engagementRate ?? 0}%`}
          hint="زوار قاموا بإجراء شرائي"
          icon={<Activity className="size-5 text-[#f59e0b]" />}
          iconClassName="bg-[#fffbeb]"
        />
        <KpiCard
          label="الطلبات الآن"
          value={String(summary?.orders ?? 0)}
          hint={windowLabel}
          icon={<ShoppingBag className="size-5 text-[#2563eb]" />}
          iconClassName="bg-[#eff6ff]"
        />
      </div>

      {/* KPI row 2 */}
      <div className="mb-3.5 flex items-stretch gap-3">
        <KpiCard
          label="إضافات للسلة الآن"
          value={String(summary?.addToCarts ?? 0)}
          hint={windowLabel}
          icon={<ShoppingCart className="size-5 text-[#7c3aed]" />}
          iconClassName="bg-[#f5f3ff]"
        />
        <KpiCard
          label="منتجات أضيفت للسلة"
          value={String(summary?.productsAddedToCart ?? 0)}
          hint="منتجات مختلفة"
          icon={<ShoppingBag className="size-5 text-[#0d9488]" />}
          iconClassName="bg-[#f0fdfa]"
        />
        <KpiCard
          wide
          label="قيمة سلال التسوق الآن"
          value={`SAR ${formatMoney(summary?.cartValue ?? 0)}`}
          hint={windowLabel}
          icon={<DollarSign className="size-5 text-[#f59e0b]" />}
          iconClassName="bg-[#fffbeb]"
        />
        <KpiCard
          wide
          label="قيمة الطلبات الآن"
          value={`SAR ${formatMoney(summary?.orderValue ?? 0)}`}
          hint={windowLabel}
          icon={<DollarSign className="size-5 text-[#2563eb]" />}
          iconClassName="bg-[#eff6ff]"
        />
      </div>

      {/* Live list + donut + map.
          RTL grid auto-placement: the first DOM child lands in the rightmost track. */}
      <div className="mb-3.5 grid grid-cols-[1fr_1fr_2fr] gap-3">
        <SectionCard title={`الزوار المباشرون الآن (${summary?.liveVisitors ?? 0})`}>
          <div className="flex-1">
            {filteredVisitors.length === 0 ? (
              <div className="px-[18px] py-8 text-center text-xs text-[#8098b4]">
                {search ? "لا نتائج مطابقة للبحث." : "لا يوجد زوار نشطون الآن."}
              </div>
            ) : (
              filteredVisitors.slice(0, 8).map((visitor, index) => (
                <div
                  key={visitor.visitorId}
                  className={`flex min-w-0 items-center gap-2 px-3.5 py-[9px] ${
                    index < Math.min(filteredVisitors.length, 8) - 1
                      ? "border-b border-[#e8edf3]"
                      : ""
                  }`}
                >
                  <div
                    className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: `${DONUT_COLORS[index % DONUT_COLORS.length]}22`,
                      color: DONUT_COLORS[index % DONUT_COLORS.length],
                    }}
                  >
                    {visitorInitial(visitor)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-px truncate text-[11.5px] font-semibold text-[#0d1b3e]">
                      {visitorLocation(visitor)}
                    </div>
                    <span className="block truncate text-[10.5px] text-[#8098b4]">
                      {visitorPage(visitor)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                    <span className="text-[11px] font-semibold text-[#334155]" dir="ltr">
                      {formatDuration(visitor.firstSeenAt, now)}
                    </span>
                    {visitor.deviceType === "mobile" ? (
                      <Smartphone className="size-[13px] text-[#b0c0d4]" />
                    ) : (
                      <Monitor className="size-[13px] text-[#b0c0d4]" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <div className="rounded-xl border border-[#e8edf3] bg-white px-5 py-[18px] shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]">
          <div className="mb-3.5 text-sm font-bold text-[#0d1b3e]">الزوار حسب مصدر الزيارة</div>
          <DonutChart entries={data?.trafficSources ?? []} total={summary?.liveVisitors ?? 0} />
        </div>

        <div className="flex flex-col rounded-xl border border-[#e8edf3] bg-white px-5 py-[18px] shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]">
          <div className="mb-3.5 flex shrink-0 items-center gap-[7px]">
            <Globe className="size-3.5 text-[#8098b4]" />
            <span className="text-sm font-bold text-[#0d1b3e]">توزيع الزوار</span>
          </div>
          <div className="flex min-h-0 flex-1 gap-5">
            <div className="flex w-[170px] shrink-0 flex-col gap-[9px] self-start">
              {(data?.countries ?? []).length === 0 ? (
                <span className="text-xs text-[#8098b4]">لا توجد بيانات بعد</span>
              ) : (
                (data?.countries ?? []).slice(0, 6).map((entry, index) => (
                  <div key={entry.label || `unknown-${index}`}>
                    <div className="mb-[3px] flex items-center justify-between">
                      <span className="truncate text-[11px] font-medium text-[#334155]">
                        {entry.label || "غير معروف"}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-[#8098b4]" dir="ltr">
                        {entry.visitors} ({entry.share}%)
                      </span>
                    </div>
                    <div className="h-1 rounded bg-[#f1f5f9]">
                      <div
                        className="h-1 rounded"
                        style={{
                          width: `${(entry.share / maxCountryShare) * 100}%`,
                          background: COUNTRY_BAR_COLORS[index % COUNTRY_BAR_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="min-w-0 flex-1">
              <WorldMapIllustration />
            </div>
          </div>
        </div>
      </div>

      {/* Cart additions + top products */}
      <div className="grid grid-cols-2 gap-3">
        <SectionCard title="إضافات حديثة للسلة">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-[#e8edf3] bg-[#f8fafc] px-[18px] py-2">
            <span className="text-[11px] font-semibold text-[#8098b4]">المنتج</span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">السعر</span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">الكمية</span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">القيمة</span>
          </div>
          {(data?.recentCartAdditions ?? []).length === 0 ? (
            <AppEmpty
              title="لا توجد إضافات للسلة"
              description="ستظهر هنا المنتجات التي يضيفها الزوار للسلة الآن."
            />
          ) : (
            (data?.recentCartAdditions ?? []).map((item, index, rows) => (
              <div
                key={`${item.productId ?? "unknown"}-${item.occurredAt}`}
                className={`grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 px-[18px] py-2.5 ${
                  index < rows.length - 1 ? "border-b border-[#e8edf3]" : ""
                }`}
              >
                <span className="truncate text-xs font-semibold text-[#0d1b3e]">
                  {item.productName ?? item.productId ?? "منتج غير معروف"}
                </span>
                <span className="text-center text-xs text-[#334155]" dir="ltr">
                  {item.price === null ? "—" : formatMoney(item.price)}
                </span>
                <span className="text-center text-xs text-[#334155]">{item.quantity ?? 1}</span>
                <span className="text-center text-xs font-semibold text-[#0d1b3e]" dir="ltr">
                  {item.price === null ? "—" : formatMoney(item.price * (item.quantity ?? 1))}
                </span>
              </div>
            ))
          )}
          <div className="flex items-center justify-end gap-5 border-t border-[#e8edf3] px-[18px] py-2.5 text-xs text-[#334155]">
            <span>
              إجمالي الإضافات: <strong>{summary?.addToCarts ?? 0}</strong>
            </span>
            <span>
              القيمة الإجمالية:{" "}
              <strong className="inline-block text-[#0d1b3e]" dir="ltr">
                SAR {formatMoney(summary?.cartValue ?? 0)}
              </strong>
            </span>
          </div>
        </SectionCard>

        <SectionCard title="المنتجات الأكثر تفاعلاً">
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 border-b border-[#e8edf3] bg-[#f8fafc] px-[18px] py-2">
            <span className="text-[11px] font-semibold text-[#8098b4]">المنتج</span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">مشاهدات</span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">إضافات</span>
          </div>
          {(data?.topProducts ?? []).length === 0 ? (
            <AppEmpty
              title="لا توجد منتجات بعد"
              description="ستظهر هنا المنتجات التي يشاهدها الزوار الآن."
            />
          ) : (
            (data?.topProducts ?? []).map((product, index, rows) => (
              <div
                key={product.productId}
                className={`grid grid-cols-[2fr_1fr_1fr] items-center gap-2 px-[18px] py-2.5 ${
                  index < rows.length - 1 ? "border-b border-[#e8edf3]" : ""
                }`}
              >
                <span className="truncate text-xs font-semibold text-[#0d1b3e]">
                  {product.productName ?? product.productId}
                </span>
                <span className="text-center text-xs text-[#334155]">{product.views}</span>
                <span className="text-center text-xs font-semibold text-[#0d1b3e]">
                  {product.addToCarts}
                </span>
              </div>
            ))
          )}
        </SectionCard>
      </div>
    </div>
  )
}
