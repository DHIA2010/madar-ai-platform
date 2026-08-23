"use client"

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

function formatCurrency(value: number, currency = "SAR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCreatedAt(iso: string) {
  const date = new Date(iso)
  return {
    dateLabel: date.toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" }),
    timeLabel: date.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit", hour12: true }),
  }
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        enabled
          ? "inline-flex items-center gap-1.5 rounded-lg bg-[#10B981]/10 px-2.5 py-1 text-xs font-medium text-[#10B981]"
          : "inline-flex items-center gap-1.5 rounded-lg bg-[#F8FAFC] px-2.5 py-1 text-xs font-medium text-[#64748B]"
      }
    >
      {enabled ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
      {enabled ? "نشط" : "معطل"}
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
  return (
    <AppTable>
      <AppTableHeader>
        <AppTableRow className="border-[#E2E8F0] hover:bg-transparent">
          <AppTableHead className={HEAD_CLASSNAME}>الرابط</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>الحملة</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>الحالة</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>النقرات</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>الطلبات</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>الإيرادات</AppTableHead>
          <AppTableHead className={HEAD_CLASSNAME}>تاريخ الإنشاء</AppTableHead>
          <AppTableHead className={`${HEAD_CLASSNAME} w-10`}>الإجراءات</AppTableHead>
        </AppTableRow>
      </AppTableHeader>
      <AppTableBody>
        {rows.map((row) => {
          const created = formatCreatedAt(row.createdAt)
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
                      aria-label="فتح الرابط"
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
                {formatCurrency(row.revenue ?? 0)}
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
                      aria-label="الإجراءات"
                      className="text-[#64748B] hover:bg-[#F8FAFC]"
                    >
                      <MoreVertical className="size-4" />
                    </AppButton>
                  </AppDropdownMenuTrigger>
                  <AppDropdownMenuContent align="end">
                    <AppDropdownMenuItem onClick={() => onCopyLink(row)}>
                      <Copy className="size-4" />
                      نسخ الرابط
                    </AppDropdownMenuItem>
                    {/* setTimeout defers opening the dialog until after the dropdown menu has
                    fully unmounted -- opening it synchronously races Radix's own pointer-events
                    lock on <body>, which can leave the page unclickable after the dialog closes. */}
                    <AppDropdownMenuItem onClick={() => setTimeout(() => onEdit(row), 0)}>
                      <Pencil className="size-4" />
                      تعديل
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem onClick={() => onToggleEnabled(row)}>
                      {row.enabled ? (
                        <>
                          <Link2Off className="size-4" />
                          تعطيل
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4" />
                          تفعيل
                        </>
                      )}
                    </AppDropdownMenuItem>
                    <AppDropdownMenuItem
                      onClick={() => setTimeout(() => onDelete(row), 0)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      حذف
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
