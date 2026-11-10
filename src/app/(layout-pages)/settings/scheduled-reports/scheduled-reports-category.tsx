"use client"

// One category of التقارير المجدولة: the reports that can be scheduled for that app. Each card
// says whether the report is on and when it goes out; the rest of the category is coming soon.

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, Clock, Crown, Sparkles } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import {
  dailyReportService,
  type DailyReportSettings,
} from "@/features/settings/services/daily-report.service"

import { CATEGORY_META, type ReportCategory } from "./catalog"

export function ReportsBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
      {items.map((item, index) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {index > 0 ? <ChevronLeft className="size-3.5 text-[#98A2B3] ltr:rotate-180" /> : null}
          {item.href ? (
            <Link href={item.href} className="text-[#667085] hover:text-[#2563eb]">
              {item.label}
            </Link>
          ) : (
            <span className="text-[#0b1738]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function ScheduledReportsCategory({ category }: { category: ReportCategory }) {
  const t = useTranslations("settings.scheduledReports")
  const locale = useLocale() as Locale
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const [dailyReport, setDailyReport] = useState<DailyReportSettings | null>(null)

  useEffect(() => {
    if (!meta.templates.some((template) => template.key === "daily-report")) return
    dailyReportService
      .get()
      .then((overview) => setDailyReport(overview.settings))
      .catch(() => setDailyReport(null))
  }, [meta.templates])

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5">
      <ReportsBreadcrumb
        items={[
          { label: t("title"), href: ROUTES.settingsScheduledReports },
          { label: t(`categories.${category}.name`) },
        ]}
      />

      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-[14px]",
            meta.tile
          )}
        >
          <Icon className="size-6" />
        </span>
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-[#0b1738]">
            {t(`categories.${category}.name`)}
          </h1>
          <p className="mt-1 text-[13px] text-[#667085]">
            {t(`categories.${category}.description`)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {meta.templates.map((template) => {
          const TemplateIcon = template.icon
          const on = Boolean(dailyReport?.enabled)
          const times = dailyReport?.coverage.map((entry) => entry.sendTime).join("، ")
          return (
            <Link
              key={template.key}
              href={template.href}
              className="group flex flex-col gap-4 rounded-2xl border border-[#E8EBF0] bg-white p-5 shadow-[0_2px_10px_rgba(16,42,92,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#bcd2ff] hover:shadow-[0_10px_24px_rgba(16,42,92,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-[12px] bg-[#e7f8ee] text-[#1a9e55]">
                  <TemplateIcon className="size-5" />
                </span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {dailyReport ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-bold",
                        on ? "bg-[#e7f8ee] text-[#137a41]" : "bg-[#f2f4f7] text-[#667085]"
                      )}
                    >
                      {on ? t("status.on") : t("status.off")}
                    </span>
                  ) : null}
                  {dailyReport ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                        dailyReport.plan.paid
                          ? "bg-[#fef3c7] text-[#92400e]"
                          : "bg-[#eef4ff] text-[#1d4ed8]"
                      )}
                    >
                      {dailyReport.plan.paid ? <Crown className="size-3" /> : null}
                      {dailyReport.plan.paid ? t("plan.paid") : t("plan.free")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[16px] font-extrabold text-[#0b1738]">
                  {t(`templates.${template.key}.name`)}
                </p>
                <p className="mt-1 text-[12.5px] leading-6 text-[#667085]">
                  {t(`templates.${template.key}.description`)}
                </p>
                {on && times ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#1a7f4b]">
                    <Clock className="size-3.5" />
                    {t("sendsAt", { times })}
                  </p>
                ) : null}
              </div>
              <span className="flex items-center gap-1 text-[12.5px] font-bold text-[#2563eb]">
                {t("setUp")}
                <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}

        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d7deea] bg-[#fafbfc] p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#98A2B3] shadow-[0_1px_3px_rgba(16,42,92,0.08)]">
            <Sparkles className="size-5" />
          </span>
          <p className="text-[13.5px] font-bold text-[#344054]">
            {meta.templates.length > 0 ? t("moreSoon.title") : t("emptySoon.title")}
          </p>
          <p className="max-w-[320px] text-[12px] leading-5 text-[#667085]">
            {meta.templates.length > 0 ? t("moreSoon.body") : t("emptySoon.body")}
          </p>
        </div>
      </div>
    </div>
  )
}
