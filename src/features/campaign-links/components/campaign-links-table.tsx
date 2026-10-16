"use client"

import { useLocale, useTranslations } from "next-intl"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2Off,
  MoreVertical,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react"

import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import type { CampaignLinkSummaryRecord } from "../services/link-list.service"

import { type Locale } from "@/i18n/locales"

interface CampaignLinksTableProps {
  rows: CampaignLinkSummaryRecord[]
  campaignNameById: Record<string, string>
  selectedRowId: string | null
  onOpenDetail: (row: CampaignLinkSummaryRecord) => void
  onEdit: (row: CampaignLinkSummaryRecord) => void
  onToggleEnabled: (row: CampaignLinkSummaryRecord) => void
  onDelete: (row: CampaignLinkSummaryRecord) => void
  onCopyLink: (row: CampaignLinkSummaryRecord) => void
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCurrency(value: number, locale: Locale): string {
  const amount = formatMoney(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

function formatCreatedAt(iso: string, locale: Locale) {
  const date = new Date(iso)
  const intlLocale = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US"
  return {
    dateLabel: date.toLocaleDateString(intlLocale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    timeLabel: date.toLocaleTimeString(intlLocale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  }
}

function StatusPill({ enabled }: { enabled: boolean }) {
  const t = useTranslations("campaignLinks.table")
  return (
    <span
      className={
        enabled
          ? "inline-flex items-center gap-1.5 rounded-lg bg-[#10B981]/10 px-2.5 py-1 text-xs font-medium text-[#10B981]"
          : "inline-flex items-center gap-1.5 rounded-lg bg-[#F8FAFC] px-2.5 py-1 text-xs font-medium text-[#64748B]"
      }
    >
      {enabled ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
      {enabled ? t("status.enabled") : t("status.disabled")}
    </span>
  )
}

const HEAD_CLASSNAME = "text-xs font-semibold text-[#64748B]"
const CELL_CLASSNAME = "text-sm text-[#172033]"

export function CampaignLinksTable({
  rows,
  campaignNameById,
  selectedRowId,
  onOpenDetail,
  onEdit,
  onToggleEnabled,
  onDelete,
  onCopyLink,
}: CampaignLinksTableProps) {
  const t = useTranslations("campaignLinks.table")
  const locale = useLocale() as Locale
  return (
    <AppTable>
      <AppTableHeader>
        <AppTableRow className="border-[#E2E8F0] hover:bg-transparent">
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.link")}</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.campaign")}</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.status")}</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.clicks")}</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.orders")}</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.revenue")}</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>{t("headers.createdAt")}</AppTableHead>
          <AppTableHead className={`${HEAD_CLASSNAME} w-10`}>{t("headers.actions")}</AppTableHead>
        </AppTableRow>
      </AppTableHeader>
      <AppTableBody>
        {rows.map((row) => {
          const created = formatCreatedAt(row.createdAt, locale)
          return (
            <AppTableRow
              key={row.id}
              className={
                row.id === selectedRowId
                  ? "cursor-pointer border-[#E2E8F0] bg-[#F8FAFC]"
                  : "cursor-pointer border-[#E2E8F0] hover:bg-[#F8FAFC]/60"
              }
              onClick={() => onOpenDetail(row)}
            >
              <AppTableCell className={CELL_CLASSNAME}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-[#4F46E5]">
                    <a
                      href={row.shortUrl ?? row.finalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={t("openLinkAria")}
                      className="shrink-0 cursor-pointer text-[#4F46E5] hover:text-[#4338CA]"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                    <span className="truncate">{row.name}</span>
                  </p>
                  <p className="truncate text-xs text-[#64748B]">{row.displayId}</p>
                </div>
              </AppTableCell>
              <AppTableCell className={`${CELL_CLASSNAME} text-[#64748B]`}>
                {campaignNameById[row.campaignId] ?? "—"}
              </AppTableCell>
              <AppTableCell>
                <StatusPill enabled={row.enabled} />
              </AppTableCell>
              <AppTableCell className={CELL_CLASSNAME}>{row.clicks ?? 0}</AppTableCell>
              <AppTableCell className={CELL_CLASSNAME}>{row.ordersCount ?? 0}</AppTableCell>
              <AppTableCell className={CELL_CLASSNAME}>
                {formatCurrency(row.revenue ?? 0, locale)}
              </AppTableCell>
              <AppTableCell className={`${CELL_CLASSNAME} text-[#64748B]`}>
                <p>{created.dateLabel}</p>
                <p className="text-xs">{created.timeLabel}</p>
              </AppTableCell>
              <AppTableCell onClick={(event) => event.stopPropagation()}>
                <AppDropdownMenu>
                  <AppDropdownMenuTrigger asChild>
                    <AppButton
                      variant="ghost"
                      size="icon"
                      aria-label={t("actionsAria")}
                      className="text-[#64748B] hover:bg-[#F8FAFC]"
                    >
                      <MoreVertical className="size-4" />
                    </AppButton>
                  </AppDropdownMenuTrigger>
                  <AppDropdownMenuContent align="end">
                    <AppDropdownMenuItem onClick={() => onCopyLink(row)}>
                      <Copy className="size-4" />
                      {t("actionsMenu.copyLink")}
                    </AppDropdownMenuItem>
                    {/* setTimeout defers opening the dialog until after the dropdown menu has
                    fully unmounted -- opening it synchronously races Radix's own pointer-events
                    lock on <body>, which can leave the page unclickable after the dialog closes. */}
                    <AppDropdownMenuItem onClick={() => setTimeout(() => onEdit(row), 0)}>
                      <Pencil className="size-4" />
                      {t("actionsMenu.edit")}
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem onClick={() => onToggleEnabled(row)}>
                      {row.enabled ? (
                        <>
                          <Link2Off className="size-4" />
                          {t("actionsMenu.disable")}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4" />
                          {t("actionsMenu.enable")}
                        </>
                      )}
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem
                      onClick={() => setTimeout(() => onDelete(row), 0)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      {t("actionsMenu.delete")}
                    </AppDropdownMenuItem>
                  </AppDropdownMenuContent>
                </AppDropdownMenu>
              </AppTableCell>
            </AppTableRow>
          )
        })}
      </AppTableBody>
    </AppTable>
  )
}
