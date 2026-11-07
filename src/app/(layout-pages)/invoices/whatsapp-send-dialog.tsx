"use client"

// Sending a sale's receipt to the customer on WhatsApp, as a PDF (backend whatsapp/
// invoice-sender.ts). Shows every earlier send of this invoice and where it stands -- sent,
// delivered, read, or failed with WhatsApp's reason.

import { useCallback, useEffect, useState } from "react"
import { CheckCheck, Loader2, Send } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { localeDirection, type Locale } from "@/i18n/locales"
import {
  type InvoiceWhatsAppMessage,
  posInvoicesService,
} from "@/features/pos/services/pos-invoices.service"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const STATUS_TINT: Record<InvoiceWhatsAppMessage["status"], string> = {
  sent: "bg-[#eef4ff] text-[#2878ff]",
  delivered: "bg-[#e9f8ef] text-[#1f9d55]",
  read: "bg-[#e9f8ef] text-[#1f9d55]",
  failed: "bg-[#fdecec] text-[#d92d20]",
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function WhatsAppSendDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: { id: string; invoiceNumber: string; customerPhone: string | null }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("invoices.whatsapp")
  const locale = useLocale() as Locale
  const [phone, setPhone] = useState(invoice.customerPhone ?? "")
  const [sending, setSending] = useState(false)
  const [sends, setSends] = useState<InvoiceWhatsAppMessage[]>([])

  const load = useCallback(() => {
    posInvoicesService
      .listInvoiceWhatsApp(invoice.id)
      .then(setSends)
      .catch(() => setSends([]))
  }, [invoice.id])

  useEffect(() => {
    if (!open) return
    setPhone(invoice.customerPhone ?? "")
    load()
  }, [open, invoice.customerPhone, load])

  const send = async () => {
    if (!phone.trim()) return toast.error(t("phoneRequired"))
    setSending(true)
    try {
      await posInvoicesService.sendInvoiceWhatsApp(invoice.id, phone.trim())
      toast.success(t("toasts.sent"))
      load()
    } catch (error) {
      const code = error instanceof AppError ? error.code : undefined
      const known: Record<string, string> = {
        WHATSAPP_INVALID_PHONE: t("toasts.invalidPhone"),
        WHATSAPP_TEMPLATE_NOT_READY: t("toasts.templateNotReady"),
        WHATSAPP_DAILY_LIMIT: t("toasts.dailyLimit"),
        WHATSAPP_NOT_CONFIGURED: t("toasts.notConfigured"),
      }
      toast.error((code && known[code]) || t("toasts.failed"), {
        description:
          code === "WHATSAPP_REJECTED" && error instanceof AppError ? error.message : undefined,
      })
      load()
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={localeDirection(locale)} className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle className="text-[15px] font-extrabold text-[#0d1b3e]">
            {t("title", { number: invoice.invoiceNumber })}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12px] leading-6 text-[#5b6b85]">{t("description")}</p>

        <div className="flex gap-2">
          <Input
            dir="ltr"
            type="tel"
            inputMode="tel"
            value={phone}
            placeholder="05XXXXXXXX"
            onChange={(event) => setPhone(event.target.value)}
            className="h-11 rounded-[10px] text-right"
          />
          <Button
            className="h-11 shrink-0 gap-2 rounded-[10px] bg-[#1f9d55] px-4 font-bold text-white hover:bg-[#188045]"
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("send")}
          </Button>
        </div>

        {sends.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-[#eef2f8] pt-3">
            <p className="text-[12px] font-bold text-[#0d1b3e]">{t("history")}</p>
            {sends.map((message) => (
              <div key={message.id} className="rounded-[10px] bg-[#f7f9fc] px-3 py-2 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span dir="ltr" className="font-semibold text-[#0d1b3e]">
                    +{message.toPhone}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                      STATUS_TINT[message.status]
                    )}
                  >
                    {message.status === "read" ? <CheckCheck className="size-3.5" /> : null}
                    {t(`statuses.${message.status}`)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#8098b4]">
                  {formatDateTime(message.createdAt, locale)}
                </p>
                {message.error ? (
                  <p dir="auto" className="mt-1 text-[11px] leading-5 text-[#b42318]">
                    {message.error}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
