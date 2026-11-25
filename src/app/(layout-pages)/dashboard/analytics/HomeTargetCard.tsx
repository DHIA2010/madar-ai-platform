"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Check, ChevronDown, Loader2, Pencil, Target, Trophy } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { HEADING, MUTED, PANEL } from "@/features/reports/components/ready-report-field"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import {
  type HomeTargetScope,
  homeTargetsService,
} from "@/features/home-targets/home-targets.service"

export type TargetKpiFormat = "currency" | "percent" | "count" | "ratio" | "decimal"

export interface TargetKpi {
  key: string
  label: string
  // The tab's number for the chosen period.
  value: number
  format: TargetKpiFormat
  // A cost: reaching the target means staying at or under it (cost per click, returns...).
  lowerIsBetter?: boolean
}

const TRIGGER =
  "flex h-9 min-w-[170px] cursor-pointer items-center gap-2 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12px] font-semibold text-[#0b1738] transition-colors hover:border-[#c4d5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/35"

function format(value: number, kind: TargetKpiFormat, ar: boolean): string {
  const number = (digits: number) =>
    value.toLocaleString(ar ? "ar-SA-u-nu-latn" : "en-US", { maximumFractionDigits: digits })
  switch (kind) {
    case "currency":
      return `${number(2)} ${ar ? "ر.س" : "SAR"}`
    case "percent":
      return `${number(2)}%`
    case "ratio":
      return `${number(2)}x`
    case "decimal":
      return number(2)
    default:
      return number(0)
  }
}

// How much of the target is reached. For a cost, staying at the target or under it is 100%.
function achievement(kpi: TargetKpi, target: number): number {
  if (target <= 0) return 0
  if (!kpi.lowerIsBetter) return (kpi.value / target) * 100
  if (kpi.value <= 0) return 100
  return Math.min((target / kpi.value) * 100, 100)
}

// Half a ring, filled to the share of the target reached.
function Gauge({ percent, done, rtl }: { percent: number; done: boolean; rtl: boolean }) {
  const radius = 80
  const length = Math.PI * radius
  const filled = (Math.min(Math.max(percent, 0), 100) / 100) * length
  return (
    <svg
      viewBox="0 0 200 112"
      // In Arabic it fills from the right, the way the page reads.
      className={cn("w-full max-w-[240px]", rtl && "-scale-x-100")}
      aria-hidden
    >
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="#eef2f8"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke={done ? "#16a34a" : "#2878ff"}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${length}`}
        className="transition-[stroke-dasharray] duration-700"
      />
    </svg>
  )
}

// تحقيق الهدف: pick one of the tab's KPIs, set the number to reach in the chosen period, and see
// how far along it is. The target and the choice are saved for the whole organization, one target
// per KPI, so switching back to a KPI brings its target back.
export function HomeTargetCard({
  scope,
  kpis,
  defaultKpi,
}: {
  scope: HomeTargetScope
  kpis: TargetKpi[]
  defaultKpi: string
}) {
  const ar = useLocale() === "ar"
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const [selected, setSelected] = useState<string | null>(null)
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    homeTargetsService
      .get(scope)
      .then((result) => {
        if (!active) return
        setSelected(result.selected)
        setTargets(result.targets)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [scope])

  const kpi = kpis.find((entry) => entry.key === selected) ?? kpis.find((e) => e.key === defaultKpi)
  if (!kpi) return null
  const target = targets[kpi.key]
  const hasTarget = target !== undefined && target > 0
  const percent = hasTarget ? achievement(kpi, target) : 0
  const done = hasTarget && percent >= 100

  function choose(key: string) {
    setOpen(false)
    setEditing(false)
    setSelected(key)
    homeTargetsService.set(scope, { kpi: key }).catch(() => undefined)
  }

  async function save() {
    const value = Number(draft.replace(/,/g, "").trim())
    if (!Number.isFinite(value) || value <= 0) {
      toast.error(tx("اكتب هدفًا أكبر من صفر.", "Enter a target above zero."))
      return
    }
    setSaving(true)
    try {
      const result = await homeTargetsService.set(scope, { kpi: kpi!.key, target: value })
      setTargets(result.targets)
      setSelected(result.selected)
      setEditing(false)
      toast.success(tx("حُفظ الهدف.", "Target saved."))
    } catch {
      toast.error(tx("تعذر حفظ الهدف.", "Couldn't save the target."))
    } finally {
      setSaving(false)
    }
  }

  function startEditing() {
    setDraft(hasTarget ? String(target) : "")
    setEditing(true)
  }

  // What is left to reach the target, or how far past it.
  const gap = hasTarget
    ? kpi.lowerIsBetter
      ? kpi.value <= target
        ? tx("ضمن الهدف", "Within target")
        : tx(
            `أعلى من الهدف بـ ${format(kpi.value - target, kpi.format, ar)}`,
            `${format(kpi.value - target, kpi.format, ar)} over target`
          )
      : kpi.value >= target
        ? tx(
            `تجاوزت الهدف بـ ${format(kpi.value - target, kpi.format, ar)}`,
            `${format(kpi.value - target, kpi.format, ar)} past target`
          )
        : tx(
            `المتبقي ${format(target - kpi.value, kpi.format, ar)}`,
            `${format(target - kpi.value, kpi.format, ar)} to go`
          )
    : null

  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={cn("text-[13.5px] font-bold", HEADING)}>
            {tx("تحقيق الهدف", "Target progress")}
          </h3>
          <p className={cn("mt-0.5 text-[11.5px]", MUTED)}>
            {tx(
              "اختر المؤشر وضع هدفك للفترة المختارة.",
              "Pick a KPI and set your target for the selected period."
            )}
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={TRIGGER} aria-label={tx("المؤشر", "KPI")}>
              <span className="min-w-0 flex-1 truncate text-start">{kpi.label}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-[#95a4bd] transition-transform",
                  open && "rotate-180"
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            dir={ar ? "rtl" : "ltr"}
            align="end"
            sideOffset={6}
            className="w-[230px] rounded-[14px] border-[#e1e7f0] p-1.5 shadow-[0_12px_32px_rgba(11,23,56,0.12)]"
          >
            <div className="flex flex-col gap-0.5">
              {kpis.map((entry) => {
                const active = entry.key === kpi.key
                const saved = targets[entry.key]
                return (
                  <button
                    key={entry.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(entry.key)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-start text-[12.5px] transition-colors",
                      active
                        ? "bg-[#eaf1ff] font-bold text-[#0b1738]"
                        : "text-[#0b1738] hover:bg-[#f4f7fc]"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {saved ? <Target className="size-3.5 shrink-0 text-[#95a4bd]" /> : null}
                    {active ? (
                      <Check className="size-3.5 shrink-0 text-[#2878ff]" strokeWidth={3} />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="grid items-center gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="relative mx-auto w-full max-w-[240px]">
            <Gauge percent={percent} done={done} rtl={ar} />
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
              {done ? <Trophy className="mb-0.5 size-4 text-emerald-600" /> : null}
              <span
                className={cn(
                  "text-[26px] leading-none font-black",
                  done ? "text-emerald-600" : HEADING
                )}
              >
                {hasTarget ? `${Math.round(percent)}%` : "—"}
              </span>
              <span className={cn("mt-1 text-[11px]", MUTED)}>{tx("من الهدف", "of target")}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-[#f7f9fd] p-3">
                <p className={cn("text-[11.5px] font-semibold", MUTED)}>
                  {tx("المحقق", "Achieved")}
                </p>
                <p className={cn("mt-1 text-[17px] font-black", HEADING)} dir="ltr">
                  {format(kpi.value, kpi.format, ar)}
                </p>
              </div>
              <div className="rounded-[12px] bg-[#f7f9fd] p-3">
                <p className={cn("text-[11.5px] font-semibold", MUTED)}>
                  {kpi.lowerIsBetter
                    ? tx("الحد الأعلى (الهدف)", "Max (target)")
                    : tx("الهدف", "Target")}
                </p>
                <p className={cn("mt-1 text-[17px] font-black", HEADING)} dir="ltr">
                  {hasTarget ? format(target, kpi.format, ar) : "—"}
                </p>
              </div>
            </div>

            {editing || !hasTarget ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save()
                  }}
                  placeholder={tx(`هدف ${kpi.label}`, `${kpi.label} target`)}
                  aria-label={tx("الهدف", "Target")}
                  className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[13px] text-[#0b1738] outline-none focus:border-[#2878ff]"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#2878ff] px-4 text-[12.5px] font-bold text-white hover:bg-[#1d4fd8] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {tx("حفظ الهدف", "Save target")}
                </button>
                {editing && hasTarget ? (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="h-9 rounded-[10px] px-3 text-[12.5px] font-semibold text-[#6b7b96] hover:bg-[#f4f7fc]"
                  >
                    {tx("إلغاء", "Cancel")}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[12px] font-bold",
                    done ? "bg-emerald-50 text-emerald-700" : "bg-[#eef4ff] text-[#1d4fd8]"
                  )}
                >
                  {gap}
                </span>
                <button
                  type="button"
                  onClick={startEditing}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#e1e7f0] bg-white px-3 text-[12px] font-semibold text-[#0b1738] hover:bg-[#f7f9fd]"
                >
                  <Pencil className="size-3.5" />
                  {tx("تعديل الهدف", "Edit target")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
