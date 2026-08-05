"use client"

import { useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Calendar as CalendarIcon,
  FileText,
  Gauge,
  Info,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

import {
  AppCard,
  AppButton,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { PlatformBadge } from "@/components/platform-badge"

// --- Mock data (first-pass theme build; will be wired to real AI data next) ---

type RecommendationCategory = "growth" | "optimization" | "alert"

interface Recommendation {
  id: string
  platform: string
  platformLabel: string
  category: RecommendationCategory
  title: string
  description: string
  impactValue: number
  impactMetric: string
}

const CATEGORY_META: Record<RecommendationCategory, { label: string; className: string }> = {
  growth: { label: "فرصة نمو", className: "bg-emerald-50 text-emerald-600" },
  optimization: { label: "تحسين الأداء", className: "bg-blue-50 text-blue-600" },
  alert: { label: "تنبيه", className: "bg-rose-50 text-rose-600" },
}

const recommendations: Recommendation[] = [
  {
    id: "1",
    platform: "Google Ads",
    platformLabel: "Google Ads",
    category: "growth",
    title: "زيادة الميزانية للحملات ذات الأداء العالي",
    description:
      "حملات البحث تحقق 5.8x ROAS مرتفع. نقترح زيادة الميزانية بنسبة 15% للحصول على نتائج أفضل.",
    impactValue: 24.5,
    impactMetric: "ROAS",
  },
  {
    id: "2",
    platform: "Snapchat",
    platformLabel: "Snapchat Ads",
    category: "optimization",
    title: "تحسين استهداف الجمهور",
    description: "معدل التحويل منخفض بنسبة 28% عن المتوسط. تحسين الاستهداف قد يخفض التكلفة.",
    impactValue: -18.3,
    impactMetric: "CPA",
  },
  {
    id: "3",
    platform: "Meta Ads",
    platformLabel: "Meta Ads",
    category: "growth",
    title: "فرصة لزيادة التحويلات",
    description:
      "معدل النقر الفعال مرتفع 2.4x لكن التحويلات منخفضة. تحسين صفحة الهبوط قد يزيد التحويلات.",
    impactValue: 31.2,
    impactMetric: "التحويلات",
  },
  {
    id: "4",
    platform: "TikTok Ads",
    platformLabel: "TikTok Ads",
    category: "alert",
    title: "تكلفة التحويل مرتفعة",
    description:
      "ارتفع CPA بنسبة 32% خلال 7 أيام الأخيرة. ننصح بمراجعة الإعلانات أو تقليل الميزانية المؤقتة.",
    impactValue: -32.0,
    impactMetric: "CPA",
  },
]

const suggestedQuestions: Array<{ label: string; icon: LucideIcon }> = [
  { label: "ما هي القناة التي تحقق أفضل عائد على الاستثمار؟", icon: BarChart3 },
  { label: "أين يجب أن أزيد الميزانية للحصول على نتائج أفضل؟", icon: Target },
  { label: "ما الحملات التي تحتاج إلى تحسين أو إيقاف؟", icon: AlertCircle },
  { label: "أعطني ملخص لأداء العام لحملاتي", icon: FileText },
]

const TABS: Array<{ key: "all" | RecommendationCategory; label: string; icon?: LucideIcon }> = [
  { key: "all", label: "الكل" },
  { key: "growth", label: "فرص النمو", icon: TrendingUp },
  { key: "optimization", label: "تحسين الأداء", icon: Gauge },
  { key: "alert", label: "تنبيهات", icon: AlertTriangle },
]

function RecommendationCard({ item }: { item: Recommendation }) {
  const category = CATEGORY_META[item.category]
  const isPositive = item.impactValue >= 0

  return (
    <div className="rounded-2xl border border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PlatformBadge platform={item.platform} className="size-9" />
          <span className="text-sm font-medium text-foreground">{item.platformLabel}</span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            category.className
          )}
        >
          {category.label}
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold text-foreground">{item.title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div>
          <p className="text-xs text-muted-foreground">التأثير المتوقع</p>
          <p className={cn("text-lg font-bold", isPositive ? "text-emerald-600" : "text-rose-600")}>
            {isPositive ? "+" : ""}
            {item.impactValue.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">{item.impactMetric}</p>
        </div>
        <AppButton variant="outline" size="sm">
          عرض التفاصيل
        </AppButton>
      </div>
    </div>
  )
}

export default function AIAssistantDashboard() {
  const [activeTab, setActiveTab] = useState<"all" | RecommendationCategory>("all")
  const [period, setPeriod] = useState("30")
  const [chatInput, setChatInput] = useState("")

  const filteredRecommendations = useMemo(() => {
    if (activeTab === "all") return recommendations
    return recommendations.filter((item) => item.category === activeTab)
  }, [activeTab])

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="size-6 text-primary" />
            الذكاء الاصطناعي
          </h1>
          <p className="text-sm text-muted-foreground">
            مساعدك الذكي لتحسين الأداء التسويقي واتخاذ قرارات أفضل
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AppSelect value={period} onValueChange={setPeriod}>
            <AppSelectTrigger className="h-10 gap-2 rounded-xl border-border bg-card px-3 text-sm font-medium text-foreground">
              <CalendarIcon className="size-4 text-muted-foreground" />
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent align="end">
              <AppSelectItem value="7">آخر 7 أيام</AppSelectItem>
              <AppSelectItem value="30">آخر 30 يومًا</AppSelectItem>
              <AppSelectItem value="90">آخر 90 يومًا</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            آخر تحديث: قبل 5 دقائق
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <AppCard
          title="المساعد الذكي"
          className="rounded-2xl border-border/60 shadow-sm xl:order-2"
        >
          <div className="flex flex-col items-center px-1 py-2 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-blue-100 text-3xl">
              🤖
            </div>
            <p className="mt-4 text-lg font-bold text-foreground">مرحبًا محمد! 👋</p>
            <p className="mt-1 text-sm text-muted-foreground">
              أنا مساعدك الذكي في مدار، كيف يمكنني مساعدتك اليوم؟
            </p>

            <div className="mt-5 w-full space-y-2.5">
              {suggestedQuestions.map((question) => {
                const Icon = question.icon
                return (
                  <button
                    key={question.label}
                    type="button"
                    onClick={() => setChatInput(question.label)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-start text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span>{question.label}</span>
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="اكتب سؤالك هنا..."
                className="h-8 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                aria-label="إرسال"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Send className="size-4 -scale-x-100" />
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0" />
              يمكنك سؤال أي شيء عن حملاتك، القنوات، الأداء، أو التوصيات
            </p>
          </div>
        </AppCard>

        <AppCard
          title="التوصيات المقترحة"
          icon={<Sparkles className="size-4 text-primary" />}
          className="rounded-2xl border-border/60 shadow-sm xl:order-1"
        >
          <div className="mb-4 flex flex-wrap items-center gap-5 border-b border-border/60">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {Icon ? <Icon className="size-3.5" /> : null}
                  {tab.label}
                  {isActive ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="space-y-3">
            {filteredRecommendations.map((item) => (
              <RecommendationCard key={item.id} item={item} />
            ))}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            التوصيات مبنية على تحليل البيانات والذكاء الاصطناعي وقد تختلف النتائج الفعلية
          </p>
        </AppCard>
      </div>
    </div>
  )
}
