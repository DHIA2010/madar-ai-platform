"use client"

import { useTranslations } from "next-intl"
import { CloudOff, RefreshCw, Trash2, WifiOff } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton, AppPopover, AppPopoverContent, AppPopoverTrigger } from "@/components/app"

import type { PendingInvoiceRecord } from "./db"

export interface PendingSalesIndicatorProps {
  pending: PendingInvoiceRecord[]
  pendingCount: number
  failedCount: number
  isOnline: boolean
  onFlushNow: () => void
  onDiscard: (localId: string) => void
}

export function PendingSalesIndicator({
  pending,
  pendingCount,
  failedCount,
  isOnline,
  onFlushNow,
  onDiscard,
}: PendingSalesIndicatorProps) {
  const t = useTranslations("pos.cashier.offlineQueue")

  if (pending.length === 0 && isOnline) return null

  return (
    <AppPopover>
      <AppPopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold",
            failedCount > 0
              ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
              : pending.length > 0
                ? "border-[#fde68a] bg-[#fffbeb] text-[#92400e]"
                : "border-[#e8edf3] bg-[#f4f7fc] text-[#5b6b85]"
          )}
        >
          {isOnline ? <CloudOff className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {!isOnline && t("offline")}
          {pendingCount > 0 && <span>{t("pendingCount", { count: pendingCount })}</span>}
        </button>
      </AppPopoverTrigger>
      <AppPopoverContent align="end" className="w-80 p-0">
        <div className="max-h-96 overflow-y-auto p-3">
          <p className="mb-2 text-[12px] font-bold text-[#0d1b3e]">{t("title")}</p>
          {pending.length === 0 ? (
            <p className="py-4 text-center text-[11.5px] text-[#8098b4]">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((item) => (
                <li
                  key={item.localId}
                  className="rounded-[10px] border border-[#e8edf3] bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] font-semibold text-[#0d1b3e]">
                      {item.payload.items.length > 0
                        ? item.payload.items[0].productName
                        : t("sale")}
                      {item.payload.items.length > 1 ? ` +${item.payload.items.length - 1}` : ""}
                    </span>
                    <span className="text-[11px] font-bold text-[#2563eb]">
                      {item.status === "failed" ? t("statusFailed") : t("statusPending")}
                    </span>
                  </div>
                  {item.lastError ? (
                    <p className="mt-1 text-[10.5px] text-[#b91c1c]">{item.lastError}</p>
                  ) : null}
                  {item.status === "failed" ? (
                    <AppButton
                      type="button"
                      variant="outline"
                      size="sm"
                      icon={<Trash2 className="size-3" />}
                      onClick={() => onDiscard(item.localId)}
                      className="mt-1.5 h-7 w-full rounded-[8px] text-[11px] text-[#b91c1c]"
                    >
                      {t("discard")}
                    </AppButton>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        {pending.length > 0 ? (
          <div className="border-t border-[#eef1f6] p-2">
            <AppButton
              type="button"
              variant="outline"
              icon={<RefreshCw className="size-3.5" />}
              onClick={onFlushNow}
              disabled={!isOnline}
              className="h-8 w-full rounded-[8px] text-[11.5px]"
            >
              {t("syncNow")}
            </AppButton>
          </div>
        ) : null}
      </AppPopoverContent>
    </AppPopover>
  )
}
