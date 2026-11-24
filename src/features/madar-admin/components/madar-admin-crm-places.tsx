"use client"

import { useEffect, useState } from "react"
import { Loader2, RefreshCw, Search, Store } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import { crmService } from "../services"
import { crmImportService } from "../services/crm-import.service"
import type { CrmPlacesOverview, CrmPlacesQuery, CrmProspect } from "../types"
import { PROSPECT_BUTTON, ProspectCard, ProspectLeadBar } from "./crm-prospect-card"

const DISTANCES = [
  { radius: 300, label: "مول (300 م)" },
  { radius: 500, label: "500 م" },
  { radius: 1000, label: "شارع أو سوق (1 كم)" },
  { radius: 2000, label: "حي (2 كم)" },
  { radius: 5000, label: "عدة أحياء (5 كم)" },
]
const SELECT =
  "h-10 rounded-[10px] border border-border bg-white px-3 text-sm outline-none focus:border-[#1d4fd8]"
const PRIMARY =
  "inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#1d4fd8] px-5 text-sm font-bold text-white transition hover:bg-[#1a44bd] disabled:opacity-50"
const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition",
    on
      ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
      : "border-border bg-white text-muted-foreground hover:text-foreground"
  )
const day = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" }).format(new Date(iso))

type Place = { name: string; latitude: number; longitude: number }

// The prospect finder's free source: Madar's own directory of Saudi businesses (open data,
// reloaded about monthly). Search by activity, name and city, or around one place (a mall, a
// street, a district), with no limit on searches; the ticked businesses become leads whose
// source is the directory.
export function CrmPlacesDirectory() {
  const [overview, setOverview] = useState<CrmPlacesOverview | null>(null)
  const [mode, setMode] = useState<"search" | "around">("search")
  const [activity, setActivity] = useState("restaurants")
  const [keyword, setKeyword] = useState("")
  const [city, setCity] = useState("riyadh")
  const [mobileOnly, setMobileOnly] = useState(false)
  const [placeName, setPlaceName] = useState("")
  const [place, setPlace] = useState<Place | null>(null)
  const [radius, setRadius] = useState(300)
  const [asked, setAsked] = useState<CrmPlacesQuery | null>(null)
  const [items, setItems] = useState<CrmProspect[]>([])
  const [total, setTotal] = useState(0)
  const [next, setNext] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hideMarked, setHideMarked] = useState(false)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [tag, setTag] = useState("دليل الأنشطة")
  const [adding, setAdding] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    crmService
      .placesOverview()
      .then(setOverview)
      .catch(() => setFailed(true))
  }, [])

  const label = (list: Array<{ key: string; label: string }> | undefined, key: string) =>
    list?.find((entry) => entry.key === key)?.label ?? ""

  async function run(query: CrmPlacesQuery, offset: number) {
    setBusy(true)
    setFailed(false)
    try {
      const page = await crmService.searchPlaces({ ...query, offset })
      setItems((current) => (offset === 0 ? page.items : [...current, ...page.items]))
      setTotal(page.total)
      setNext(page.nextOffset)
      setAsked(query)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  function start(query: CrmPlacesQuery, name: string) {
    setItems([])
    setNext(null)
    setChosen(new Set())
    setTag(name.slice(0, 40) || "دليل الأنشطة")
    void run(query, 0)
  }

  const search = () =>
    start(
      { activity, keyword: keyword.trim(), city, mobileOnly },
      [label(overview?.activities, activity) || keyword.trim(), label(overview?.cities, city)]
        .filter(Boolean)
        .join(" - ")
    )

  // The place itself (a mall, a market), found by name, to search around.
  const findPlace = () => {
    if (placeName.trim().length < 2) return
    setPlace(null)
    start({ keyword: placeName.trim(), city }, placeName.trim())
  }

  const searchAround = (target: Place, distance: number) =>
    start(
      {
        activity,
        mobileOnly,
        area: { latitude: target.latitude, longitude: target.longitude, radius: distance },
      },
      target.name
    )

  function reset(nextMode: "search" | "around") {
    setMode(nextMode)
    setItems([])
    setNext(null)
    setAsked(null)
    setPlace(null)
    setChosen(new Set())
    setActivity(nextMode === "around" ? "" : "restaurants")
  }

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
      const outcome = await crmImportService.importLeads(tag.trim().slice(0, 40), rows, "directory")
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

  async function requestRefresh() {
    setAsking(true)
    try {
      const state = await crmService.requestPlacesRefresh()
      setOverview((current) => (current ? { ...current, ...state } : current))
      toast.success("سُجّل طلب التحديث، ويُنفَّذ خلال يوم.")
    } catch {
      toast.error("تعذر تسجيل طلب التحديث.")
    } finally {
      setAsking(false)
    }
  }

  const picking = mode === "around" && !place
  const shown = hideMarked ? items.filter((entry) => !entry.mark) : items
  const reachable = shown.filter((entry) => entry.internationalPhone)
  const activitySelect = (
    <select
      aria-label="النشاط"
      className={SELECT}
      value={activity}
      onChange={(event) => setActivity(event.target.value)}
    >
      <option value="">كل الأنشطة</option>
      {overview?.activities.map((entry) => (
        <option key={entry.key} value={entry.key}>
          {entry.label}
        </option>
      ))}
    </select>
  )
  const citySelect = (
    <select
      aria-label="المدينة"
      className={SELECT}
      value={city}
      onChange={(event) => setCity(event.target.value)}
    >
      <option value="">كل المدن</option>
      {overview?.cities.map((entry) => (
        <option key={entry.key} value={entry.key}>
          {entry.label}
        </option>
      ))}
    </select>
  )
  const mobileBox = (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="size-4 accent-[#1d4fd8]"
        checked={mobileOnly}
        onChange={(event) => setMobileOnly(event.target.checked)}
      />
      من لديه جوال فقط (واتساب)
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      {overview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div>
            <p className="text-sm font-bold text-foreground">
              دليل الأنشطة التجارية في السعودية
              <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                مجاني وبلا حد للبحث
              </span>
            </p>
            <p className="mt-1 text-[12.5px] leading-6 text-muted-foreground">
              {overview.places > 0 && overview.loadedAt
                ? `${overview.places.toLocaleString("en")} نشاطًا · آخر تحديث ${day(overview.loadedAt)} · يتحدّث تلقائيًا كل شهر`
                : "لم يُحمَّل الدليل بعد. يُحمَّل تلقائيًا خلال يوم من التشغيل."}
              {overview.refreshRequestedAt ? " · طُلب تحديث، ويُنفَّذ خلال يوم" : ""}
            </p>
          </div>
          <button
            type="button"
            className={PROSPECT_BUTTON}
            disabled={asking || Boolean(overview.refreshRequestedAt)}
            onClick={() => void requestRefresh()}
          >
            {asking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            طلب تحديث الآن
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["search", "بحث بالنشاط والمدينة"],
            ["around", "حول مكان (مول / شارع / حي)"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => reset(key)}
            className={cn(
              "rounded-[10px] border px-4 py-2 text-sm font-bold transition disabled:opacity-50",
              mode === key
                ? "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]"
                : "border-border bg-white text-muted-foreground hover:text-foreground"
            )}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        {mode === "search" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              {activitySelect}
              <div className="min-w-[200px] flex-1">
                <AppInput
                  aria-label="كلمة في الاسم أو العنوان"
                  maxLength={80}
                  placeholder="كلمة في الاسم أو العنوان (اختياري)، مثال: برجر أو حي الملقا"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") search()
                  }}
                />
              </div>
              {citySelect}
              <button type="button" disabled={busy} onClick={search} className={PRIMARY}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                بحث
              </button>
            </div>
            {mobileBox}
          </div>
        ) : place ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[15px] font-bold text-foreground">
                <Store className="size-4 text-[#1d4fd8]" />
                حول: {place.name}
              </p>
              <button
                type="button"
                disabled={busy}
                className={PROSPECT_BUTTON}
                onClick={() => {
                  setPlace(null)
                  setItems([])
                  setAsked(null)
                }}
              >
                تغيير المكان
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {DISTANCES.map((entry) => (
                <button
                  key={entry.radius}
                  type="button"
                  onClick={() => setRadius(entry.radius)}
                  className={chip(radius === entry.radius)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {activitySelect}
              {mobileBox}
              <button
                type="button"
                disabled={busy}
                onClick={() => searchAround(place, radius)}
                className={PRIMARY}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                اعرض الأنشطة حوله
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <AppInput
                  aria-label="اسم المكان"
                  maxLength={80}
                  placeholder="اسم المكان، مثال: النخيل مول"
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
                className={PRIMARY}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                ابحث عن المكان
              </button>
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              ابحث عن المول أو أي محل معروف في الشارع، ثم اضغط «ابحث حول هذا المكان» على النتيجة
              الصحيحة.
            </p>
          </div>
        )}
      </div>

      {failed ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          تعذر البحث الآن. حاول مرة أخرى.
        </div>
      ) : null}

      {asked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("en")} نشاطًا
            {items.length < total ? ` · المعروض ${items.length.toLocaleString("en")}` : ""}
            <span className="ms-2 text-[12px]">· المصدر: دليل الأنشطة (بيانات مفتوحة)</span>
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
            onToggle={() =>
              setChosen((current) => {
                const nextSet = new Set(current)
                if (nextSet.has(prospect.placeId)) nextSet.delete(prospect.placeId)
                else nextSet.add(prospect.placeId)
                return nextSet
              })
            }
            onMarked={(mark) =>
              setItems((current) =>
                current.map((entry) =>
                  entry.placeId === prospect.placeId ? { ...entry, mark } : entry
                )
              )
            }
            extra={
              picking && prospect.latitude !== null && prospect.longitude !== null ? (
                <button
                  type="button"
                  className={cn(PROSPECT_BUTTON, "border-[#1d4fd8] bg-[#eef3ff] text-[#1d4fd8]")}
                  onClick={() => {
                    const target = {
                      name: prospect.name,
                      latitude: prospect.latitude as number,
                      longitude: prospect.longitude as number,
                    }
                    setPlace(target)
                    searchAround(target, radius)
                  }}
                >
                  <Store className="size-4" />
                  ابحث حول هذا المكان
                </button>
              ) : null
            }
          />
        ))}
      </div>

      {asked && shown.length === 0 && !busy ? (
        <p className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
          {items.length === 0
            ? "لا توجد نتائج. جرّب نشاطًا آخر، كلمة أقصر، أو «كل المدن»."
            : "كل النتائج المعروضة سُجّلت لها حالة."}
        </p>
      ) : null}

      {next !== null && asked ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(asked, next)}
          className={cn(PROSPECT_BUTTON, "h-10 justify-center self-center px-6")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          عرض المزيد ({(total - items.length).toLocaleString("en")} متبقٍ)
        </button>
      ) : null}
    </div>
  )
}
