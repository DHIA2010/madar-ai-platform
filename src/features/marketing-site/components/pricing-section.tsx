"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Crown, Gift, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { MADAR_REGISTER_URL } from "../marketing-constants"
import type { PublicApplicationPricing, PublicPackage } from "../pricing-data"

const APP_LABEL: Record<string, string> = {
  pos: "نقطة البيع",
  ecommerce: "المتاجر الإلكترونية",
  advertising: "الحملات الإعلانية",
  customReports: "التقارير المخصصة",
  ai: "الذكاء الاصطناعي",
  procurement: "الموردون والمشتريات",
  expenses: "المصروفات",
  madarApps: "تطبيقات مدار",
  madarComplete: "مدار الكامل",
}

const PACKAGE_LABEL: Record<string, string> = {
  Starter: "الأساسية",
  Growth: "النمو",
  Pro: "الاحترافية",
}

// The main apps, as tabs in this order.
const MAIN_APPS = ["advertising", "ecommerce", "pos"]
// Not shown as apps here ("madarApps" is a retired bundle; Madar Complete has its own banner).
const HIDDEN = ["madarApps", "customReports", "madarComplete"]

type Interval = "monthly" | "yearly"

const sar = (halalas: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(halalas / 100)

function freeLabel(days: number | null) {
  if (!days || days >= 365) return "مجانًا لمدة سنة"
  return `مجانًا لمدة ${days} يومًا`
}

// What's actually on sale: every package for a tiered app, only the first one for a fixed-price
// or free app (the marketplace ignores the rest).
function offeredPackages(entry: PublicApplicationPricing) {
  return entry.mode === "packages" ? entry.packages : entry.packages.slice(0, 1)
}

function PackageCard({
  entry,
  pkg,
  interval,
  single,
}: {
  entry: PublicApplicationPricing
  pkg: PublicPackage | null
  interval: Interval
  single: boolean
}) {
  const isFree = entry.mode === "free"
  const isContact = entry.mode === "contact" || (!pkg && !isFree)
  const highlighted = Boolean(pkg?.isRecommended) && !single
  const price = pkg
    ? interval === "yearly"
      ? pkg.yearlyPriceHalalas
      : pkg.monthlyPriceHalalas
    : null
  const saving =
    interval === "yearly" && pkg && price !== null && pkg.monthlyPriceHalalas !== null
      ? pkg.monthlyPriceHalalas * 12 - price
      : 0
  const title =
    entry.mode === "packages" && pkg
      ? (PACKAGE_LABEL[pkg.name] ?? pkg.name)
      : (APP_LABEL[entry.application] ?? entry.application)
  const muted = highlighted ? "text-slate-300" : "text-slate-500"

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border p-8",
        highlighted
          ? "border-transparent bg-[#0b1738] text-white shadow-[0_30px_70px_-25px_rgba(11,23,56,0.6)]"
          : "border-slate-200 bg-white"
      )}
    >
      {highlighted ? (
        <span className="absolute -top-3.5 start-8 rounded-full bg-gradient-to-l from-[#12b5a6] to-[#2563eb] px-3.5 py-1 text-[12.5px] font-extrabold text-white">
          الأكثر طلبًا
        </span>
      ) : null}
      <h3 className={cn("text-xl font-extrabold", highlighted ? "text-white" : "text-[#0b1738]")}>
        {title}
      </h3>

      <div className="mt-5 min-h-[60px]">
        {isFree ? (
          <>
            <span className="text-4xl font-black tracking-tight text-emerald-600">مجانًا</span>
            <p className="mt-1 text-[14px] font-bold text-emerald-700">
              {freeLabel(entry.freeDays)} عند التفعيل
            </p>
          </>
        ) : isContact ? (
          <span className="text-3xl font-black">تواصل معنا</span>
        ) : price === null ? (
          <span className="text-2xl font-black">متاح بالاشتراك الشهري فقط</span>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black tracking-tight">{sar(price)}</span>
            <span className={cn("text-[15px] font-bold", muted)}>
              ر.س / {interval === "yearly" ? "سنة" : "شهر"}
            </span>
          </div>
        )}
      </div>
      <p
        className={cn(
          "mt-2 h-5 text-[13px] font-bold",
          highlighted ? "text-[#5eead4]" : "text-emerald-600"
        )}
      >
        {saving > 0 ? `توفّر ${sar(saving)} ر.س مقارنة بالدفع الشهري` : ""}
      </p>

      <ul className="mt-6 flex-1 space-y-3">
        {(pkg?.features ?? []).map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[15px] font-semibold">
            <Check
              className={cn(
                "mt-0.5 size-5 shrink-0",
                highlighted ? "text-[#5eead4]" : "text-[#12b5a6]"
              )}
              strokeWidth={3}
            />
            {feature}
          </li>
        ))}
      </ul>

      {isContact ? (
        <Link
          href={ROUTES.contactSales}
          className="mt-8 rounded-full bg-slate-100 py-3.5 text-center text-[15px] font-bold text-[#0b1738] transition-all hover:-translate-y-px hover:bg-slate-200"
        >
          تحدث مع المبيعات
        </Link>
      ) : (
        <a
          href={MADAR_REGISTER_URL}
          className={cn(
            "mt-8 rounded-full py-3.5 text-center text-[15px] font-bold transition-all hover:-translate-y-px",
            highlighted || single
              ? "bg-[#2878ff] text-white hover:bg-[#1f63d6]"
              : "bg-slate-100 text-[#0b1738] hover:bg-slate-200"
          )}
        >
          {isFree ? "فعّله مجانًا" : "ابدأ التجربة المجانية"}
        </a>
      )}
    </div>
  )
}

export function PricingSection({ pricing }: { pricing: PublicApplicationPricing[] }) {
  const visible = pricing.filter((entry) => !HIDDEN.includes(entry.application))
  const tabs = MAIN_APPS.map((app) => visible.find((entry) => entry.application === app)).filter(
    (entry): entry is PublicApplicationPricing => Boolean(entry)
  )
  const extras = visible.filter(
    (entry) =>
      !MAIN_APPS.includes(entry.application) &&
      (entry.mode === "free" || entry.mode === "contact" || entry.packages.length > 0)
  )
  const complete = pricing.find((entry) => entry.application === "madarComplete")

  const [selectedApp, setSelectedApp] = useState(tabs[0]?.application ?? extras[0]?.application)
  const [interval, setBillingInterval] = useState<Interval>("monthly")
  const plansRef = useRef<HTMLDivElement>(null)

  const current = visible.find((entry) => entry.application === selectedApp) ?? tabs[0]
  const packages = current ? offeredPackages(current) : []
  const hasYearly =
    current?.mode !== "free" && packages.some((pkg) => pkg.yearlyPriceHalalas !== null)
  const activeInterval: Interval = hasYearly ? interval : "monthly"
  const single = packages.length <= 1

  // Picking an extra app shows its plan where the main plans are.
  function showExtra(application: string) {
    setSelectedApp(application)
    plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <section id="pricing" className="scroll-mt-24 bg-white py-24 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-[#2878ff]">الأسعار</p>
          <h2 className="mt-3 text-3xl leading-tight font-black text-[#0b1738] sm:text-[42px]">
            ادفع على قد احتياجك
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            كل تطبيق باشتراكه، شهري أو سنوي، مع تجربة مجانية ٧ أيام للتطبيقات المدفوعة. الأسعار
            بالريال السعودي.
          </p>
        </div>

        <div ref={plansRef} className="scroll-mt-28">
          <div className="mt-12 flex flex-col items-center gap-4">
            <div
              role="tablist"
              aria-label="التطبيقات"
              className="flex flex-wrap justify-center gap-1 rounded-2xl bg-slate-100 p-1.5"
            >
              {tabs.map((entry) => (
                <button
                  key={entry.application}
                  type="button"
                  role="tab"
                  aria-selected={entry.application === current?.application}
                  onClick={() => setSelectedApp(entry.application)}
                  className={cn(
                    "rounded-xl px-5 py-2.5 text-[15px] font-bold transition-all",
                    entry.application === current?.application
                      ? "bg-white text-[#0b1738] shadow-sm"
                      : "text-slate-500 hover:text-[#0b1738]"
                  )}
                >
                  {APP_LABEL[entry.application] ?? entry.application}
                </button>
              ))}
            </div>
            {current && !MAIN_APPS.includes(current.application) ? (
              <p className="text-[14px] font-bold text-[#2878ff]">
                تعرض الآن: {APP_LABEL[current.application] ?? current.application}
              </p>
            ) : null}
            {hasYearly ? (
              <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1 text-[14px] font-bold">
                {(["monthly", "yearly"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setBillingInterval(option)}
                    className={cn(
                      "rounded-full px-5 py-2 transition-colors",
                      activeInterval === option
                        ? "bg-[#0b1738] text-white"
                        : "text-slate-500 hover:text-[#0b1738]"
                    )}
                  >
                    {option === "monthly" ? "شهري" : "سنوي"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {current ? (
            <div
              key={current.application}
              className={cn(
                "mx-auto mt-10 grid gap-6",
                single ? "max-w-md" : "max-w-6xl md:grid-cols-3"
              )}
            >
              {single ? (
                <PackageCard
                  entry={current}
                  pkg={packages[0] ?? null}
                  interval={activeInterval}
                  single
                />
              ) : (
                packages.map((pkg) => (
                  <PackageCard
                    key={pkg.name}
                    entry={current}
                    pkg={pkg}
                    interval={activeInterval}
                    single={false}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>

        {extras.length > 0 ? (
          <div className="mx-auto mt-14 max-w-6xl">
            <h3 className="mb-5 text-center text-lg font-extrabold text-[#0b1738]">
              تطبيقات إضافية
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map((entry) => {
                const first = offeredPackages(entry)[0]
                const isFree = entry.mode === "free"
                const isSelected = entry.application === current?.application
                return (
                  <button
                    key={entry.application}
                    type="button"
                    onClick={() => showExtra(entry.application)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-2xl border-2 bg-white p-5 text-start transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(11,23,56,0.35)]",
                      isSelected ? "border-[#2878ff]" : "border-slate-200"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl",
                          isFree ? "bg-emerald-50 text-emerald-600" : "bg-[#eef4ff] text-[#2878ff]"
                        )}
                      >
                        {isFree ? <Gift className="size-5" /> : <Sparkles className="size-5" />}
                      </span>
                      <span>
                        <span className="block text-[15.5px] font-extrabold text-[#0b1738]">
                          {APP_LABEL[entry.application] ?? entry.application}
                        </span>
                        <span className="text-[12.5px] font-semibold text-[#2878ff]">
                          عرض التفاصيل
                        </span>
                      </span>
                    </span>
                    <span className="text-end text-[14px] font-bold text-[#0b1738]">
                      {isFree
                        ? freeLabel(entry.freeDays)
                        : entry.mode === "contact" || !first
                          ? "تواصل معنا"
                          : first.monthlyPriceHalalas !== null
                            ? `${sar(first.monthlyPriceHalalas)} ر.س / شهر`
                            : first.yearlyPriceHalalas !== null
                              ? `${sar(first.yearlyPriceHalalas)} ر.س / سنة`
                              : "تواصل معنا"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {complete ? (
          <div className="relative mx-auto mt-14 max-w-6xl overflow-hidden rounded-[32px] bg-gradient-to-l from-[#0f766e] via-[#1d4ed8] to-[#0b1738] p-8 text-white sm:p-12">
            <div
              aria-hidden
              className="absolute -top-24 -start-24 size-72 rounded-full bg-white/10 blur-3xl"
            />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-[13px] font-extrabold">
                  <Crown className="size-4" /> مدار الكامل
                </span>
                <h3 className="mt-4 text-3xl font-black">كل تطبيقات مدار في اشتراك واحد</h3>
                <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  {(complete.packages[0]?.features.length
                    ? complete.packages[0].features
                    : ["جميع التطبيقات الحالية والمستقبلية"]
                  ).map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-[15px] font-semibold">
                      <Check className="size-4 text-[#5eead4]" strokeWidth={3} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl bg-white/10 p-6 text-center backdrop-blur">
                {complete.packages[0]?.monthlyPriceHalalas ? (
                  <>
                    <p className="text-5xl font-black">
                      {sar(complete.packages[0].monthlyPriceHalalas)}
                    </p>
                    <p className="mt-1 text-[15px] font-bold text-slate-200">ر.س / شهر</p>
                    {complete.packages[0].yearlyPriceHalalas ? (
                      <p className="mt-2 text-[14px] font-semibold text-[#99f6e4]">
                        أو {sar(complete.packages[0].yearlyPriceHalalas)} ر.س سنويًا
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-2xl font-black">تواصل معنا للسعر</p>
                )}
                <a
                  href={MADAR_REGISTER_URL}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] font-extrabold text-[#0b1738] transition-transform hover:-translate-y-px"
                >
                  ابدأ الآن
                  <ArrowLeft className="size-4" />
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
