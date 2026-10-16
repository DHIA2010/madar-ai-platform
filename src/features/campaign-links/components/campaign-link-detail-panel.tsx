"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"

import {
  AppBadge,
  AppDrawer,
  AppEmpty,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  type CampaignLinkAttributionDetailRecord,
  type CampaignLinkSummaryRecord,
  linkListService,
} from "../services/link-list.service"

import { type Locale } from "@/i18n/locales"

interface CampaignLinkDetailPanelProps {
  link: CampaignLinkSummaryRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type DetailPanelTranslator = ReturnType<typeof useTranslations<"campaignLinks.detailPanel">>

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Mirrors the suffix/prefix convention used across the app (ر.س for ar, SAR for en). Rows are
// always SAR in practice; a different currency code is shown as-is rather than guessed at.
function formatCurrency(value: number, locale: Locale, currency = "SAR"): string {
  const amount = formatMoney(value)
  if (locale === "ar") {
    return `${amount} ${currency === "SAR" ? "ر.س" : currency}`
  }
  return `${currency === "SAR" ? "SAR" : currency} ${amount}`
}

function formatMetricDate(value: string, locale: Locale): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

// Data-only: the real attribution match-method taxonomy lives in the backend's own enum.
// `matchMethodLabel` below pairs it with its translated display label, falling back to the raw
// key for anything not in this known set.
const KNOWN_MATCH_METHODS = new Set([
  "explicit_id",
  "campaign_link_id",
  "session_id",
  "customer_ref",
  "utm_match",
  "unattributed",
])

function matchMethodLabel(method: string, t: DetailPanelTranslator): string {
  if (!KNOWN_MATCH_METHODS.has(method)) return method
  return t(`matchMethods.${method}` as "matchMethods.explicit_id")
}

export function CampaignLinkDetailPanel({
  link,
  open,
  onOpenChange,
}: CampaignLinkDetailPanelProps) {
  const t = useTranslations("campaignLinks.detailPanel")
  const locale = useLocale() as Locale
  const [detail, setDetail] = useState<CampaignLinkAttributionDetailRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!open || !link) {
      return
    }

    let cancelled = false

    async function loadDetail(linkId: string) {
      setIsLoading(true)
      setDetail(null)
      try {
        const result = await linkListService.getCampaignLinkAttribution(linkId)
        if (!cancelled) {
          setDetail(result)
        }
      } catch {
        if (!cancelled) {
          setDetail(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDetail(link.id)

    return () => {
      cancelled = true
    }
  }, [open, link])

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={link?.name}
      description={link?.displayId}
      contentClassName="flex w-full flex-col sm:max-w-lg"
    >
      {!link ? null : isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !detail || (detail.daily.length === 0 && detail.byMatchMethod.length === 0) ? (
        <AppEmpty title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <div className="space-y-6 overflow-y-auto">
          {detail.byMatchMethod.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("attributionBreakdown")}
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.byMatchMethod.map((row) => (
                  <AppBadge key={row.matchMethod} variant="outline">
                    {t("matchMethodBadge", {
                      label: matchMethodLabel(row.matchMethod, t),
                      count: row.ordersCount ?? 0,
                      revenue: formatCurrency(row.revenue ?? 0, locale),
                    })}
                  </AppBadge>
                ))}
              </div>
            </div>
          ) : null}

          {detail.daily.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("dailyPerformance")}
              </p>
              <AppTable>
                <AppTableHeader>
                  <AppTableRow>
                    <AppTableHead>{t("tableHeaders.date")}</AppTableHead>
                    <AppTableHead>{t("tableHeaders.clicks")}</AppTableHead>
                    <AppTableHead>{t("tableHeaders.orders")}</AppTableHead>
                    <AppTableHead>{t("tableHeaders.revenue")}</AppTableHead>
                  </AppTableRow>
                </AppTableHeader>
                <AppTableBody>
                  {detail.daily.map((point) => (
                    <AppTableRow key={point.metricDate}>
                      <AppTableCell>{formatMetricDate(point.metricDate, locale)}</AppTableCell>
                      <AppTableCell>{point.clicks ?? 0}</AppTableCell>
                      <AppTableCell>{point.ordersCount ?? 0}</AppTableCell>
                      <AppTableCell>
                        {formatCurrency(point.revenue ?? 0, locale, point.currency ?? "SAR")}
                      </AppTableCell>
                    </AppTableRow>
                  ))}
                </AppTableBody>
              </AppTable>
            </div>
          ) : null}
        </div>
      )}
    </AppDrawer>
  )
}
