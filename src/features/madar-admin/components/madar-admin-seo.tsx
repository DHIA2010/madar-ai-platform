"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileText,
  Hash,
  KeyRound,
  ListOrdered,
  MousePointerClick,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Unplug,
} from "lucide-react"
import { Line, LineChart, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  AppButton,
  AppCard,
  type AppChartPrimitiveConfig as ChartConfig,
  AppChartPrimitiveContainer as ChartContainer,
  AppChartPrimitiveTooltip as ChartTooltip,
  AppChartPrimitiveTooltipContent as ChartTooltipContent,
  AppConfirmDialog,
  AppInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppTextarea,
} from "@/components/app"

import {
  type AdminSeoReport,
  type AdminSeoRow,
  type AdminSeoStatus,
  type AdminSeoTracked,
  seoAdminService,
} from "../services/seo-admin.service"
import { Segmented } from "./admin-segmented"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

// Madar Admin → السيو: how madar.my shows up in Google search (Search Console) -- clicks,
// impressions, average position, the searches and pages behind them, and the searches Madar
// follows day by day. Read with a Google service account that has view access to Search Console.

type RangeKey = 7 | 28 | 90 | 365
type Country = "sau" | ""
type Device = "" | "mobile" | "desktop"
type Tab = "tracked" | "queries" | "pages"

const DAY_MS = 86_400_000
const DELAY_DAYS = 2

const numberFormat = new Intl.NumberFormat("en-US")
const formatNumber = (value: number) => numberFormat.format(Math.round(value))
const formatPosition = (value: number) => (value > 0 ? value.toFixed(1) : "—")
const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

function formatDay(day: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "short" }).format(
    new Date(`${day}T12:00:00Z`)
  )
}

const startFor = (days: RangeKey) =>
  new Date(Date.now() - (DELAY_DAYS + days - 1) * DAY_MS).toISOString().slice(0, 10)

const round = (value: number) => Math.round(value * 10) / 10

const change = (current: number, previous: number) =>
  previous > 0 ? round(((current - previous) / previous) * 100) : null

// A lower position is better, so the change is turned round: up means climbing in Google.
const positionChange = (current: number, previous: number) =>
  previous > 0 && current > 0 ? round(((previous - current) / previous) * 100) : null

const errorText = (error: unknown, field?: string) => {
  const details = (error as { details?: Record<string, unknown> } | null)?.details
  if (field && details && typeof details[field] === "string") return String(details[field])
  return error instanceof Error ? error.message : ""
}

const pagePath = (url: string) => {
  try {
    const parsed = new URL(url)
    return decodeURIComponent(parsed.pathname) || String.fromCharCode(47)
  } catch {
    return url
  }
}

// ---------- small pieces ----------

function PositionBadge({ position }: { position: number | null }) {
  if (position === null || position <= 0) {
    return <span className="text-xs text-muted-foreground">لا يظهر بعد</span>
  }
  const tone =
    position <= 3
      ? "bg-emerald-50 text-emerald-700"
      : position <= 10
        ? "bg-blue-50 text-blue-700"
        : position <= 20
          ? "bg-orange-50 text-orange-700"
          : "bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex min-w-12 justify-center rounded-full px-2.5 py-1 text-xs font-bold",
        tone
      )}
    >
      {formatPosition(position)}
    </span>
  )
}

function PositionMove({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || current <= 0)
    return <span className="text-xs text-muted-foreground">—</span>
  if (previous === null || previous <= 0) {
    return <span className="text-xs font-semibold text-violet-600">جديد</span>
  }
  const diff = previous - current
  if (Math.abs(diff) < 0.1) return <span className="text-xs text-muted-foreground">ثابت</span>
  const up = diff > 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        up ? "text-emerald-600" : "text-rose-600"
      )}
      title={up ? "تقدّم في الترتيب" : "تراجع في الترتيب"}
    >
      <Icon className="size-3.5" />
      {Math.abs(diff).toFixed(1)}
    </span>
  )
}

function Sparkline({ points }: { points: AdminSeoTracked["daily"] }) {
  if (points.length < 2) return <span className="text-xs text-muted-foreground">—</span>
  const positions = points.map((point) => point.position)
  const best = Math.min(...positions)
  const worst = Math.max(...positions)
  const spread = Math.max(1, worst - best)
  const width = 120
  const height = 32
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      // Position 1 at the top.
      const y = ((point.position - best) / spread) * (height - 4) + 2
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

const TABLE_WRAP = "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"

// ---------- connecting the robot account ----------

function ConnectCard({ onConnected }: { onConnected: (status: AdminSeoStatus) => void }) {
  const [key, setKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    setSaving(true)
    setError(null)
    try {
      const status = await seoAdminService.connect(key.trim())
      setKey("")
      toast.success("تم ربط Search Console.")
      onConnected(status)
    } catch (caught) {
      setError(
        errorText(caught, "key") ||
          "تعذر الربط. تأكد من المفتاح ومن إضافة الحساب في Search Console."
      )
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    "افتح Google Cloud Console ← IAM والمشرف ← حسابات الخدمة، وأنشئ حساب خدمة باسم madar-seo.",
    "من «المكتبة» فعّل Google Search Console API لنفس المشروع.",
    "افتح حساب الخدمة ← المفاتيح ← إضافة مفتاح ← JSON. سيُحمَّل ملف على جهازك.",
    "في Search Console ← الإعدادات ← المستخدمون والأذونات، أضف بريد حساب الخدمة (ينتهي بـ iam.gserviceaccount.com) بصلاحية «مقيّد».",
    "افتح ملف JSON، انسخ كل محتواه والصقه هنا.",
  ]

  return (
    <AppCard
      title="ربط Google Search Console"
      subtitle="مرة واحدة فقط: حساب خدمة من جوجل يقرأ أرقام البحث لموقع madar.my (قراءة فقط)."
      icon={<KeyRound className="size-5" />}
      className="max-w-3xl rounded-2xl border-border/60 shadow-sm"
    >
      <ol className="mb-5 list-decimal space-y-2 ps-5 text-sm leading-7 text-foreground">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="seo-key">
        مفتاح حساب الخدمة (JSON)
      </label>
      <AppTextarea
        id="seo-key"
        dir="ltr"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder='{ "type": "service_account", "client_email": "...", "private_key": "..." }'
        className="min-h-40 rounded-[10px] font-mono text-xs"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        يُحفظ المفتاح مشفّراً ولا يُعرض مرة أخرى.
      </p>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <AppButton
          className="rounded-[10px]"
          disabled={saving || key.trim().length < 50}
          onClick={connect}
        >
          {saving ? "جارٍ التحقق…" : "ربط"}
        </AppButton>
      </div>
    </AppCard>
  )
}

// ---------- the followed searches ----------

function TrackedView({
  tracked,
  onAdd,
  onRemove,
}: {
  tracked: AdminSeoTracked[] | null
  onAdd: (keywords: string[]) => Promise<void>
  onRemove: (keyword: AdminSeoTracked) => void
}) {
  const [text, setText] = useState("")
  const [adding, setAdding] = useState(false)

  async function add() {
    const keywords = text
      .split(/[\n,،]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (keywords.length === 0) return
    setAdding(true)
    try {
      await onAdd(keywords)
      setText("")
    } finally {
      setAdding(false)
    }
  }

  const sorted = useMemo(
    () =>
      [...(tracked ?? [])].sort(
        (a, b) => (a.current?.position || 999) - (b.current?.position || 999)
      ),
    [tracked]
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <AppInput
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add()
          }}
          placeholder="أضف كلمة بحث لمتابعتها، مثل: برنامج كاشير، نظام محاسبة (افصل بفاصلة)"
          className="h-11 min-w-72 flex-1 rounded-[10px]"
        />
        <AppButton
          icon={<Plus className="size-4" />}
          className="h-11 rounded-[10px]"
          disabled={adding || !text.trim()}
          onClick={add}
        >
          متابعة
        </AppButton>
      </div>
      <div className={TABLE_WRAP}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>كلمة البحث</AppTableHead>
              <AppTableHead>الترتيب</AppTableHead>
              <AppTableHead>التغيّر</AppTableHead>
              <AppTableHead>الترتيب يوماً بيوم</AppTableHead>
              <AppTableHead>النقرات</AppTableHead>
              <AppTableHead>مرات الظهور</AppTableHead>
              <AppTableHead className="w-12" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {sorted.map((entry) => (
              <AppTableRow key={entry.id}>
                <AppTableCell className="font-semibold">{entry.keyword}</AppTableCell>
                <AppTableCell>
                  <PositionBadge position={entry.current?.position ?? null} />
                </AppTableCell>
                <AppTableCell>
                  <PositionMove
                    current={entry.current?.position ?? null}
                    previous={entry.previousPosition}
                  />
                </AppTableCell>
                <AppTableCell>
                  <Sparkline points={entry.daily} />
                </AppTableCell>
                <AppTableCell>{formatNumber(entry.current?.clicks ?? 0)}</AppTableCell>
                <AppTableCell>{formatNumber(entry.current?.impressions ?? 0)}</AppTableCell>
                <AppTableCell>
                  <button
                    type="button"
                    aria-label="إيقاف المتابعة"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => onRemove(entry)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
        {tracked === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : tracked.length === 0 ? (
          <AppTableEmpty
            title="لا توجد كلمات متابَعة بعد"
            description="أضف الكلمات التي تهمك، أو اضغط النجمة بجانب أي كلمة في تبويب «كلمات البحث»."
          />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        «لا يظهر بعد» تعني أن مدار لم يظهر في نتائج جوجل لهذه الكلمة خلال الفترة المختارة.
      </p>
    </div>
  )
}

// ---------- searches and pages ----------

function RowsView({
  rows,
  kind,
  trackedKeys,
  onTrack,
}: {
  rows: AdminSeoRow[] | null
  kind: "queries" | "pages"
  trackedKeys: Set<string>
  onTrack: (keyword: string) => void
}) {
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<"clicks" | "impressions" | "position">("clicks")
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const list = (rows ?? []).filter((row) => !needle || row.key.toLowerCase().includes(needle))
    return list.sort((a, b) => (sort === "position" ? a.position - b.position : b[sort] - a[sort]))
  }, [rows, filter, sort])

  const sortHead = (key: typeof sort, label: string) => (
    <button
      type="button"
      onClick={() => setSort(key)}
      className={cn("font-semibold", sort === key ? "text-foreground" : "hover:text-foreground")}
    >
      {label}
      {sort === key ? " ▾" : ""}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
        <AppInput
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={kind === "queries" ? "ابحث في كلمات البحث" : "ابحث في الصفحات"}
          className="h-11 rounded-[10px] ps-9"
        />
      </div>
      <div className={TABLE_WRAP}>
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>{kind === "queries" ? "كلمة البحث" : "الصفحة"}</AppTableHead>
              <AppTableHead>{sortHead("position", "الترتيب")}</AppTableHead>
              <AppTableHead>التغيّر</AppTableHead>
              <AppTableHead>{sortHead("clicks", "النقرات")}</AppTableHead>
              <AppTableHead>{sortHead("impressions", "مرات الظهور")}</AppTableHead>
              <AppTableHead>نسبة النقر</AppTableHead>
              {kind === "queries" ? <AppTableHead className="w-12" /> : null}
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {visible.map((row) => (
              <AppTableRow key={row.key}>
                <AppTableCell className="max-w-md font-semibold">
                  {kind === "pages" ? (
                    <a
                      href={row.key}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                      className="block truncate text-start text-[#1d4ed8] hover:underline"
                    >
                      {pagePath(row.key)}
                    </a>
                  ) : (
                    row.key
                  )}
                </AppTableCell>
                <AppTableCell>
                  <PositionBadge position={row.position} />
                </AppTableCell>
                <AppTableCell>
                  <PositionMove current={row.position} previous={row.previousPosition} />
                </AppTableCell>
                <AppTableCell>{formatNumber(row.clicks)}</AppTableCell>
                <AppTableCell>{formatNumber(row.impressions)}</AppTableCell>
                <AppTableCell>{formatPercent(row.ctr)}</AppTableCell>
                {kind === "queries" ? (
                  <AppTableCell>
                    <button
                      type="button"
                      aria-label="متابعة الكلمة"
                      title={trackedKeys.has(row.key) ? "متابَعة" : "تابع هذه الكلمة"}
                      disabled={trackedKeys.has(row.key)}
                      className={cn(
                        "rounded-lg p-1.5",
                        trackedKeys.has(row.key)
                          ? "text-amber-500"
                          : "text-muted-foreground hover:bg-amber-50 hover:text-amber-500"
                      )}
                      onClick={() => onTrack(row.key)}
                    >
                      <Star
                        className="size-4"
                        fill={trackedKeys.has(row.key) ? "currentColor" : "none"}
                      />
                    </button>
                  </AppTableCell>
                ) : null}
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>
        {rows === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : visible.length === 0 ? (
          <AppTableEmpty
            title="لا توجد بيانات في هذه الفترة"
            description="تظهر هنا الكلمات والصفحات التي ظهر فيها مدار في نتائج جوجل."
          />
        ) : null}
      </div>
    </div>
  )
}

// ---------- the page ----------

const chartConfig: ChartConfig = {
  النقرات: { label: "النقرات", color: "#2878ff" },
  "مرات الظهور": { label: "مرات الظهور", color: "#7c4dff" },
  الترتيب: { label: "متوسط الترتيب", color: "#10b981" },
}

export function MadarAdminSeo() {
  const [status, setStatus] = useState<AdminSeoStatus | null>(null)
  const [report, setReport] = useState<AdminSeoReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>(28)
  const [country, setCountry] = useState<Country>("sau")
  const [device, setDevice] = useState<Device>("")
  const [tab, setTab] = useState<Tab>("tracked")
  const [chart, setChart] = useState<"traffic" | "position">("traffic")
  const [removing, setRemoving] = useState<AdminSeoTracked | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    seoAdminService
      .status()
      .then(setStatus)
      .catch(() =>
        setStatus({ connected: false, clientEmail: null, siteUrl: null, connectedAt: null })
      )
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setFailure(null)
    try {
      const result = await seoAdminService.report({
        startDate: startFor(range),
        country: country || undefined,
        device: device || undefined,
      })
      if (result.status === "ready") setReport(result)
      else setStatus((current) => (current ? { ...current, connected: false } : current))
    } catch (error) {
      setFailure(errorText(error) || "تعذر جلب الأرقام من Search Console.")
    } finally {
      setLoading(false)
    }
  }, [range, country, device])

  useEffect(() => {
    if (status?.connected) void load()
  }, [status?.connected, load])

  async function addKeywords(keywords: string[]) {
    try {
      const { added } = await seoAdminService.addKeywords(keywords)
      toast.success(added > 0 ? `تمت متابعة ${added} كلمة.` : "هذه الكلمات متابَعة مسبقاً.")
      await load()
    } catch (error) {
      toast.error(errorText(error, "keywords") || "تعذرت الإضافة.")
    }
  }

  const trackedKeys = useMemo(
    () => new Set((report?.tracked ?? []).map((entry) => entry.keyword)),
    [report]
  )

  const kpis: MadarAdminKpi[] = report
    ? [
        {
          label: "النقرات من جوجل",
          value: formatNumber(report.totals.clicks),
          deltaPct: change(report.totals.clicks, report.previousTotals.clicks),
          icon: MousePointerClick,
          tone: "blue",
          comparedTo: "مقارنة بالفترة السابقة",
        },
        {
          label: "مرات الظهور في النتائج",
          value: formatNumber(report.totals.impressions),
          deltaPct: change(report.totals.impressions, report.previousTotals.impressions),
          icon: Eye,
          tone: "violet",
          comparedTo: "مقارنة بالفترة السابقة",
        },
        {
          label: "متوسط الترتيب",
          value: formatPosition(report.totals.position),
          deltaPct: positionChange(report.totals.position, report.previousTotals.position),
          icon: ListOrdered,
          tone: "green",
          comparedTo: "مقارنة بالفترة السابقة",
        },
        {
          label: "نسبة النقر",
          value: formatPercent(report.totals.ctr),
          deltaPct: change(report.totals.ctr, report.previousTotals.ctr),
          icon: Percent,
          tone: "orange",
          comparedTo: "مقارنة بالفترة السابقة",
        },
      ]
    : []

  const chartData = (report?.daily ?? []).map((point) => ({
    day: formatDay(point.date),
    النقرات: point.clicks,
    "مرات الظهور": point.impressions,
    الترتيب: Number(point.position.toFixed(1)),
  }))

  const pageOneCount = (report?.queries ?? []).filter((row) => row.position <= 10).length

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">السيو</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ظهور مدار في بحث جوجل: كم مرة ظهر، كم نقرة جاءت، وترتيبه في كل كلمة بحث.
          </p>
          {report ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDay(report.range.startDate)} – {formatDay(report.range.endDate)} · مقارنة
              بالفترة السابقة · أرقام جوجل تتأخر يومين تقريباً
            </p>
          ) : null}
        </div>
        {status?.connected ? (
          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              variant="outline"
              icon={<RefreshCw className={cn("size-4", loading && "animate-spin")} />}
              className="rounded-[10px]"
              disabled={loading}
              onClick={() => void load()}
            >
              تحديث
            </AppButton>
            <AppButton
              variant="outline"
              icon={<Unplug className="size-4" />}
              className="rounded-[10px]"
              onClick={() => setDisconnecting(true)}
            >
              فصل
            </AppButton>
          </div>
        ) : null}
      </div>

      {status === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
      ) : !status.connected ? (
        <ConnectCard onConnected={setStatus} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<RangeKey>
              value={range}
              onChange={setRange}
              options={[
                { key: 7, label: "7 أيام" },
                { key: 28, label: "28 يوماً" },
                { key: 90, label: "3 أشهر" },
                { key: 365, label: "12 شهراً" },
              ]}
            />
            <Segmented<Country>
              value={country}
              onChange={setCountry}
              options={[
                { key: "sau", label: "السعودية" },
                { key: "", label: "كل الدول" },
              ]}
            />
            <Segmented<Device>
              value={device}
              onChange={setDevice}
              options={[
                { key: "", label: "كل الأجهزة" },
                { key: "mobile", label: "الجوال" },
                { key: "desktop", label: "الكمبيوتر" },
              ]}
            />
          </div>

          {failure ? (
            <AppCard className="rounded-2xl border-rose-200 bg-rose-50/60 shadow-sm">
              <p className="text-sm text-rose-700">تعذر جلب الأرقام من Search Console: {failure}</p>
            </AppCard>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {report
              ? kpis.map((kpi) => <MadarAdminKpiCard key={kpi.label} kpi={kpi} />)
              : Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-36 animate-pulse rounded-2xl bg-muted/40" />
                ))}
          </div>

          <AppCard
            title={chart === "traffic" ? "النقرات ومرات الظهور يومياً" : "متوسط الترتيب يومياً"}
            subtitle={
              chart === "position"
                ? "كلما كان الخط أعلى كان الترتيب أفضل (1 = أول نتيجة)."
                : undefined
            }
            state={report === null ? "loading" : "idle"}
            className="rounded-2xl border-border/60 shadow-sm"
            actions={
              <Segmented<"traffic" | "position">
                value={chart}
                onChange={setChart}
                options={[
                  { key: "traffic", label: "الزيارات" },
                  { key: "position", label: "الترتيب" },
                ]}
              />
            }
          >
            {chartData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                لا توجد أرقام في هذه الفترة بعد.
              </p>
            ) : (
              <ChartContainer config={chartConfig} className="h-72 w-full" dir="ltr">
                {chart === "traffic" ? (
                  <LineChart data={chartData} margin={{ left: 4, right: 4 }}>
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      yAxisId="clicks"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      width={40}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="impressions"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      width={48}
                      allowDecimals={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Line
                      yAxisId="clicks"
                      dataKey="النقرات"
                      type="monotone"
                      stroke="#2878ff"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="impressions"
                      dataKey="مرات الظهور"
                      type="monotone"
                      stroke="#7c4dff"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                ) : (
                  <LineChart data={chartData} margin={{ left: 4, right: 4 }}>
                    <XAxis
                      dataKey="day"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      reversed
                      domain={[1, "auto"]}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Line
                      dataKey="الترتيب"
                      type="monotone"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                )}
              </ChartContainer>
            )}
          </AppCard>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { key: "tracked", label: "الكلمات المتابَعة", count: report?.tracked.length },
                { key: "queries", label: "كلمات البحث", count: report?.queries.length },
                { key: "pages", label: "الصفحات", count: report?.pages.length },
              ]}
            />
            {report ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {tab === "pages" ? (
                  <FileText className="size-3.5" />
                ) : (
                  <Hash className="size-3.5" />
                )}
                {pageOneCount} كلمة في الصفحة الأولى من جوجل (الترتيب 1–10)
              </p>
            ) : null}
          </div>

          {tab === "tracked" ? (
            <TrackedView
              tracked={report?.tracked ?? null}
              onAdd={addKeywords}
              onRemove={setRemoving}
            />
          ) : (
            <RowsView
              key={tab}
              kind={tab}
              rows={report ? (tab === "queries" ? report.queries : report.pages) : null}
              trackedKeys={trackedKeys}
              onTrack={(keyword) => void addKeywords([keyword])}
            />
          )}

          <p className="text-xs text-muted-foreground">
            المصدر: Google Search Console ({status.siteUrl}). الترتيب هو متوسط موقع مدار في نتائج
            البحث خلال الفترة (1 = أول نتيجة). الأخضر 1–3، الأزرق الصفحة الأولى، البرتقالي الصفحة
            الثانية.
          </p>
        </>
      )}

      <AppConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="إيقاف متابعة الكلمة؟"
        description={removing ? `لن تظهر «${removing.keyword}» في الكلمات المتابَعة.` : undefined}
        confirmLabel="إيقاف المتابعة"
        onConfirm={async () => {
          if (!removing) return
          await seoAdminService.removeKeyword(removing.id)
          setRemoving(null)
          await load()
        }}
      />
      <AppConfirmDialog
        open={disconnecting}
        onOpenChange={setDisconnecting}
        title="فصل Search Console؟"
        description="سيُحذف مفتاح حساب الخدمة من مدار. الكلمات المتابَعة تبقى محفوظة."
        confirmLabel="فصل"
        onConfirm={async () => {
          await seoAdminService.disconnect()
          setDisconnecting(false)
          setReport(null)
          setStatus({ connected: false, clientEmail: null, siteUrl: null, connectedAt: null })
        }}
      />
    </div>
  )
}
