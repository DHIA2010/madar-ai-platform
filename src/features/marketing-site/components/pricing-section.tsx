"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, Check, Crown, Gift, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

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

// Apps sold in tiers, in the order their tabs appear ("madarApps" is a retired bundle).
const TAB_ORDER = ["pos", "ecommerce", "advertising", "customReports", "ai"]

type Interval = "monthly" | "yearly"

const sar = (halalas: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(halalas / 100)

function priceOf(pkg: PublicPackage, interval: Interval) {
  return interval === "yearly" ? pkg.yearlyPriceHalalas : pkg.monthlyPriceHalalas
}

function freeLabel(days: number | null) {
  if (!days || days >= 365) return "مجانًا لمدة سنة"
  return `مجانًا لمدة ${days} يومًا`
}

export function PricingSection({ pricing }: { pricing: PublicApplicationPricing[] }) {
  const tiered = useMemo(
    () =>
      pricing
        .filter(
          (entry) =>
            entry.mode === "packages" &&
            entry.packages.length > 1 &&
            TAB_ORDER.includes(entry.application)
        )
        .sort(
          (left, right) =>
            TAB_ORDER.indexOf(left.application) - TAB_ORDER.indexOf(right.application)
        ),
    [pricing]
  )
  const extras = pricing.filter(
    (entry) =>
      entry.application !== "madarComplete" &&
      entry.application !== "madarApps" &&
      !tiered.includes(entry) &&
      (entry.mode === "free" || entry.packages.length > 0)
  )
  const complete = pricing.find((entry) => entry.application === "madarComplete")

  const [selected, setSelected] = useState(tiered[0]?.application ?? "")
  const [interval, setBillingInterval] = useState<Interval>("monthly")
  const current = tiered.find((entry) => entry.application === selected) ?? tiered[0]
  const hasYearly = current?.packages.some((p) => p.yearlyPriceHalalas !== null) ?? false
  const activeInterval: Interval = hasYearly ? interval : "monthly"

  return (
    <section id="pricing" className="scroll-mt-20 bg-white py-24 sm:py-28">
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

        {current ? (
          <>
            <div className="mt-12 flex flex-col items-center gap-4">
              <div
                role="tablist"
                className="flex flex-wrap justify-center gap-1 rounded-2xl bg-slate-100 p-1.5"
              >
                {tiered.map((entry) => (
                  <button
                    key={entry.application}
                    type="button"
                    role="tab"
                    aria-selected={entry.application === current.application}
                    onClick={() => setSelected(entry.application)}
                    className={cn(
                      "rounded-xl px-4 py-2.5 text-[14.5px] font-bold transition-all",
                      entry.application === current.application
                        ? "bg-white text-[#0b1738] shadow-sm"
                        : "text-slate-500 hover:text-[#0b1738]"
                    )}
                  >
                    {APP_LABEL[entry.application] ?? entry.application}
                  </button>
                ))}
              </div>
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

            <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-3">
              {current.packages.map((pkg) => {
                const price = priceOf(pkg, activeInterval)
                const monthly = pkg.monthlyPriceHalalas
                const saving =
                  activeInterval === "yearly" && price !== null && monthly !== null
                    ? monthly * 12 - price
                    : 0
                return (
                  <div
                    key={pkg.name}
                    className={cn(
                      "relative flex flex-col rounded-3xl border p-8",
                      pkg.isRecommended
                        ? "border-transparent bg-[#0b1738] text-white shadow-[0_30px_70px_-25px_rgba(11,23,56,0.6)]"
                        : "border-slate-200 bg-white"
                    )}
                  >
                    {pkg.isRecommended ? (
                      <span className="absolute -top-3.5 start-8 rounded-full bg-gradient-to-l from-[#12b5a6] to-[#2563eb] px-3.5 py-1 text-[12.5px] font-extrabold text-white">
                        الأكثر طلبًا
                      </span>
                    ) : null}
                    <h3
                      className={cn(
                        "text-xl font-extrabold",
                        pkg.isRecommended ? "text-white" : "text-[#0b1738]"
                      )}
                    >
                      {PACKAGE_LABEL[pkg.name] ?? pkg.name}
                    </h3>
                    <div className="mt-5 flex items-baseline gap-2">
                      {price === null ? (
                        <span className="text-2xl font-black">غير متاح سنويًا</span>
                      ) : (
                        <>
                          <span className="text-5xl font-black tracking-tight">{sar(price)}</span>
                          <span
                            className={cn(
                              "text-[15px] font-bold",
                              pkg.isRecommended ? "text-slate-300" : "text-slate-500"
                            )}
                          >
                            ر.س / {activeInterval === "yearly" ? "سنة" : "شهر"}
                          </span>
                        </>
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-2 h-5 text-[13px] font-bold",
                        pkg.isRecommended ? "text-[#5eead4]" : "text-emerald-600"
                      )}
                    >
                      {saving > 0 ? `توفّر ${sar(saving)} ر.س مقارنة بالدفع الشهري` : ""}
                    </p>
                    <ul className="mt-6 flex-1 space-y-3">
                      {pkg.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-[15px] font-semibold"
                        >
                          <Check
                            className={cn(
                              "mt-0.5 size-5 shrink-0",
                              pkg.isRecommended ? "text-[#5eead4]" : "text-[#12b5a6]"
                            )}
                            strokeWidth={3}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <a
                      href={MADAR_REGISTER_URL}
                      className={cn(
                        "mt-8 rounded-full py-3.5 text-center text-[15px] font-bold transition-all hover:-translate-y-px",
                        pkg.isRecommended
                          ? "bg-[#2878ff] text-white hover:bg-[#1f63d6]"
                          : "bg-slate-100 text-[#0b1738] hover:bg-slate-200"
                      )}
                    >
                      ابدأ التجربة المجانية
                    </a>
                  </div>
                )
              })}
            </div>
          </>
        ) : null}

        {extras.length > 0 ? (
          <div className="mx-auto mt-14 max-w-6xl">
            <h3 className="mb-5 text-center text-lg font-extrabold text-[#0b1738]">
              تطبيقات إضافية
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {extras.map((entry) => {
                const first = entry.packages[0]
                const isFree = entry.mode === "free"
                return (
                  <div
                    key={entry.application}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl",
                          isFree ? "bg-emerald-50 text-emerald-600" : "bg-[#eef4ff] text-[#2878ff]"
                        )}
                      >
                        {isFree ? <Gift className="size-5" /> : <Sparkles className="size-5" />}
                      </span>
                      <span className="text-[15.5px] font-extrabold text-[#0b1738]">
                        {APP_LABEL[entry.application] ?? entry.application}
                      </span>
                    </div>
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
                  </div>
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
