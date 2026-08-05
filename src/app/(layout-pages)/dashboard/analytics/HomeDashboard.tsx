"use client"

import Link from "next/link"
import { Area, AreaChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  CreditCard,
  Megaphone,
  MousePointerClick,
  Percent,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard } from "@/components/app"
import { PlatformBadge } from "@/components/platform-badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

// --- Mock data (first-pass theme build; will be wired to real dashboard data next) ---

const kpis = [
  {
    label: "إجمالي الإنفاق",
    value: "85,000",
    unit: "SAR",
    delta: "+18.6%",
    trend: "up" as const,
    icon: Wallet,
    tone: "blue" as const,
  },
  {
    label: "إجمالي الإيرادات",
    value: "420,000",
    unit: "SAR",
    delta: "+24.7%",
    trend: "up" as const,
    icon: TrendingUp,
    tone: "green" as const,
  },
  {
    label: "ROAS",
    value: "4.94",
    unit: "",
    delta: "+12.4%",
    trend: "up" as const,
    icon: Target,
    tone: "violet" as const,
  },
  {
    label: "إجمالي التحويلات",
    value: "3,421",
    unit: "",
    delta: "+16.3%",
    trend: "up" as const,
    icon: Users,
    tone: "orange" as const,
  },
  {
    label: "متوسط CPA",
    value: "24",
    unit: "SAR",
    delta: "-8.7%",
    trend: "down" as const,
    icon: MousePointerClick,
    tone: "rose" as const,
  },
  {
    label: "معدل التحويل",
    value: "3.2",
    unit: "%",
    delta: "+6.1%",
    trend: "up" as const,
    icon: Percent,
    tone: "indigo" as const,
  },
]

const KPI_TONE_CLASSNAMES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
  rose: "bg-rose-50 text-rose-600",
  indigo: "bg-indigo-50 text-indigo-600",
}

const performanceTrend = [
  { date: "30 مايو", revenue: 58000, spend: 22000, conversions: 1800 },
  { date: "3 يونيو", revenue: 61000, spend: 24500, conversions: 1950 },
  { date: "7 يونيو", revenue: 55000, spend: 21000, conversions: 1700 },
  { date: "11 يونيو", revenue: 67000, spend: 26000, conversions: 2100 },
  { date: "15 يونيو", revenue: 72000, spend: 27500, conversions: 2300 },
  { date: "19 يونيو", revenue: 69000, spend: 25000, conversions: 2200 },
  { date: "23 يونيو", revenue: 75000, spend: 28500, conversions: 2450 },
  { date: "27 يونيو", revenue: 71000, spend: 27000, conversions: 2350 },
  { date: "30 يونيو", revenue: 74000, spend: 28000, conversions: 2400 },
]

const performanceChartConfig = {
  revenue: { label: "الإيرادات", color: "var(--chart-1)" },
  spend: { label: "الإنفاق", color: "var(--chart-2)" },
  conversions: { label: "التحويلات", color: "var(--chart-3)" },
} satisfies ChartConfig

const channelBreakdown = [
  { channel: "googleAds", label: "Google Ads", value: 36550, share: 43, color: "#2563eb" },
  { channel: "snapchat", label: "Snapchat", value: 23800, share: 28, color: "#f59e0b" },
  { channel: "meta", label: "Meta Ads", value: 16150, share: 19, color: "#111c44" },
  { channel: "tiktok", label: "TikTok Ads", value: 8500, share: 10, color: "#94a3b8" },
]

const channelChartConfig = {
  value: { label: "الإنفاق" },
  googleAds: { label: "Google Ads", color: "#2563eb" },
  snapchat: { label: "Snapchat", color: "#f59e0b" },
  meta: { label: "Meta Ads", color: "#111c44" },
  tiktok: { label: "TikTok Ads", color: "#94a3b8" },
} satisfies ChartConfig

const totalChannelSpend = channelBreakdown.reduce((sum, item) => sum + item.value, 0)

const topCampaigns = [
  {
    name: "حملة الصيف",
    platform: "Google Ads",
    revenue: "12,500 SAR",
    spend: "77,600 SAR",
    roas: 6.21,
  },
  {
    name: "عرض السبت",
    platform: "Snapchat",
    revenue: "8,900 SAR",
    spend: "37,202 SAR",
    roas: 4.18,
  },
  {
    name: "إعادة استهداف الزوار",
    platform: "Meta Ads",
    revenue: "6,300 SAR",
    spend: "20,558 SAR",
    roas: 3.26,
  },
  {
    name: "مهرجان العروض",
    platform: "TikTok Ads",
    revenue: "4,200 SAR",
    spend: "8,862 SAR",
    roas: 2.11,
  },
]

const countryBreakdown = [
  { country: "المملكة العربية السعودية", orders: 1421 },
  { country: "الإمارات العربية المتحدة", orders: 842 },
  { country: "الكويت", orders: 312 },
  { country: "مصر", orders: 198 },
  { country: "الأردن", orders: 136 },
]

const maxCountryOrders = Math.max(...countryBreakdown.map((item) => item.orders))

const aiRecommendations = [
  {
    icon: Award,
    tone: "bg-amber-50 text-amber-600",
    title: "ROAS تحقق أفضل",
    description: "بمعدل 5.8 وهو أعلى من متوسط الحساب",
    cta: "عرض التحليل",
  },
  {
    icon: Sparkles,
    tone: "bg-blue-50 text-blue-600",
    title: "فرصة لخفض الإنفاق في Snapchat",
    description: "يمكنك خفض 15% من إنفاقك وتحقيق نفس النتائج",
    cta: "عرض التفاصيل",
  },
  {
    icon: TrendingUp,
    tone: "bg-emerald-50 text-emerald-600",
    title: "اتجاه إيجابي في التحويلات",
    description: "التحويلات ارتفعت 16.3% هذا الأسبوع",
    cta: "عرض التقرير",
  },
]

const quickActions = [
  { label: "إنشاء حملة جديدة", icon: Megaphone, href: ROUTES.campaignsCreate },
  { label: "تقرير مخصص", icon: CreditCard, href: ROUTES.reports },
  { label: "مزامنة جميع القنوات", icon: RefreshCw, href: ROUTES.integrations },
  { label: "إضافة قناة جديدة", icon: Plus, href: ROUTES.integrationsNew },
]

const integrationStatus = [
  { name: "Google Ads", lastSync: "قبل دقيقتين" },
  { name: "Snapchat Ads", lastSync: "قبل 5 دقائق" },
  { name: "Meta Ads", lastSync: "قبل مزامنة: قبل دقيقتين" },
  { name: "TikTok Ads", lastSync: "قبل مزامنة: قبل 12 ساعة" },
]

function KpiCard({ kpi }: { kpi: (typeof kpis)[number] }) {
  const Icon = kpi.icon
  const TrendIcon = kpi.trend === "up" ? ArrowUpRight : ArrowDownRight

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-xl",
            KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">
        {kpi.value}
        {kpi.unit ? (
          <span className="ms-1 text-sm font-medium text-muted-foreground">{kpi.unit}</span>
        ) : null}
      </p>
      <div className="mt-2 flex items-center gap-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-medium",
            kpi.trend === "up" ? "text-emerald-600" : "text-rose-600"
          )}
        >
          <TrendIcon className="size-3.5" />
          {kpi.delta}
        </span>
        <span className="text-muted-foreground">عن الفترة السابقة</span>
      </div>
    </AppCard>
  )
}

export default function HomeDashboard() {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الرئيسية</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على أداء متجرك التسويقي</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500" />
          آخر تحديث: قبل دقيقتين
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[7fr_3fr]">
        <AppCard title="الأداء العام" className="rounded-2xl border-border/60 shadow-sm">
          <ChartContainer config={performanceChartConfig} className="h-72 w-full" dir="ltr">
            <AreaChart data={performanceTrend} margin={{ left: 4, right: 4 }}>
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} width={50} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area
                dataKey="revenue"
                type="monotone"
                stroke="var(--chart-1)"
                fill="url(#fillRevenue)"
                strokeWidth={2}
              />
              <Area
                dataKey="spend"
                type="monotone"
                stroke="var(--chart-2)"
                fill="none"
                strokeWidth={2}
              />
              <Area
                dataKey="conversions"
                type="monotone"
                stroke="var(--chart-3)"
                fill="none"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </AppCard>

        <AppCard title="الأداء حسب القناة" className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <ChartContainer
              config={channelChartConfig}
              className="mx-auto aspect-square h-48 w-full"
              dir="ltr"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={channelBreakdown}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={80}
                  strokeWidth={3}
                >
                  {channelBreakdown.map((entry) => (
                    <Cell key={entry.channel} fill={entry.color} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox)) {
                        return null
                      }
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) - 8}
                            className="fill-foreground text-xl font-bold"
                          >
                            {totalChannelSpend.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 14}
                            className="fill-muted-foreground text-xs"
                          >
                            SAR إجمالي الإنفاق
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="w-full space-y-2">
              {channelBreakdown.map((item) => (
                <div key={item.channel} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-foreground">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{item.value.toLocaleString()} SAR</span>
                    <span className="font-medium text-foreground">{item.share}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <AppCard title="أفضل الحملات أداءً" className="rounded-2xl border-border/60 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-muted-foreground">
                  <th className="pb-3 text-start font-medium">الحملة</th>
                  <th className="pb-3 text-start font-medium">الإيرادات</th>
                  <th className="pb-3 text-start font-medium">الإنفاق</th>
                  <th className="pb-3 text-start font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {topCampaigns.map((campaign) => {
                  const progress = Math.min(100, (campaign.roas / 7) * 100)

                  return (
                    <tr key={campaign.name}>
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <PlatformBadge platform={campaign.platform} className="size-8" />
                          <span className="font-medium text-foreground">{campaign.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-foreground">{campaign.revenue}</td>
                      <td className="py-3 text-muted-foreground">{campaign.spend}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-10 font-medium text-foreground">
                            {campaign.roas.toFixed(2)}x
                          </span>
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-emerald-500"
                              style={{ width: `${progress}%` }}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </AppCard>

        <AppCard title="الطلبات حسب الدولة" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-3">
            {countryBreakdown.map((item) => (
              <div key={item.country} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{item.country}</span>
                  <span className="font-medium text-muted-foreground">
                    {item.orders.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500/70"
                    style={{ width: `${(item.orders / maxCountryOrders) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      </div>

      <AppCard className="rounded-2xl border-border/60 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">الذكي مدار</p>
              <p className="text-sm text-muted-foreground">تحليلات وتوصيات مخصصة لمتجرك</p>
            </div>
          </div>
          <AppButton variant="ghost" size="sm">
            عرض جميع التوصيات
          </AppButton>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {aiRecommendations.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className="rounded-xl border border-border/60 bg-background/60 p-4"
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn("flex size-9 items-center justify-center rounded-lg", item.tone)}
                  >
                    <Icon className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                <AppButton variant="link" size="sm" className="mt-2 h-auto p-0 text-xs">
                  {item.cta}
                </AppButton>
              </div>
            )
          })}
        </div>
      </AppCard>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <AppCard title="إجراءات سريعة" className="rounded-2xl border-border/60 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-4 text-center transition-colors hover:bg-muted/60"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs font-medium text-foreground">{action.label}</span>
                </Link>
              )
            })}
          </div>
        </AppCard>

        <AppCard title="حالة التكاملات" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-3">
            {integrationStatus.map((item) => {
              return (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <PlatformBadge platform={item.name} className="size-8" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.lastSync}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                    متصل
                  </span>
                </div>
              )
            })}
          </div>
        </AppCard>
      </div>
    </div>
  )
}
