"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2, Search, Store, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppInput } from "@/components/app"

import { crmService } from "../services"
import { crmImportService } from "../services/crm-import.service"
import type { CrmProspect, CrmProspectUsage } from "../types"
import { PROSPECT_BUTTON as BUTTON, ProspectCard, ProspectLeadBar } from "./crm-prospect-card"

const ACTIVITIES = [
  "مطاعم",
  "مقاهي",
  "صالونات نسائية",
  "صالونات حلاقة",
  "عيادات",
  "محلات ملابس",
  "محلات عطور",
  "بقالات",
  "مغاسل سيارات",
  "ورش سيارات",
  "مراكز تجميل",
  "محلات حلويات",
]
const CITIES = [
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",
  "الدمام",
  "الخبر",
  "الطائف",
  "بريدة",
  "تبوك",
  "أبها",
  "خميس مشيط",
  "حائل",
  "جازان",
  "نجران",
  "الأحساء",
  "ينبع",
]
// What a mall or a market holds, each asked as a search of its own inside the place.
const INSIDE = [
  "محلات ملابس",
  "محلات أحذية وحقائب",
  "محلات عطور",
  "مجوهرات وساعات",
  "جوالات وإلكترونيات",
  "مطاعم",
  "مقاهي",
  "حلويات وشوكولاتة",
  "تجميل ومكياج",
  "نظارات",
  "ألعاب ومستلزمات أطفال",
  "أثاث ومستلزمات منزلية",
]
const WIDTHS = [
  { radius: 150, label: "صغير (150 م)" },
  { radius: 300, label: "مول (300 م)" },
  { radius: 500, label: "مول كبير (500 م)" },
  { radius: 1000, label: "حي أو سوق (1 كم)" },
]
// The riyal is pegged to the dollar.
const SAR_PER_USD = 3.75
type Failure = { code?: string; details?: { reason?: string } }
type Place = { name: string; latitude: number; longitude: number }

// The month's free Google searches as a bar: used, left, and the price once they run out.
function UsageBar({
  usage,
  allowPaid,
  onAllowPaid,
}: {
  usage: CrmProspectUsage | null
  allowPaid: boolean
  onAllowPaid: (value: boolean) => void
}) {
  if (!usage) return null
  const share = Math.min(100, Math.round((usage.used / usage.free) * 100))
  const tint =
    usage.remaining === 0 ? "bg-rose-500" : share >= 80 ? "bg-amber-500" : "bg-emerald-500"
  const sar = (usd: number) => (usd * SAR_PER_USD).toFixed(2)
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">عمليات البحث المجانية هذا الشهر</p>
        <p className="text-sm font-semibold text-foreground">
          استُخدم {usage.used.toLocaleString("en")} من {usage.free.toLocaleString("en")}
          <span className="ms-2 text-muted-foreground">
            · المتبقي {usage.remaining.toLocaleString("en")}
          </span>
        </p>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={usage.free}
        aria-valuenow={Math.min(usage.used, usage.free)}
      >
        <div
          className={cn("h-full rounded-full transition-all", tint)}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="mt-2 text-[12.5px] leading-6 text-muted-foreground">
        كل عملية بحث تعرض حتى 20 نشاطًا. بعد انتهاء المجاني تحسب قوقل {usage.usdPerSearch} دولار لكل
        عملية (نحو {sar(usage.usdPerSearch)} ريال)، أي {Math.round(usage.usdPerSearch * 1000)}{" "}
        دولارًا لكل 1,000 عملية. يتجدد المجاني أول كل شهر.
        {usage.paid > 0 ? (
          <span className="ms-1 font-bold text-rose-700">
            المدفوع هذا الشهر: {usage.paid.toLocaleString("en")} عملية = {usage.costUsd} دولار (نحو{" "}
            {sar(usage.costUsd)} ريال).
          </span>
        ) : null}
      </p>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          className="size-4 accent-[#1d4fd8]"
          checked={allowPaid}
          onChange={(event) => onAllowPaid(event.target.checked)}
        />
        السماح بالبحث المدفوع بعد انتهاء المجاني (بدونه يتوقف البحث عند انتهاء المجاني)
      </label>
    </div>
  )
}

// The prospect finder's Google Maps source: businesses by activity and city, or every shop
// inside one place, asked live from Google against the month's free searches. The ticked ones
// become leads; the team's own mark on each business is kept either way.
export function CrmProspectsGoogle() {
  const [activity, setActivity] = useState("مطاعم")
  const [city, setCity] = useState("الرياض")
  const [asked, setAsked] = useState<string | null>(null)
  const [items, setItems] = useState<CrmProspect[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<"key" | string | null>(null)
  const [hideMarked, setHideMarked] = useState(false)
  const [usage, setUsage] = useState<CrmProspectUsage | null>(null)
  const [allowPaid, setAllowPaid] = useState(false)
  const [mode, setMode] = useState<"activity" | "inside">("activity")
  const [placeName, setPlaceName] = useState("")
  const [place, setPlace] = useState<Place | null>(null)
  const [radius, setRadius] = useState(300)
  const [kinds, setKinds] = useState<string[]>(INSIDE)
  const [progress, setProgress] = useState<{ done: number; total: number; kind: string } | null>(
    null
  )
  const stop = useRef(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [tag, setTag] = useState("خرائط قوقل")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    crmService
      .prospectUsage()
      .then(setUsage)
      .catch(() => undefined)
  }, [])

  function fail(error: unknown) {
    const failure = error as Failure
    if (failure.code === "CRM_PROSPECTS_NO_KEY") setProblem("key")
    else if (failure.code === "CRM_PROSPECTS_FREE_USED") setProblem("free")
    else setProblem(failure.details?.reason ?? "تعذر البحث الآن. حاول مرة أخرى.")
  }

  // Every shop inside the chosen place: one search per kind of shop, up to three pages each,
  // gathered into one list without repeats.
  async function extract() {
    if (!place || kinds.length === 0) return
    stop.current = false
    setBusy(true)
    setProblem(null)
    setItems([])
    setNext(null)
    setChosen(new Set())
    setAsked(`داخل ${place.name}`)
    setTag(place.name.slice(0, 40))
    const area = { latitude: place.latitude, longitude: place.longitude, radius }
    const known = new Set<string>()
    try {
      for (let index = 0; index < kinds.length && !stop.current; index += 1) {
        setProgress({ done: index, total: kinds.length, kind: kinds[index] })
        let token: string | null = null
        for (let pageNumber = 0; pageNumber < 3 && !stop.current; pageNumber += 1) {
          const page = await crmService.searchProspects(kinds[index], token, { area, allowPaid })
          setUsage(page.usage)
          const fresh = page.items.filter((entry) => !known.has(entry.placeId))
          for (const entry of fresh) known.add(entry.placeId)
          setItems((current) => [...current, ...fresh])
          token = page.nextPageToken
          if (!token) break
        }
      }
    } catch (error) {
      fail(error)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  // The chosen businesses into the sales pipeline as leads, under one label. One already there
  // by the same phone is passed over.
  async function addLeads() {
    const rows = items
      .filter((entry) => chosen.has(entry.placeId) && entry.internationalPhone)
      .map((entry) => ({
        companyName: entry.name,
        contactName: null,
        phone: entry.internationalPhone,
        email: entry.email,
      }))
    if (rows.length === 0 || tag.trim().length === 0) return
    setAdding(true)
    try {
      const outcome = await crmImportService.importLeads(
        tag.trim().slice(0, 40),
        rows,
        "google_maps"
      )
      toast.success(
        `أُضيف ${outcome.created} عميلًا محتملًا` +
          (outcome.duplicates ? ` · ${outcome.duplicates} موجود من قبل` : "") +
          (outcome.invalid ? ` · ${outcome.invalid} بلا بيانات كافية` : "")
      )
      setChosen(new Set())
    } catch {
      toast.error("تعذرت إضافة العملاء المحتملين.")
    } finally {
      setAdding(false)
    }
  }

  async function run(query: string, pageToken: string | null) {
    setBusy(true)
    setProblem(null)
    try {
      const page = await crmService.searchProspects(query, pageToken, { allowPaid })
      setUsage(page.usage)
      setItems((current) => {
        if (!pageToken) return page.items
        const known = new Set(current.map((entry) => entry.placeId))
        return [...current, ...page.items.filter((entry) => !known.has(entry.placeId))]
      })
      setNext(page.nextPageToken)
      setAsked(query)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const search = () => {
    const query = `${activity.trim()} في ${city}`
    if (activity.trim().length < 2) return
    setItems([])
    setNext(null)
    setChosen(new Set())
    setTag(query.slice(0, 40))
    void run(query, null)
  }

  // The place itself (the mall), to pick from the results and search inside.
  const findPlace = () => {
    if (placeName.trim().length < 2) return
    setItems([])
    setNext(null)
    setPlace(null)
    setChosen(new Set())
    void run(`${placeName.trim()} ${city}`, null)
  }

  const toggle = (placeId: string) =>
    setChosen((current) => {
      const nextSet = new Set(current)
      if (nextSet.has(placeId)) nextSet.delete(placeId)
      else nextSet.add(placeId)
      return nextSet
    })

  const shown = hideMarked ? items.filter((entry) => !entry.mark) : items
  const reachable = shown.filter((entry) => entry.internationalPhone)
  const picking = mode === "inside" && !place
  const citySelect = (
    <select
      aria-label="المدينة"
      className="h-10 rounded-[10px] border border-border bg-white px-3 text-sm outline-none focus:border-[#1d4fd8]"
      value={city}
      onChange={(event) => setCity(event.target.value)}
    >
      {CITIES.map((entry) => (
        <option key={entry} value={entry}>
          {entry}
        </option>
      ))}
    </select>
  )

  return (
    <div className="flex flex-col gap-4">
      <UsageBar usage={usage} allowPaid={allowPaid} onAllowPaid={setAllowPaid} />

      <div className="flex gap-2">
        {(
          [
            ["activity", "بحث بالنشاط والمدينة"],
            ["inside", "استخراج محلات مكان (مول / سوق)"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(key)
              setItems([])
              setNext(null)
              setAsked(null)
              setPlace(null)
              setChosen(new Set())
              setProblem(null)
            }}
            className={cn(
              "rounded-[10px] border px-4 py-2 text-sm font-bold transition disabled:opacity-50",
              mode === key
                ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
                : "border-border bg-white text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "inside" ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          {place ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[15px] font-bold text-foreground">
                  <Store className="size-4 text-[#1d4fd8]" />
                  {place.name}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className={BUTTON}
                  onClick={() => {
                    setPlace(null)
                    setItems([])
                    setAsked(null)
                  }}
                >
                  تغيير المكان
                </button>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">حجم المكان</p>
                <div className="flex flex-wrap gap-2">
                  {WIDTHS.map((entry) => (
                    <button
                      key={entry.radius}
                      type="button"
                      onClick={() => setRadius(entry.radius)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition",
                        radius === entry.radius
                          ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
                          : "border-border bg-white text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">أنواع المحلات</p>
                <div className="flex flex-wrap gap-2">
                  {INSIDE.map((entry) => {
                    const on = kinds.includes(entry)
                    return (
                      <button
                        key={entry}
                        type="button"
                        onClick={() =>
                          setKinds((current) =>
                            on ? current.filter((kind) => kind !== entry) : [...current, entry]
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition",
                          on
                            ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
                            : "border-border bg-white text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {entry}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || kinds.length === 0}
                  onClick={() => void extract()}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#1d4fd8] px-5 text-sm font-bold text-white transition hover:bg-[#1a44bd] disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  استخراج المحلات
                </button>
                {progress ? (
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => {
                      stop.current = true
                    }}
                  >
                    <X className="size-4" />
                    إيقاف
                  </button>
                ) : null}
                <p className="text-[12.5px] text-muted-foreground">
                  يستهلك من {kinds.length} إلى {kinds.length * 3} عملية بحث من الرصيد.
                </p>
              </div>
              {progress ? (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#1d4fd8] transition-all"
                      style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                    جارٍ البحث عن: {progress.kind} ({progress.done + 1} من {progress.total}) · وُجد{" "}
                    {items.length} محلًا حتى الآن
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <label
                    className="mb-1.5 block text-sm font-medium text-foreground"
                    htmlFor="prospect-place"
                  >
                    اسم المكان
                  </label>
                  <AppInput
                    id="prospect-place"
                    maxLength={80}
                    placeholder="مثال: النخيل مول"
                    value={placeName}
                    onChange={(event) => setPlaceName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") findPlace()
                    }}
                  />
                </div>
                {citySelect}
                <button
                  type="button"
                  disabled={busy || placeName.trim().length < 2}
                  onClick={findPlace}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#1d4fd8] px-5 text-sm font-bold text-white transition hover:bg-[#1a44bd] disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  ابحث عن المكان
                </button>
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                ابحث عن المول أو السوق، ثم اضغط «استخراج محلات هذا المكان» على النتيجة الصحيحة.
              </p>
            </div>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
          mode === "inside" && "hidden"
        )}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label
              className="mb-1.5 block text-sm font-medium text-foreground"
              htmlFor="prospect-activity"
            >
              النشاط
            </label>
            <AppInput
              id="prospect-activity"
              maxLength={80}
              placeholder="مثال: مطاعم"
              value={activity}
              onChange={(event) => setActivity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") search()
              }}
            />
          </div>
          {citySelect}
          <button
            type="button"
            disabled={busy || activity.trim().length < 2}
            onClick={search}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#1d4fd8] px-5 text-sm font-bold text-white transition hover:bg-[#1a44bd] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            بحث
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ACTIVITIES.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setActivity(entry)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition",
                activity === entry
                  ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
                  : "border-border bg-white text-muted-foreground hover:text-foreground"
              )}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      {problem === "key" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          لم يُحفظ مفتاح خدمة Google Places بعد. أضفه من{" "}
          <Link href={ROUTES.madarAdminSettings} className="font-bold underline">
            إعدادات المنصة
          </Link>{" "}
          ثم عُد للبحث.
        </div>
      ) : problem === "free" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          انتهت عمليات البحث المجانية لهذا الشهر. للمتابعة فعّل «السماح بالبحث المدفوع» أعلاه، أو
          انتظر أول الشهر القادم.
        </div>
      ) : problem ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
          <p className="font-bold">رفضت قوقل البحث.</p>
          <p dir="ltr" className="mt-1 text-start">
            {problem}
          </p>
        </div>
      ) : null}

      {asked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            نتائج «{asked}»: {items.length} نشاطًا
            <span className="ms-2 text-[12px]">· المصدر: Google Maps</span>
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-[#1d4fd8]"
              checked={hideMarked}
              onChange={(event) => setHideMarked(event.target.checked)}
            />
            إخفاء من سُجّلت له حالة
          </label>
        </div>
      ) : null}

      {asked && !picking && shown.length > 0 ? (
        <ProspectLeadBar
          reachable={reachable.length}
          chosen={chosen.size}
          onToggleAll={() =>
            setChosen(
              chosen.size >= reachable.length
                ? new Set()
                : new Set(reachable.map((entry) => entry.placeId))
            )
          }
          tag={tag}
          onTag={setTag}
          adding={adding}
          onAdd={() => void addLeads()}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {shown.map((prospect) => (
          <ProspectCard
            key={prospect.placeId}
            prospect={prospect}
            selectable={!picking}
            checked={chosen.has(prospect.placeId)}
            onToggle={() => toggle(prospect.placeId)}
            onMarked={(mark) =>
              setItems((current) =>
                current.map((entry) =>
                  entry.placeId === prospect.placeId ? { ...entry, mark } : entry
                )
              )
            }
            extra={
              mode === "inside" &&
              !place &&
              prospect.latitude !== null &&
              prospect.longitude !== null ? (
                <button
                  type="button"
                  className={cn(BUTTON, "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]")}
                  onClick={() => {
                    setPlace({
                      name: prospect.name,
                      latitude: prospect.latitude as number,
                      longitude: prospect.longitude as number,
                    })
                    setItems([])
                    setNext(null)
                    setAsked(null)
                  }}
                >
                  <Store className="size-4" />
                  استخراج محلات هذا المكان
                </button>
              ) : null
            }
          />
        ))}
      </div>

      {asked && shown.length === 0 && !busy ? (
        <p className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "لا توجد نتائج لهذا البحث." : "كل النتائج سُجّلت لها حالة."}
        </p>
      ) : null}

      {next && !(mode === "inside" && place) ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => asked && void run(asked, next)}
          className={cn(BUTTON, "h-10 justify-center self-center px-6")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          عرض المزيد
        </button>
      ) : asked && mode === "activity" && items.length >= 60 ? (
        <p className="text-center text-[12.5px] text-muted-foreground">
          تعرض قوقل 60 نتيجة كحد أقصى لكل بحث. للمزيد غيّر النشاط أو أضف اسم الحي إلى النشاط.
        </p>
      ) : null}
    </div>
  )
}
