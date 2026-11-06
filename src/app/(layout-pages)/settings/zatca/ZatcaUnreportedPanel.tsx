"use client"

// Signed sales and returns ZATCA hasn't accepted yet. Every one is sent automatically right after
// it's saved and retried in the background (backend pos/zatca-reporting.ts); this lists what's
// still waiting -- with ZATCA's reason when it refused one -- and sends them all again in one click.

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/locales"
import { zatcaService, type ZatcaUnreportedDocument } from "@/features/pos/services/zatca.service"

import { Button } from "@/components/ui/button"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatAmount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function ZatcaUnreportedPanel() {
  const t = useTranslations("settings.zatca.unreported")
  const locale = useLocale() as Locale
  const [items, setItems] = useState<ZatcaUnreportedDocument[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoadFailed(false)
    try {
      setItems(await zatcaService.listUnreported())
    } catch {
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const reportAll = async () => {
    setSending(true)
    try {
      const result = await zatcaService.reportAll()
      const notSent = result.rejected + result.failed
      if (notSent === 0) toast.success(t("toasts.allReported", { count: result.reported }))
      else
        toast.warning(t("toasts.someLeft", { reported: result.reported, left: notSent }), {
          description: t("toasts.someLeftDescription"),
        })
    } catch {
      toast.error(t("toasts.failed"))
    } finally {
      setSending(false)
      await load()
    }
  }

  if (loadFailed) {
    return (
      <section className={cn(PANEL, "flex items-center justify-between gap-3 p-5")}>
        <p className={cn("text-[13px]", HEADING)}>{t("loadError")}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          {t("retry")}
        </Button>
      </section>
    )
  }

  if (items === null) {
    return (
      <section className={cn(PANEL, "flex items-center gap-2 p-5 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className={cn(PANEL, "flex items-center gap-2.5 p-5")}>
        <CheckCircle2 className="size-5 shrink-0 text-[#1f9d55]" />
        <div>
          <p className={cn("text-[13px] font-bold", HEADING)}>{t("allClearTitle")}</p>
          <p className={cn("text-[12px]", MUTED)}>{t("allClearDescription")}</p>
        </div>
      </section>
    )
  }

  return (
    <section className={cn(PANEL, "flex flex-col gap-4 p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={cn("text-[15px] font-extrabold", HEADING)}>
            {t("title", { count: items.length })}
          </h2>
          <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("description")}</p>
        </div>
        <Button
          className="h-10 gap-2 rounded-[10px] bg-[#1f9d55] px-4 text-[12.5px] font-bold text-white hover:bg-[#188045]"
          disabled={sending}
          onClick={() => void reportAll()}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t("reportAll")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className={cn("border-b border-[#eef2f8] text-start", MUTED)}>
              <th className="px-2 py-2 text-start font-semibold">{t("columns.number")}</th>
              <th className="px-2 py-2 text-start font-semibold">{t("columns.type")}</th>
              <th className="px-2 py-2 text-start font-semibold">{t("columns.date")}</th>
              <th className="px-2 py-2 text-start font-semibold">{t("columns.total")}</th>
              <th className="px-2 py-2 text-start font-semibold">{t("columns.status")}</th>
              <th className="px-2 py-2 text-start font-semibold">{t("columns.reason")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const refused = item.zatcaStatus === "NOT_REPORTED"
              return (
                <tr key={`${item.kind}-${item.id}`} className="border-b border-[#f2f4f8] align-top">
                  <td className={cn("px-2 py-2.5 font-bold", HEADING)}>{item.number}</td>
                  <td className={cn("px-2 py-2.5", HEADING)}>
                    {item.kind === "invoice" ? t("types.invoice") : t("types.return")}
                  </td>
                  <td className={cn("whitespace-nowrap px-2 py-2.5", MUTED)}>
                    {formatDate(item.createdAt, locale)}
                  </td>
                  <td className={cn("whitespace-nowrap px-2 py-2.5", HEADING)}>
                    {formatAmount(item.totalAmount, locale)}
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold",
                        refused ? "bg-[#fdecec] text-[#d92d20]" : "bg-[#fff6e5] text-[#b45309]"
                      )}
                    >
                      {refused
                        ? t("statuses.refused")
                        : item.attempts > 0
                          ? t("statuses.failed", { attempts: item.attempts })
                          : t("statuses.pending")}
                    </span>
                  </td>
                  <td className={cn("max-w-[320px] px-2 py-2.5 leading-5", MUTED)}>
                    {(locale === "ar" ? item.lastErrorAr : null) ?? item.lastError ?? "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
