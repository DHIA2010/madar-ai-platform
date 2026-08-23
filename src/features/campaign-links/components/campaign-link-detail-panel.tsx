"use client"

import { useEffect, useState } from "react"
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

interface CampaignLinkDetailPanelProps {
  link: CampaignLinkSummaryRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatCurrency(value: number, currency = "SAR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

const MATCH_METHOD_LABELS: Record<string, string> = {
  explicit_id: "Explicit ID",
  campaign_link_id: "Link ID",
  session_id: "Session",
  customer_ref: "Returning customer",
  utm_match: "UTM match",
  unattributed: "Unattributed",
}

export function CampaignLinkDetailPanel({
  link,
  open,
  onOpenChange,
}: CampaignLinkDetailPanelProps) {
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
        <AppEmpty
          title="No activity yet"
          description="Clicks and orders will appear here once this link starts getting traffic."
        />
      ) : (
        <div className="space-y-6 overflow-y-auto">
          {detail.byMatchMethod.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Attribution breakdown
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.byMatchMethod.map((row) => (
                  <AppBadge key={row.matchMethod} variant="outline">
                    {MATCH_METHOD_LABELS[row.matchMethod] ?? row.matchMethod}:{" "}
                    {row.ordersCount ?? 0} orders ({formatCurrency(row.revenue ?? 0)})
                  </AppBadge>
                ))}
              </div>
            </div>
          ) : null}

          {detail.daily.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Daily performance</p>
              <AppTable>
                <AppTableHeader>
                  <AppTableRow>
                    <AppTableHead>Date</AppTableHead>
                    <AppTableHead>Clicks</AppTableHead>
                    <AppTableHead>Orders</AppTableHead>
                    <AppTableHead>Revenue</AppTableHead>
                  </AppTableRow>
                </AppTableHeader>
                <AppTableBody>
                  {detail.daily.map((point) => (
                    <AppTableRow key={point.metricDate}>
                      <AppTableCell>{point.metricDate}</AppTableCell>
                      <AppTableCell>{point.clicks ?? 0}</AppTableCell>
                      <AppTableCell>{point.ordersCount ?? 0}</AppTableCell>
                      <AppTableCell>
                        {formatCurrency(point.revenue ?? 0, point.currency ?? "SAR")}
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
