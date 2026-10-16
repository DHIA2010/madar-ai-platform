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
import { useLocale, useTranslations } from "next-intl"

import { localeDirection, type Locale } from "@/i18n/locales"
import { AppEmpty } from "@/components/app"
import {
  DONUT_COLORS,
  DonutBreakdown,
  KpiCard,
  LivePill,
  SurfaceCard,
} from "@/components/design/dashboard-surface"
import { cairo } from "@/components/design/fonts"
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

const COUNTRY_BAR_COLORS = ["#2563eb", "#60a5fa", "#93c5fd", "#bfdbfe"]

type LiveVisitorsTranslator = ReturnType<typeof useTranslations<"liveVisitors">>

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCurrency(value: number, locale: Locale): string {
  const amount = formatMoney(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

// Live durations are read at a glance, so they stay as mm:ss rather than a relative phrase.
function formatDuration(fromIso: string, toIso: string) {
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function visitorInitial(visitor: LiveVisitorRecord) {
  const source = visitor.city ?? visitor.country ?? visitor.visitorId
  return source.trim().charAt(0).toUpperCase() || "?"
}

function visitorLocation(
  visitor: LiveVisitorRecord,
  locale: Locale,
  t: LiveVisitorsTranslator
): string {
  const parts = [visitor.city, visitor.country].filter(Boolean)
  return parts.length > 0 ? parts.join(locale === "ar" ? "، " : ", ") : t("unknownLocation")
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

export default function LiveVisitorsPage() {
  const t = useTranslations("liveVisitors")
  const locale = useLocale() as Locale
  const [data, setData] = useState<LiveDashboardRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
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
          setLoadError(error instanceof Error ? error.message : t("loadErrorFallback"))
        }
      } finally {
        if (!options.silent) setIsLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load({ silent: true }), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  const summary = data?.summary
  const now = refreshedAt ?? new Date().toISOString()
  const windowLabel = data ? t("windowLabel", { minutes: data.windowMinutes }) : "—"

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
    <div className={`${cairo.className} bg-[#f1f5f9] px-[22px] py-5`} dir={localeDirection(locale)}>
      {/* Header */}
      <div className="mb-4">
        <div className="mb-3.5 flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold leading-[1.3] text-[#0d1b3e]">
                {t("title")}
              </h1>
              <LivePill label={t("livePill")} />
              {isLoading ? <Loader2 className="size-4 animate-spin text-[#8098b4]" /> : null}
            </div>
            <p className="text-[12.5px] text-[#8098b4]">{t("subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#e8edf3] bg-white px-3 py-[7px]">
            <Search className="size-[15px] text-[#b0c0d4]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
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
          label={t("kpis.liveVisitorsNow.label")}
          value={String(summary?.liveVisitors ?? 0)}
          hint={windowLabel}
          icon={<Users className="size-5 text-[#7c3aed]" />}
          iconClassName="bg-[#f5f3ff]"
        />
        <KpiCard
          label={t("kpis.activePlatforms.label")}
          value={String(summary?.activePlatforms ?? 0)}
          hint={t("kpis.activePlatforms.hint")}
          icon={<Layers className="size-5 text-[#10b981]" />}
          iconClassName="bg-[#ecfdf5]"
        />
        <KpiCard
          label={t("kpis.pageViewsNow.label")}
          value={String(summary?.pageViews ?? 0)}
          hint={windowLabel}
          icon={<Eye className="size-5 text-[#7c3aed]" />}
          iconClassName="bg-[#f5f3ff]"
        />
        <KpiCard
          label={t("kpis.engagementRate.label")}
          value={`${summary?.engagementRate ?? 0}%`}
          hint={t("kpis.engagementRate.hint")}
          icon={<Activity className="size-5 text-[#f59e0b]" />}
          iconClassName="bg-[#fffbeb]"
        />
        <KpiCard
          label={t("kpis.ordersNow.label")}
          value={String(summary?.orders ?? 0)}
          hint={windowLabel}
          icon={<ShoppingBag className="size-5 text-[#2563eb]" />}
          iconClassName="bg-[#eff6ff]"
        />
      </div>

      {/* KPI row 2 */}
      <div className="mb-3.5 flex items-stretch gap-3">
        <KpiCard
          label={t("kpis.addToCartsNow.label")}
          value={String(summary?.addToCarts ?? 0)}
          hint={windowLabel}
          icon={<ShoppingCart className="size-5 text-[#7c3aed]" />}
          iconClassName="bg-[#f5f3ff]"
        />
        <KpiCard
          label={t("kpis.productsAddedToCart.label")}
          value={String(summary?.productsAddedToCart ?? 0)}
          hint={t("kpis.productsAddedToCart.hint")}
          icon={<ShoppingBag className="size-5 text-[#0d9488]" />}
          iconClassName="bg-[#f0fdfa]"
        />
        <KpiCard
          wide
          label={t("kpis.cartValueNow.label")}
          value={formatCurrency(summary?.cartValue ?? 0, locale)}
          hint={windowLabel}
          icon={<DollarSign className="size-5 text-[#f59e0b]" />}
          iconClassName="bg-[#fffbeb]"
        />
        <KpiCard
          wide
          label={t("kpis.orderValueNow.label")}
          value={formatCurrency(summary?.orderValue ?? 0, locale)}
          hint={windowLabel}
          icon={<DollarSign className="size-5 text-[#2563eb]" />}
          iconClassName="bg-[#eff6ff]"
        />
      </div>

      {/* Live list + donut + map.
          RTL grid auto-placement: the first DOM child lands in the rightmost track. */}
      <div className="mb-3.5 grid grid-cols-[1fr_1fr_2fr] gap-3">
        <SurfaceCard title={t("liveVisitorsCardTitle", { count: summary?.liveVisitors ?? 0 })}>
          <div className="flex-1">
            {filteredVisitors.length === 0 ? (
              <div className="px-[18px] py-8 text-center text-xs text-[#8098b4]">
                {search ? t("noSearchResults") : t("noActiveVisitors")}
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
                      {visitorLocation(visitor, locale, t)}
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
        </SurfaceCard>

        <div className="rounded-xl border border-[#e8edf3] bg-white px-5 py-[18px] shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]">
          <div className="mb-3.5 text-sm font-bold text-[#0d1b3e]">{t("trafficSourceTitle")}</div>
          <DonutBreakdown
            entries={(data?.trafficSources ?? []).map((entry) => ({
              label: entry.label || t("unknown"),
              value: entry.visitors,
              share: entry.share,
            }))}
            total={summary?.liveVisitors ?? 0}
            centerLabel={t("totalVisitors")}
            emptyLabel={t("noDataYet")}
          />
        </div>

        <div className="flex flex-col rounded-xl border border-[#e8edf3] bg-white px-5 py-[18px] shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]">
          <div className="mb-3.5 flex shrink-0 items-center gap-[7px]">
            <Globe className="size-3.5 text-[#8098b4]" />
            <span className="text-sm font-bold text-[#0d1b3e]">{t("visitorDistribution")}</span>
          </div>
          <div className="flex min-h-0 flex-1 gap-5">
            <div className="flex w-[170px] shrink-0 flex-col gap-[9px] self-start">
              {(data?.countries ?? []).length === 0 ? (
                <span className="text-xs text-[#8098b4]">{t("noDataYet")}</span>
              ) : (
                (data?.countries ?? []).slice(0, 6).map((entry, index) => (
                  <div key={entry.label || `unknown-${index}`}>
                    <div className="mb-[3px] flex items-center justify-between">
                      <span className="truncate text-[11px] font-medium text-[#334155]">
                        {entry.label || t("unknown")}
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
              <WorldMapIllustration label={t("worldMapAlt")} />
            </div>
          </div>
        </div>
      </div>

      {/* Cart additions + top products */}
      <div className="grid grid-cols-2 gap-3">
        <SurfaceCard title={t("recentCartAdditions")}>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-[#e8edf3] bg-[#f8fafc] px-[18px] py-2">
            <span className="text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.product")}
            </span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.price")}
            </span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.quantity")}
            </span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.value")}
            </span>
          </div>
          {(data?.recentCartAdditions ?? []).length === 0 ? (
            <AppEmpty
              title={t("noCartAdditions.title")}
              description={t("noCartAdditions.description")}
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
                  {item.productName ?? item.productId ?? t("unknownProduct")}
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
              {t("totalAdditions")} <strong>{summary?.addToCarts ?? 0}</strong>
            </span>
            <span>
              {t("totalValue")}{" "}
              <strong className="inline-block text-[#0d1b3e]" dir="ltr">
                {formatCurrency(summary?.cartValue ?? 0, locale)}
              </strong>
            </span>
          </div>
        </SurfaceCard>

        <SurfaceCard title={t("topProductsTitle")}>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 border-b border-[#e8edf3] bg-[#f8fafc] px-[18px] py-2">
            <span className="text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.product")}
            </span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.views")}
            </span>
            <span className="text-center text-[11px] font-semibold text-[#8098b4]">
              {t("tableHeaders.addToCarts")}
            </span>
          </div>
          {(data?.topProducts ?? []).length === 0 ? (
            <AppEmpty title={t("noProducts.title")} description={t("noProducts.description")} />
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
        </SurfaceCard>
      </div>
    </div>
  )
}
