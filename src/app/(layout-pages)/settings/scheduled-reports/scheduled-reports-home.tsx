"use client"

// التقارير المجدولة على واتساب -- the categories (one per app, plus reports across all of them).
// Picking one lists the reports that can be scheduled for it.

import Link from "next/link"
import { ChevronLeft, MessageCircle } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

import { CATEGORY_META, categoryHref, REPORT_CATEGORIES } from "./catalog"

export function ScheduledReportsHome() {
  const t = useTranslations("settings.scheduledReports")
  const locale = useLocale() as Locale

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-6">
      <div className="flex items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[#25D366] text-white shadow-[0_6px_16px_rgba(37,211,102,0.25)]">
          <MessageCircle className="size-6" />
        </span>
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-[#0b1738]">{t("title")}</h1>
          <p className="mt-1 max-w-[640px] text-[13px] leading-6 text-[#667085]">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_CATEGORIES.map((category) => {
          const meta = CATEGORY_META[category]
          const Icon = meta.icon
          const count = meta.templates.length
          return (
            <Link
              key={category}
              href={categoryHref(category)}
              className={cn(
                "group flex flex-col gap-4 rounded-2xl border border-[#E8EBF0] bg-white p-5 shadow-[0_2px_10px_rgba(16,42,92,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(16,42,92,0.08)]",
                meta.accent
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-[14px]",
                    meta.tile
                  )}
                >
                  <Icon className="size-6" />
                </span>
                {count > 0 ? (
                  <span className="rounded-full bg-[#e7f8ee] px-2.5 py-1 text-[11px] font-bold text-[#137a41]">
                    {t("count", { count })}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-bold text-[#667085]">
                    {t("soon")}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-[16px] font-extrabold text-[#0b1738]">
                  {t(`categories.${category}.name`)}
                </p>
                <p className="mt-1 text-[12.5px] leading-6 text-[#667085]">
                  {t(`categories.${category}.description`)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[12.5px] font-bold text-[#2563eb]">
                {t("open")}
                <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
