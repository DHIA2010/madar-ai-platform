"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  Brain,
  ChevronRight,
  CircleDollarSign,
  Megaphone,
  Package2,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppChartCard,
  AppChartPrimitiveConfig,
  AppChartPrimitiveContainer,
  AppChartPrimitiveLegend,
  AppChartPrimitiveLegendContent,
  AppChartPrimitiveTooltip,
  AppChartPrimitiveTooltipContent,
  AppContainer,
  AppError,
  AppLoading,
  AppPage,
  AppPageHeader,
  AppSection,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
  AppToolbar,
} from "@/components/app"

import { useAIIntelligence } from "../hooks"
import {
  formatCurrency,
  formatPercent,
  mapInsightToneToStatusTone,
  prioritizeInsights,
  severityLabelFromTone,
} from "../services"
import type { AIInsightItemDto } from "../types"

const roasChartConfig = {
  roas: {
    label: "ROAS",
    color: "var(--chart-4)",
  },
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies AppChartPrimitiveConfig

const budgetChartConfig = {
  spend: {
    label: "Spend",
    color: "var(--chart-3)",
  },
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies AppChartPrimitiveConfig

type ActionItem = AIInsightItemDto & {
  actionLabel: string
  href: string
}

function InsightList({ insights }: { insights: AIInsightItemDto[] }) {
  return (
    <div className="space-y-3">
      {insights.map((insight, index) => (
        <div key={insight.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {index + 1}. {insight.title}
              </p>
              <p className="text-sm text-muted-foreground">{insight.detail}</p>
            </div>
            <AppStatusBadge
              status={mapInsightToneToStatusTone(insight.tone)}
              label={severityLabelFromTone(insight.tone)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Business impact: {insight.impact}</p>
        </div>
      ))}
    </div>
  )
}

export function AIIntelligencePage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d")
  const intelligenceQuery = useAIIntelligence({ workspaceId: null, period })

  const dashboard = intelligenceQuery.data?.payload

  const budgetTotals = useMemo(() => {
    if (!dashboard) {
      return { spend: 0, revenue: 0, roas: 0 }
    }

    const spend = dashboard.budgetAnalysis.reduce((sum, row) => sum + row.spend, 0)
    const revenue = dashboard.budgetAnalysis.reduce((sum, row) => sum + row.revenue, 0)
    const roas = spend > 0 ? revenue / spend : 0

    return { spend, revenue, roas }
  }, [dashboard])

  const topChannel = useMemo(() => {
    if (!dashboard || dashboard.channelPerformance.length === 0) {
      return null
    }

    return [...dashboard.channelPerformance].sort((left, right) => right.revenue - left.revenue)[0]
  }, [dashboard])

  const highestLtvSegment = useMemo(() => {
    if (!dashboard || dashboard.customerInsights.length === 0) {
      return null
    }

    return [...dashboard.customerInsights].sort((left, right) => right.ltv - left.ltv)[0]
  }, [dashboard])

  const todayPriorities = useMemo(() => {
    if (!dashboard) {
      return []
    }

    const deduped = new Map<string, AIInsightItemDto>()

    for (const item of prioritizeInsights(
      [...dashboard.risks, ...dashboard.recommendations, ...dashboard.opportunities],
      8
    )) {
      const key = item.title.toLowerCase()
      if (!deduped.has(key)) {
        deduped.set(key, item)
      }
    }

    return [...deduped.values()].slice(0, 5).map<ActionItem>((item) => {
      const normalized = item.title.toLowerCase()

      if (normalized.includes("landing") || normalized.includes("campaign")) {
        return { ...item, actionLabel: "Review campaigns", href: ROUTES.campaigns }
      }

      if (normalized.includes("budget") || normalized.includes("channel")) {
        return { ...item, actionLabel: "Open reports", href: ROUTES.reports }
      }

      if (normalized.includes("integration") || normalized.includes("sync")) {
        return { ...item, actionLabel: "Inspect channels", href: ROUTES.channels }
      }

      return { ...item, actionLabel: "Investigate", href: ROUTES.reports }
    })
  }, [dashboard])

  const executiveBrief = useMemo(() => {
    if (!dashboard || !topChannel || !highestLtvSegment) {
      return null
    }

    const direction = dashboard.marketingHealthScore.delta >= 0 ? "improved" : "declined"

    return {
      whatChanged: `Marketing health ${direction} by ${Math.abs(dashboard.marketingHealthScore.delta)} points, with blended ROAS at ${budgetTotals.roas.toFixed(2)}x and ${topChannel.channel} leading revenue output.`,
      why: `${topChannel.channel} is carrying the portfolio at ${formatCurrency(topChannel.revenue)}, while rising CPA and conversion softness in lower-efficiency campaigns are creating drag.`,
      impact: `If left uncorrected, budget concentration and weak post-click conversion quality will compress margin even if topline revenue holds.`,
      recommendation: `Reallocate spend toward ${highestLtvSegment.acquisitionChannel} and high-retention segments, while reviewing the worst CPA campaigns before the next spend cycle.`,
    }
  }, [budgetTotals.roas, dashboard, highestLtvSegment, topChannel])

  const morningBrief = useMemo(() => {
    if (!dashboard || !topChannel) {
      return null
    }

    const urgentIssues = dashboard.anomalyDetection.filter(
      (item) => item.severity === "high" || item.severity === "medium"
    ).length
    const optimizationOpportunities = dashboard.opportunities.length
    const targetRoas = Math.max(...dashboard.channelPerformance.map((channel) => channel.roas))
    const estimatedUpside = Math.round(
      dashboard.channelPerformance.reduce((sum, channel) => {
        if (channel.roas >= targetRoas) {
          return sum
        }

        return sum + (targetRoas - channel.roas) * channel.spend * 0.35
      }, 0)
    )

    return {
      urgentIssues,
      optimizationOpportunities,
      estimatedUpside,
      readingTime: 45,
    }
  }, [dashboard, topChannel])

  const executiveHeadline = useMemo(() => {
    if (!topChannel || todayPriorities.length === 0) {
      return "Performance is broadly stable, with a few decisions needing attention today."
    }

    return `${topChannel.channel} is sustaining growth, but ${todayPriorities[0].title.toLowerCase()} needs action today.`
  }, [todayPriorities, topChannel])

  const roasContext = useMemo(() => {
    if (!dashboard || dashboard.roasAnalysis.length < 2) {
      return { label: "Stable", tone: "neutral" as const }
    }

    const first = dashboard.roasAnalysis[0]?.roas ?? 0
    const last = dashboard.roasAnalysis.at(-1)?.roas ?? 0

    if (last - first > 0.15) {
      return { label: "Improving", tone: "success" as const }
    }

    if (first - last > 0.15) {
      return { label: "Declining", tone: "warning" as const }
    }

    return { label: "Stable", tone: "neutral" as const }
  }, [dashboard])

  const budgetContext = useMemo(() => {
    if (!topChannel) {
      return {
        label: "Stable",
        tone: "neutral" as const,
        detail: "No concentration signal detected.",
      }
    }

    if (topChannel.spendShare >= 40) {
      return {
        label: "Concentrated",
        tone: "warning" as const,
        detail: `${topChannel.channel} holds ${topChannel.spendShare}% of spend.`,
      }
    }

    return {
      label: "Balanced",
      tone: "success" as const,
      detail: "No single channel dominates the budget mix.",
    }
  }, [topChannel])

  const channelInsights = useMemo<AIInsightItemDto[]>(() => {
    if (!dashboard) {
      return []
    }

    return dashboard.channelPerformance.map((channel) => ({
      id: `channel-${channel.channel}`,
      title: `${channel.channel} generated ${formatCurrency(channel.revenue)} at ${channel.roas.toFixed(2)}x ROAS`,
      detail: `${channel.channel} accounted for ${channel.spendShare}% of spend with CPA at ${formatCurrency(channel.cpa)} and CTR at ${formatPercent(channel.ctr)}.`,
      impact:
        channel.roas >= budgetTotals.roas
          ? "Channel is outperforming the portfolio average and can absorb more budget."
          : "Channel is underperforming the portfolio average and should be monitored for efficiency leakage.",
      tone: channel.roas >= budgetTotals.roas ? "success" : "warning",
    }))
  }, [budgetTotals.roas, dashboard])

  const campaignInsights = useMemo<AIInsightItemDto[]>(() => {
    if (!dashboard) {
      return []
    }

    return dashboard.campaignInsights.map((campaign) => ({
      id: campaign.campaignId,
      title: campaign.campaignName,
      detail: `${campaign.channel} is delivering ${campaign.roas.toFixed(2)}x ROAS with ${campaign.conversionRate.toFixed(1)}% conversion rate.`,
      impact:
        campaign.anomaly ??
        "Campaign performance is stable enough to benchmark against lower-performing peers.",
      tone: campaign.anomaly ? "warning" : campaign.roas >= 3 ? "success" : "info",
    }))
  }, [dashboard])

  const productInsights = useMemo<AIInsightItemDto[]>(() => {
    if (!dashboard) {
      return []
    }

    return dashboard.productInsights.map((product) => ({
      id: product.productId,
      title: product.productName,
      detail: `${formatCurrency(product.revenue)} revenue from ${product.unitsSold} units at ${formatPercent(product.margin)} margin.`,
      impact: product.insight,
      tone: product.trend === "up" ? "success" : product.trend === "down" ? "warning" : "info",
    }))
  }, [dashboard])

  const customerInsights = useMemo<AIInsightItemDto[]>(() => {
    if (!dashboard) {
      return []
    }

    return dashboard.customerInsights.map((segment) => ({
      id: segment.segment,
      title: segment.segment,
      detail: `${segment.acquisitionChannel} delivers ${formatCurrency(segment.ltv)} LTV against ${formatCurrency(segment.cac)} CAC with ${segment.repeatRate.toFixed(0)}% repeat rate.`,
      impact: segment.insight,
      tone: segment.ltv > segment.cac * 3 ? "success" : "info",
    }))
  }, [dashboard])

  if (intelligenceQuery.isLoading) {
    return (
      <AppPage>
        <AppContainer>
          <AppLoading variant="page" showChart showTable cards={4} />
        </AppContainer>
      </AppPage>
    )
  }

  if (intelligenceQuery.error) {
    return (
      <AppPage>
        <AppContainer>
          <AppError
            variant="network"
            title="AI intelligence could not be loaded"
            description={intelligenceQuery.error.message}
            onRetry={() => intelligenceQuery.refetch()}
          />
        </AppContainer>
      </AppPage>
    )
  }

  if (!dashboard) {
    return (
      <AppPage>
        <AppContainer>
          <AppError
            variant="generic"
            title="No intelligence payload"
            description="The AI module returned an empty response."
            onRetry={() => intelligenceQuery.refetch()}
          />
        </AppContainer>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: "Dashboard", href: ROUTES.dashboard },
            { label: "AI Intelligence", current: true },
          ]}
          title="AI Intelligence"
          subtitle="A concise daily marketing briefing for what changed, why, and what to do next."
          actions={
            <AppButton
              variant="outline"
              icon={<RefreshCcw className="size-4" />}
              onClick={() => intelligenceQuery.refetch()}
              loading={intelligenceQuery.isRefetching}
            >
              Refresh Analysis
            </AppButton>
          }
        />

        <AppToolbar
          leading={
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="size-4 text-primary" />
                <span>Good morning.</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Marketing Health: {dashboard.marketingHealthScore.score} / 100
              </p>
              {morningBrief ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{morningBrief.urgentIssues} urgent issues</span>
                  <span>{morningBrief.optimizationOpportunities} optimization opportunities</span>
                  <span>Estimated upside: +{formatCurrency(morningBrief.estimatedUpside)}</span>
                  <span>Reading time: {morningBrief.readingTime} seconds</span>
                </div>
              ) : null}
            </div>
          }
          trailing={
            <div className="flex items-center gap-2">
              <AppSelect
                value={period}
                onValueChange={(value) => setPeriod(value as "7d" | "30d" | "90d")}
              >
                <AppSelectTrigger className="w-[160px]">
                  <AppSelectValue placeholder="Select period" />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="7d">Last 7 days</AppSelectItem>
                  <AppSelectItem value="30d">Last 30 days</AppSelectItem>
                  <AppSelectItem value="90d">Last 90 days</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
              <AppStatusBadge
                status={dashboard.marketingHealthScore.score >= 75 ? "success" : "warning"}
                label={`Health ${dashboard.marketingHealthScore.score}/100`}
              />
            </div>
          }
        />

        <AppSection>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <AppCard
              title="Marketing Health"
              subtitle={dashboard.marketingHealthScore.label}
              icon={<Brain className="size-4" />}
            >
              <p className="text-3xl font-semibold">{dashboard.marketingHealthScore.score}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {dashboard.marketingHealthScore.delta >= 0 ? "+" : ""}
                {dashboard.marketingHealthScore.delta} vs last period
              </p>
            </AppCard>
            <AppCard
              title="Revenue"
              subtitle="Attributed revenue"
              icon={<CircleDollarSign className="size-4" />}
            >
              <p className="text-2xl font-semibold">{formatCurrency(budgetTotals.revenue)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Across all measured channels</p>
            </AppCard>
            <AppCard
              title="ROAS"
              subtitle="Portfolio efficiency"
              icon={<ArrowUpRight className="size-4" />}
            >
              <p className="text-2xl font-semibold">{budgetTotals.roas.toFixed(2)}x</p>
              <p className="mt-2 text-sm text-muted-foreground">Blended return on ad spend</p>
            </AppCard>
            <AppCard title="Spend" subtitle="Paid media" icon={<TrendingUp className="size-4" />}>
              <p className="text-2xl font-semibold">{formatCurrency(budgetTotals.spend)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Total paid spend this period</p>
            </AppCard>
            <AppCard
              title="Open Alerts"
              subtitle="Urgent signals"
              icon={<ShieldAlert className="size-4" />}
            >
              <p className="text-2xl font-semibold">{dashboard.anomalyDetection.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Open anomalies requiring follow-up
              </p>
            </AppCard>
          </div>
        </AppSection>

        <AppSection>
          <AppCard
            className="border-primary/15 bg-gradient-to-br from-card to-primary/5"
            title="AI Executive Summary"
            subtitle="The fastest path from signal to decision"
            contentClassName="space-y-5"
          >
            <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-lg font-semibold tracking-tight text-foreground">
                    {executiveHeadline}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {dashboard.executiveSummary}
                  </p>
                </div>
                {executiveBrief ? (
                  <>
                    <div className="rounded-lg border bg-background/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Recommendation
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {executiveBrief.recommendation}
                      </p>
                    </div>
                    <details className="rounded-lg border bg-background/40 p-4">
                      <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                        Show supporting analysis
                      </summary>
                      <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide">
                            What changed
                          </p>
                          <p className="mt-1">{executiveBrief.whatChanged}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide">
                            Why it changed
                          </p>
                          <p className="mt-1">{executiveBrief.why}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide">
                            Business impact
                          </p>
                          <p className="mt-1">{executiveBrief.impact}</p>
                        </div>
                      </div>
                    </details>
                  </>
                ) : null}
              </div>

              <div className="space-y-3 rounded-lg border bg-background/70 p-4">
                <p className="text-sm font-medium">Where to investigate further</p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Top revenue driver: {topChannel?.channel ?? "Unknown"}</p>
                  <p>Highest-LTV segment: {highestLtvSegment?.segment ?? "Unknown"}</p>
                  <p>
                    Largest current issue:{" "}
                    {todayPriorities[0]?.title ?? "No critical issues detected"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <AppButton asChild icon={<ChevronRight className="size-4" />} iconPosition="end">
                    <Link href={ROUTES.reports}>Open reports</Link>
                  </AppButton>
                  <AppButton
                    asChild
                    variant="outline"
                    icon={<ChevronRight className="size-4" />}
                    iconPosition="end"
                  >
                    <Link href={ROUTES.campaigns}>Inspect campaigns</Link>
                  </AppButton>
                </div>
              </div>
            </div>
          </AppCard>
        </AppSection>

        <AppSection>
          <AppCard title="Today's Actions" subtitle="The highest-priority actions to execute today">
            <div className="space-y-3">
              {todayPriorities.map((item, index) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          P{index + 1}
                        </span>
                        <AppStatusBadge
                          status={mapInsightToneToStatusTone(item.tone)}
                          label={severityLabelFromTone(item.tone)}
                        />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.impact}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <AppButton asChild className="lg:min-w-40">
                      <Link href={item.href}>{item.actionLabel}</Link>
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          </AppCard>
        </AppSection>

        <AppSection>
          <AppCard title="Insights" subtitle="Explore the most relevant findings by business area">
            <AppTabs defaultValue="campaigns" className="gap-4">
              <AppTabsList variant="line">
                <AppTabsTrigger value="campaigns">
                  <Megaphone className="size-4" />
                  {`Campaigns (${campaignInsights.length})`}
                </AppTabsTrigger>
                <AppTabsTrigger value="products">
                  <Package2 className="size-4" />
                  {`Products (${productInsights.length})`}
                </AppTabsTrigger>
                <AppTabsTrigger value="customers">
                  <Users className="size-4" />
                  {`Customers (${customerInsights.length})`}
                </AppTabsTrigger>
                <AppTabsTrigger value="channels">
                  <TrendingUp className="size-4" />
                  {`Channels (${channelInsights.length})`}
                </AppTabsTrigger>
              </AppTabsList>

              <AppTabsContent value="campaigns">
                <InsightList insights={campaignInsights} />
              </AppTabsContent>
              <AppTabsContent value="products">
                <InsightList insights={productInsights} />
              </AppTabsContent>
              <AppTabsContent value="customers">
                <InsightList insights={customerInsights} />
              </AppTabsContent>
              <AppTabsContent value="channels">
                <InsightList insights={channelInsights} />
              </AppTabsContent>
            </AppTabs>
          </AppCard>
        </AppSection>

        <AppSection>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <AppChartCard title="ROAS Trend" subtitle="Daily efficiency trend">
              <div className="mb-4 flex items-center gap-2 text-sm">
                <AppStatusBadge status={roasContext.tone} label={roasContext.label} />
                <span className="text-muted-foreground">vs the start of the selected period</span>
              </div>
              <AppChartPrimitiveContainer className="h-[280px] w-full" config={roasChartConfig}>
                <LineChart
                  accessibilityLayer
                  data={dashboard.roasAnalysis}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={20}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={38}
                    tickFormatter={(value) => `${Number(value).toFixed(1)}x`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={56}
                    tickFormatter={(value) => formatCurrency(Number(value))}
                  />
                  <AppChartPrimitiveTooltip
                    content={<AppChartPrimitiveTooltipContent indicator="line" />}
                  />
                  <AppChartPrimitiveLegend content={<AppChartPrimitiveLegendContent />} />
                  <Line
                    yAxisId="left"
                    dataKey="roas"
                    stroke="var(--color-roas)"
                    strokeWidth={3}
                    type="monotone"
                    dot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                    activeDot={{ r: 6, strokeWidth: 0, fill: "var(--color-roas)" }}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    strokeWidth={3}
                    type="monotone"
                    dot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                    activeDot={{ r: 6, strokeWidth: 0, fill: "var(--color-revenue)" }}
                  />
                </LineChart>
              </AppChartPrimitiveContainer>
            </AppChartCard>

            <AppChartCard
              title="Budget Allocation"
              subtitle="Spend and return by channel"
              empty={!dashboard.budgetAnalysis.length}
              emptyProps={{
                variant: "no-data",
                title: "No budget chart data",
                description: "There is no spend or revenue data for the selected period yet.",
              }}
            >
              <div className="mb-4 flex items-center gap-2 text-sm">
                <AppStatusBadge status={budgetContext.tone} label={budgetContext.label} />
                <span className="text-muted-foreground">{budgetContext.detail}</span>
              </div>
              <AppChartPrimitiveContainer className="h-[280px] w-full" config={budgetChartConfig}>
                <BarChart
                  accessibilityLayer
                  data={dashboard.budgetAnalysis}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="channel"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={18}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={56}
                    tickFormatter={(value) => formatCurrency(Number(value))}
                  />
                  <AppChartPrimitiveTooltip content={<AppChartPrimitiveTooltipContent />} />
                  <AppChartPrimitiveLegend content={<AppChartPrimitiveLegendContent />} />
                  <Bar dataKey="spend" fill="var(--color-spend)" radius={6} fillOpacity={0.95} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={6} fillOpacity={0.9} />
                </BarChart>
              </AppChartPrimitiveContainer>
            </AppChartCard>
            <AppCard title="Channel Performance" subtitle="Where to investigate further">
              <div className="mb-4 flex items-center gap-2 text-sm">
                <AppStatusBadge
                  status={
                    topChannel?.roas && topChannel.roas >= budgetTotals.roas ? "success" : "warning"
                  }
                  label={
                    topChannel?.channel ? `Best channel: ${topChannel.channel}` : "Review channels"
                  }
                />
                <span className="text-muted-foreground">
                  Use this table to move from summary to root-cause review.
                </span>
              </div>
              <AppTable>
                <AppTableHeader>
                  <AppTableRow>
                    <AppTableHead>Channel</AppTableHead>
                    <AppTableHead>ROAS</AppTableHead>
                    <AppTableHead>Revenue</AppTableHead>
                    <AppTableHead>CPA</AppTableHead>
                    <AppTableHead>Spend Share</AppTableHead>
                  </AppTableRow>
                </AppTableHeader>
                <AppTableBody>
                  {dashboard.channelPerformance.map((row) => (
                    <AppTableRow key={row.channel}>
                      <AppTableCell className="font-medium">{row.channel}</AppTableCell>
                      <AppTableCell>{row.roas.toFixed(2)}x</AppTableCell>
                      <AppTableCell>{formatCurrency(row.revenue)}</AppTableCell>
                      <AppTableCell>{formatCurrency(row.cpa)}</AppTableCell>
                      <AppTableCell>{row.spendShare}%</AppTableCell>
                    </AppTableRow>
                  ))}
                </AppTableBody>
              </AppTable>
            </AppCard>
          </div>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}
