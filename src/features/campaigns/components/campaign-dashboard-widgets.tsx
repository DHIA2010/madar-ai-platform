"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  DollarSign,
  Gauge,
  Megaphone,
  Repeat2,
  Rocket,
} from "lucide-react"

import { ROUTES } from "@/constants/routes"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useCampaignList } from "../hooks"
import { CampaignStatusBadge } from "./campaign-status-badge"

const CampaignPerformanceChart = dynamic(
  () => import("./campaign-performance-chart").then((module) => module.CampaignPerformanceChart),
  {
    ssr: false,
    loading: () => <div className="h-72 rounded-xl border border-border/70 bg-muted/30" />,
  }
)

const CampaignSpendDonut = dynamic(
  () => import("./campaign-spend-donut").then((module) => module.CampaignSpendDonut),
  {
    ssr: false,
    loading: () => <div className="h-72 rounded-xl border border-border/70 bg-muted/30" />,
  }
)

type MetricKey = "spend" | "revenue" | "roas" | "ctr" | "cpc" | "conversions"
type TimeRange = "7d" | "30d" | "90d" | "12m"

const PERFORMANCE_METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: "spend", label: "Spend" },
  { key: "revenue", label: "Revenue" },
  { key: "roas", label: "ROAS" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "conversions", label: "Conversions" },
]

const TIME_RANGE_OPTIONS: Array<{ key: TimeRange; label: string; points: number }> = [
  { key: "7d", label: "7 days", points: 7 },
  { key: "30d", label: "30 days", points: 8 },
  { key: "90d", label: "90 days", points: 9 },
  { key: "12m", label: "12 months", points: 12 },
]

const DISTRIBUTION_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(var(--primary))",
]

const AI_DECISION_CENTER = {
  recommendedAction: {
    title: "Increase Meta Budget by 20%",
    summary:
      "Meta prospecting is capturing the strongest conversion volume this week without pushing CPC above target.",
    impactLabel: "Expected Business Impact",
    impactValue: "+SAR 18,500 Revenue",
    confidence: "92%",
  },
  opportunities: [
    { value: "SAR 18,500", title: "Increase Meta Budget", icon: Rocket },
    { value: "SAR 9,200", title: "Launch Retargeting Campaign", icon: Megaphone },
    { value: "SAR 6,400", title: "Duplicate Winning Creative", icon: Repeat2 },
  ],
  risks: [
    { title: "High CPC", severity: "critical" },
    { title: "Low ROAS", severity: "critical" },
    { title: "Creative Fatigue", severity: "warning" },
    { title: "Budget Ending Soon", severity: "warning" },
    { title: "Meta Token Expiring", severity: "info" },
  ],
} as const

const AI_RISK_STYLES = {
  critical: {
    badge: "destructive" as const,
    dot: "bg-destructive",
    label: "Critical",
  },
  warning: {
    badge: "secondary" as const,
    dot: "bg-chart-4",
    label: "Warning",
  },
  info: {
    badge: "outline" as const,
    dot: "bg-chart-2",
    label: "Info",
  },
}

function hash(value: string) {
  let h = 0
  for (let index = 0; index < value.length; index += 1) {
    h = (h * 31 + value.charCodeAt(index)) % 97
  }
  return h
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function useCampaignDashboardData() {
  const campaignListQuery = useCampaignList({
    page: 1,
    pageSize: 120,
    sortBy: "startDate",
    sortDirection: "desc",
  })

  const campaigns = useMemo(
    () => campaignListQuery.data?.payload.items ?? [],
    [campaignListQuery.data?.payload.items]
  )

  const kpis = useMemo(() => {
    const totalSpend = campaigns.reduce((sum, item) => sum + item.spend, 0)
    const totalRevenue = campaigns.reduce((sum, item) => sum + item.revenue, 0)
    const active = campaigns.filter((item) => item.status === "active").length
    const avgRoas =
      campaigns.length > 0
        ? campaigns.reduce((sum, item) => sum + item.roas, 0) / campaigns.length
        : 0

    return [
      {
        title: "Total Spend",
        value: formatCurrency(totalSpend),
        trend: "+6.2% vs last period",
        icon: DollarSign,
      },
      {
        title: "Revenue",
        value: formatCurrency(totalRevenue),
        trend: "+8.4% vs last period",
        icon: ArrowUpRight,
      },
      {
        title: "Active Campaigns",
        value: String(active),
        trend: `${campaigns.length} total campaigns`,
        icon: Activity,
      },
      {
        title: "ROAS",
        value: `${avgRoas.toFixed(2)}x`,
        trend: avgRoas >= 2 ? "Healthy return" : "Below target",
        icon: Gauge,
      },
    ]
  }, [campaigns])

  const distribution = useMemo(() => {
    const platforms = ["Meta", "Google", "TikTok", "Snapchat", "LinkedIn", "Other"]
    const totalSpend = campaigns.reduce((sum, item) => sum + item.spend, 0)

    if (totalSpend <= 0) {
      return platforms.map((label, index) => ({
        label,
        value: index === 0 ? 1 : 0,
        color: DISTRIBUTION_COLORS[index],
      }))
    }

    return platforms.map((label, index) => {
      const weight = campaigns.reduce((sum, item) => {
        const base = hash(item.id + label + item.channel) / 100
        return sum + item.spend * Math.max(0.05, base)
      }, 0)

      return { label, value: weight, color: DISTRIBUTION_COLORS[index] }
    })
  }, [campaigns])

  const topCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 6)
  }, [campaigns])

  return {
    campaigns,
    kpis,
    distribution,
    topCampaigns,
  }
}

export function CampaignKpiGrid({
  kpis,
}: {
  kpis: ReturnType<typeof useCampaignDashboardData>["kpis"]
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon

        return (
          <article key={kpi.title} className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.trend}</p>
          </article>
        )
      })}
    </section>
  )
}

export function CampaignRevenueTrendCard({
  campaigns,
}: {
  campaigns: ReturnType<typeof useCampaignDashboardData>["campaigns"]
}) {
  const [metric, setMetric] = useState<MetricKey>("revenue")
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")
  const timeRangeConfig =
    TIME_RANGE_OPTIONS.find((option) => option.key === timeRange) ?? TIME_RANGE_OPTIONS[1]

  const performanceSeries = useMemo(() => {
    const points = timeRangeConfig.points
    const baseSpend =
      campaigns.reduce((sum, item) => sum + item.spend, 0) / Math.max(campaigns.length, 1)
    const baseRevenue =
      campaigns.reduce((sum, item) => sum + item.revenue, 0) / Math.max(campaigns.length, 1)
    const baseConversions =
      campaigns.reduce(
        (sum, item) =>
          sum +
          Math.max(
            1,
            Math.round((item.spend / Math.max(item.cpc, 0.5)) * (item.conversionRate / 100))
          ),
        0
      ) / Math.max(campaigns.length, 1)

    const labels = Array.from({ length: points }, (_, index) => {
      if (timeRange === "12m") return `M${index + 1}`
      return `P${index + 1}`
    })

    const values = Array.from({ length: points }, (_, index) => {
      const multiplier = 0.82 + ((index + 1) / points) * 0.38
      const wave = Math.sin((index + 1) * 1.22) * 0.08 + 1

      if (metric === "spend") return Math.max(1, baseSpend * multiplier * wave)
      if (metric === "revenue") return Math.max(1, baseRevenue * multiplier * (wave + 0.04))
      if (metric === "roas") return Math.max(0.2, (baseRevenue / Math.max(baseSpend, 1)) * wave)
      if (metric === "ctr")
        return Math.max(
          0.1,
          (campaigns.reduce((sum, item) => sum + item.ctr, 0) / Math.max(campaigns.length, 1)) *
            wave
        )
      if (metric === "cpc")
        return Math.max(
          0.1,
          (campaigns.reduce((sum, item) => sum + item.cpc, 0) / Math.max(campaigns.length, 1)) *
            (2 - wave)
        )

      return Math.max(1, baseConversions * multiplier * wave)
    })

    return { values, labels }
  }, [campaigns, metric, timeRange, timeRangeConfig.points])

  return (
    <AppCard
      title="Performance"
      subtitle="Track core campaign performance trends over time."
      actions={
        <div className="flex items-center gap-2">
          <AppSelect value={metric} onValueChange={(value) => setMetric(value as MetricKey)}>
            <AppSelectTrigger className="h-8 w-[150px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {PERFORMANCE_METRICS.map((item) => (
                <AppSelectItem key={item.key} value={item.key}>
                  {item.label}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <AppSelect value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
            <AppSelectTrigger className="h-8 w-[120px]">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {TIME_RANGE_OPTIONS.map((item) => (
                <AppSelectItem key={item.key} value={item.key}>
                  {item.label}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </div>
      }
    >
      <CampaignPerformanceChart
        values={performanceSeries.values}
        labels={performanceSeries.labels}
        metric={metric}
      />
    </AppCard>
  )
}

export function CampaignSpendDistributionCard({
  distribution,
}: {
  distribution: ReturnType<typeof useCampaignDashboardData>["distribution"]
}) {
  return (
    <AppCard
      title="Spend Distribution"
      subtitle="How campaign budget is distributed across platforms."
      className="h-full"
    >
      <CampaignSpendDonut distribution={distribution} />
    </AppCard>
  )
}

export function CampaignTopCampaignsCard({
  topCampaigns,
}: {
  topCampaigns: ReturnType<typeof useCampaignDashboardData>["topCampaigns"]
}) {
  const router = useRouter()

  return (
    <AppCard
      title="Top Performing Campaigns"
      subtitle="Quick view of highest-impact campaigns."
      className="h-full"
    >
      <AppTable>
        <AppTableHeader>
          <AppTableRow>
            <AppTableHead>Campaign</AppTableHead>
            <AppTableHead>Spend</AppTableHead>
            <AppTableHead>Revenue</AppTableHead>
            <AppTableHead>ROAS</AppTableHead>
            <AppTableHead>CTR</AppTableHead>
            <AppTableHead>Status</AppTableHead>
            <AppTableHead className="text-right">Quick Action</AppTableHead>
          </AppTableRow>
        </AppTableHeader>
        <AppTableBody>
          {topCampaigns.map((campaign) => (
            <AppTableRow key={campaign.id}>
              <AppTableCell>{campaign.name}</AppTableCell>
              <AppTableCell>{formatCurrency(campaign.spend)}</AppTableCell>
              <AppTableCell>{formatCurrency(campaign.revenue)}</AppTableCell>
              <AppTableCell>{campaign.roas.toFixed(2)}x</AppTableCell>
              <AppTableCell>{campaign.ctr.toFixed(2)}%</AppTableCell>
              <AppTableCell>
                <CampaignStatusBadge status={campaign.status} />
              </AppTableCell>
              <AppTableCell className="text-right">
                <AppButton
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(ROUTES.campaignsDetails(campaign.id))}
                >
                  Open
                </AppButton>
              </AppTableCell>
            </AppTableRow>
          ))}
        </AppTableBody>
      </AppTable>
    </AppCard>
  )
}

export function CampaignAiDecisionCenterCard() {
  return (
    <AppCard
      title="AI Decision Center"
      subtitle="Prioritized recommendations for the next executive action."
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-border/70 bg-background p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                Recommended Action
              </p>
              <h3 className="mt-2 text-base font-semibold tracking-tight">
                {AI_DECISION_CENTER.recommendedAction.title}
              </h3>
              <p className="mt-2 max-w-[30rem] text-sm text-muted-foreground">
                {AI_DECISION_CENTER.recommendedAction.summary}
              </p>
            </div>
            <AppBadge variant="secondary">Top Priority</AppBadge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <p className="text-xs text-muted-foreground">
                {AI_DECISION_CENTER.recommendedAction.impactLabel}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {AI_DECISION_CENTER.recommendedAction.impactValue}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className="mt-1 text-sm font-semibold">
                {AI_DECISION_CENTER.recommendedAction.confidence}
              </p>
            </div>
          </div>

          <AppButton asChild size="sm" className="mt-4">
            <Link href={ROUTES.ai}>Review Recommendation</Link>
          </AppButton>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Growth Opportunities</h3>
            <span className="text-xs text-muted-foreground">Top 3</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {AI_DECISION_CENTER.opportunities.map((opportunity) => {
              const Icon = opportunity.icon

              return (
                <div
                  key={opportunity.title}
                  className="rounded-lg border border-border/70 bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Estimated Impact</p>
                      <p className="mt-1 text-sm font-semibold tracking-tight">
                        {opportunity.value}
                      </p>
                    </div>
                    <span className="rounded-md border border-border/60 bg-card p-1.5 text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{opportunity.title}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Risks & Alerts</h3>
            <span className="text-xs text-muted-foreground">Requires attention</span>
          </div>
          <div className="space-y-2">
            {AI_DECISION_CENTER.risks.map((risk) => {
              const style = AI_RISK_STYLES[risk.severity]

              return (
                <div
                  key={risk.title}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${style.dot}`} aria-hidden="true" />
                    <p className="text-sm">{risk.title}</p>
                  </div>
                  <AppBadge variant={style.badge}>{style.label}</AppBadge>
                </div>
              )
            })}
          </div>
        </section>

        <div className="border-t border-border/60 pt-3">
          <Link
            href={ROUTES.ai}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            View All AI Recommendations
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </AppCard>
  )
}
