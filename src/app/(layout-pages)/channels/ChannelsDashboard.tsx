"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Download,
  Eye,
  Layers,
  MoreHorizontal,
  MousePointerClick,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton, AppCard } from "@/components/app"
import { PLATFORM_ICON, PlatformBadge } from "@/components/platform-badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

// --- Mock data (first-pass theme build; will be wired to real channel data next) ---

const kpis = [
  {
    label: "الفنوات النشطة",
    value: "4",
    unit: "",
    footnote: "من أصل 5 قنوات",
    icon: Layers,
    tone: "indigo" as const,
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
    label: "إجمالي التحويلات",
    value: "3,421",
    unit: "",
    delta: "+16.3%",
    trend: "up" as const,
    icon: Users,
    tone: "orange" as const,
  },
  {
    label: "عائد الإنفاق الإعلاني",
    value: "4.94",
    unit: "",
    delta: "+12.4%",
    trend: "up" as const,
    icon: Target,
    tone: "violet" as const,
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
    label: "إجمالي الإنفاق",
    value: "85,000",
    unit: "SAR",
    delta: "+18.6%",
    trend: "up" as const,
    icon: Wallet,
    tone: "blue" as const,
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

const channels = [
  {
    name: "Google Ads",
    roas: 5.0,
    revenue: "210,000 SAR",
    spend: "42,000 SAR",
    conversions: "1,821",
    campaigns: "18",
    health: "ممتاز",
    healthTone: "text-emerald-600",
    lastSync: "قبل دقيقتين",
    sparkline: [30, 34, 32, 38, 42, 40, 45, 48, 46, 52],
  },
  {
    name: "Snapchat",
    roas: 3.29,
    revenue: "78,400 SAR",
    spend: "23,800 SAR",
    conversions: "642",
    campaigns: "12",
    health: "جيد",
    healthTone: "text-amber-600",
    lastSync: "5 دقائق",
    sparkline: [22, 24, 21, 25, 23, 26, 24, 27, 25, 26],
  },
  {
    name: "Meta Ads",
    roas: 5.82,
    revenue: "92,600 SAR",
    spend: "15,900 SAR",
    conversions: "738",
    campaigns: "9",
    health: "ممتاز",
    healthTone: "text-emerald-600",
    lastSync: "3 دقائق",
    sparkline: [18, 20, 22, 21, 24, 26, 25, 28, 27, 30],
  },
  {
    name: "TikTok Ads",
    roas: 4.52,
    revenue: "14,900 SAR",
    spend: "3,300 SAR",
    conversions: "220",
    campaigns: "6",
    health: "جيد",
    healthTone: "text-amber-600",
    lastSync: "10 دقائق",
    sparkline: [10, 12, 9, 13, 11, 14, 12, 15, 13, 14],
  },
]

const channelComparison = [...channels]
  .sort((a, b) => b.roas - a.roas)
  .map((channel) => ({ name: channel.name, roas: channel.roas }))

const comparisonChartConfig = {
  roas: { label: "ROAS", color: "var(--chart-1)" },
} satisfies ChartConfig

const channelBreakdown = [
  { channel: "googleAds", label: "Google Ads", value: 36550, share: 43, color: "#2563eb" },
  { channel: "snapchat", label: "Snapchat", value: 23800, share: 28, color: "#f59e0b" },
  { channel: "meta", label: "Meta", value: 16150, share: 19, color: "#111c44" },
  { channel: "tiktok", label: "TikTok Ads", value: 8500, share: 10, color: "#94a3b8" },
]

const channelChartConfig = {
  value: { label: "الإنفاق" },
  googleAds: { label: "Google Ads", color: "#2563eb" },
  snapchat: { label: "Snapchat", color: "#f59e0b" },
  meta: { label: "Meta", color: "#111c44" },
  tiktok: { label: "TikTok Ads", color: "#94a3b8" },
} satisfies ChartConfig

const totalChannelSpend = channelBreakdown.reduce((sum, item) => sum + item.value, 0)

const performanceTrend = [
  { date: "18 مايو", googleAds: 28000, snapchat: 12000, meta: 9000, tiktok: 2000 },
  { date: "25 مايو", googleAds: 31000, snapchat: 13500, meta: 11000, tiktok: 2400 },
  { date: "1 يونيو", googleAds: 34500, snapchat: 12800, meta: 12500, tiktok: 2800 },
  { date: "8 يونيو", googleAds: 37000, snapchat: 14200, meta: 13800, tiktok: 3100 },
  { date: "15 يونيو", googleAds: 42000, snapchat: 15600, meta: 15200, tiktok: 3400 },
]

const trendChartConfig = {
  googleAds: { label: "Google Ads", color: "#2563eb" },
  snapchat: { label: "Snapchat", color: "#f59e0b" },
  meta: { label: "Meta", color: "#111c44" },
  tiktok: { label: "TikTok Ads", color: "#111827" },
} satisfies ChartConfig

const alerts = [
  { platform: "TikTok Ads", message: "لم يتم المزامنة منذ 10 دقائق", tone: "bg-rose-500" },
  { platform: "Snapchat", message: "الإنفاق أعلى من المتوسط بنسبة 32%", tone: "bg-amber-500" },
  { platform: "Google Ads", message: "جميع المؤشرات ضمن النطاق المثالي", tone: "bg-emerald-500" },
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
      {kpi.footnote ? (
        <p className="mt-2 text-xs text-muted-foreground">{kpi.footnote}</p>
      ) : (
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
      )}
    </AppCard>
  )
}

function ChannelCard({ channel }: { channel: (typeof channels)[number] }) {
  const entry = PLATFORM_ICON[channel.name]

  return (
    <AppCard className="rounded-2xl border-border/60 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PlatformBadge platform={channel.name} className="size-9" iconClassName="size-[18px]" />
          <span className="font-semibold text-foreground">{channel.name}</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          متصل
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">ROAS</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{channel.roas.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الإيرادات</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{channel.revenue}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الإنفاق</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{channel.spend}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted-foreground">التحويلات</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{channel.conversions}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الحملات</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{channel.campaigns}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الصحة</p>
          <p
            className={cn(
              "mt-1 flex items-center justify-center gap-1 text-sm font-semibold",
              channel.healthTone
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {channel.health}
          </p>
        </div>
      </div>

      <div className="mt-3 h-12 w-full">
        <svg viewBox="0 0 100 30" className="h-full w-full" preserveAspectRatio="none">
          <polyline
            points={channel.sparkline
              .map((value, index) => {
                const max = Math.max(...channel.sparkline)
                const min = Math.min(...channel.sparkline)
                const range = Math.max(max - min, 1)
                const x = (index / (channel.sparkline.length - 1)) * 100
                const y = 28 - ((value - min) / range) * 26
                return `${x},${y}`
              })
              .join(" ")}
            fill="none"
            stroke={entry?.hex ?? "#94a3b8"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-3">
        <p className="text-xs text-muted-foreground">آخر مزامنة: قبل {channel.lastSync}</p>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button type="button" className="rounded-md p-1 hover:bg-muted" aria-label="More">
            <MoreHorizontal className="size-4" />
          </button>
          <button type="button" className="rounded-md p-1 hover:bg-muted" aria-label="Chart">
            <TrendingUp className="size-4" />
          </button>
          <button type="button" className="rounded-md p-1 hover:bg-muted" aria-label="View">
            <Eye className="size-4" />
          </button>
        </div>
      </div>
    </AppCard>
  )
}

export default function ChannelsDashboard() {
  const bestChannel = [...channels].sort((a, b) => b.roas - a.roas)[0]
  const attentionChannel = channels.find((channel) => channel.health === "جيد" && channel.roas < 4)

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">القنوات</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على أداء قنواتك التسويقية</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppButton variant="outline" size="sm" icon={<CalendarDays className="size-4" />}>
            آخر 30 يوماً
          </AppButton>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            آخر تحديث: قبل دقيقتين
          </div>
          <AppButton size="sm" icon={<Download className="size-4" />}>
            تصدير التقرير
          </AppButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {channels.map((channel) => (
          <ChannelCard key={channel.name} channel={channel} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <AppCard title="مقارنة القنوات" className="rounded-2xl border-border/60 shadow-sm">
          <ChartContainer config={comparisonChartConfig} className="h-64 w-full" dir="ltr">
            <BarChart data={channelComparison} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                dataKey="name"
                type="category"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={80}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="roas" radius={[0, 6, 6, 0]}>
                {channelComparison.map((entry) => (
                  <Cell key={entry.name} fill={PLATFORM_ICON[entry.name]?.hex ?? "#2563eb"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </AppCard>

        <AppCard title="توزيع الإنفاق" className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex flex-col items-center gap-4">
            <ChartContainer
              config={channelChartConfig}
              className="mx-auto aspect-square h-40 w-full"
              dir="ltr"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={channelBreakdown}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={45}
                  outerRadius={68}
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
                            y={(viewBox.cy ?? 0) - 6}
                            className="fill-foreground text-lg font-bold"
                          >
                            {totalChannelSpend.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 14}
                            className="fill-muted-foreground text-[10px]"
                          >
                            SAR
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="w-full space-y-1.5">
              {channelBreakdown.map((item) => (
                <div key={item.channel} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-foreground">{item.label}</span>
                  </div>
                  <span className="font-medium text-muted-foreground">{item.share}%</span>
                </div>
              ))}
            </div>
          </div>
        </AppCard>

        <AppCard title="اتجاه الأداء" className="rounded-2xl border-border/60 shadow-sm">
          <ChartContainer config={trendChartConfig} className="h-64 w-full" dir="ltr">
            <LineChart data={performanceTrend} margin={{ left: 4, right: 4 }}>
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
              <Line
                dataKey="googleAds"
                type="monotone"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="snapchat"
                type="monotone"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
              <Line dataKey="meta" type="monotone" stroke="#111c44" strokeWidth={2} dot={false} />
              <Line dataKey="tiktok" type="monotone" stroke="#111827" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {Object.entries(trendChartConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                {config.label}
              </div>
            ))}
          </div>
        </AppCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <AppCard title="أفضل قناة أداء" className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex items-center gap-2.5">
            <PlatformBadge platform={bestChannel.name} className="size-9" />
            <span className="font-semibold text-foreground">{bestChannel.name}</span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">ROAS</p>
              <p className="text-xl font-bold text-foreground">{bestChannel.roas.toFixed(2)}</p>
            </div>
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
              <ArrowUpRight className="size-3.5" />
              +18.6%
            </span>
          </div>
        </AppCard>

        <AppCard title="تحتاج إلى انتباه" className="rounded-2xl border-border/60 shadow-sm">
          {attentionChannel ? (
            <>
              <div className="flex items-center gap-2.5">
                <PlatformBadge platform={attentionChannel.name} className="size-9" />
                <span className="font-semibold text-foreground">{attentionChannel.name}</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">CPA مرتفع</p>
              <div className="mt-1 flex items-end justify-between">
                <p className="text-xl font-bold text-foreground">61 SAR</p>
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600">
                  <ArrowUpRight className="size-3.5" />
                  +32% عن المتوسط
                </span>
              </div>
            </>
          ) : null}
        </AppCard>

        <AppCard title="رؤية ذكية من مدار" className="rounded-2xl border-border/60 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
              <Sparkles className="size-4" />
            </span>
            <p className="text-xs leading-6 text-muted-foreground">
              بإمكانك تحقيق أفضل عائد على الإنفاق الإعلاني بنسبة 5.82 من خلال إعادة توزيع 13% من
              ميزانية Snapchat على Meta. ننصح بتقليل الإنفاق على Snapchat بنسبة 15%.
            </p>
          </div>
          <AppButton variant="outline" size="sm" className="mt-3 w-full">
            عرض التحليل الكامل
          </AppButton>
        </AppCard>

        <AppCard
          title="تنبيهات"
          icon={<Bell className="size-4 text-muted-foreground" />}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.platform} className="flex items-start gap-2">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", alert.tone)} />
                <div>
                  <p className="text-xs font-medium text-foreground">{alert.platform}</p>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
          <AppButton variant="link" size="sm" className="mt-2 h-auto p-0 text-xs">
            عرض جميع التنبيهات
          </AppButton>
        </AppCard>
      </div>
    </div>
  )
}
