"use client"

// Sharing a sale's receipt on WhatsApp, the way the store chose in Settings -> WhatsApp:
// - WhatsApp Web (default): the customer's chat opens in the merchant's own WhatsApp (Web on a
//   computer, the app on a phone or tablet) with a ready message linking to the invoice PDF -- the
//   cashier only presses send (backend whatsapp/invoice-links.ts).
// - Their connected business number: Madar sends the PDF itself from that number (backend
//   whatsapp/invoice-sender.ts); opening WhatsApp Web stays available beside it.

import { useEffect, useMemo, useState } from "react"
import { Loader2, MessageCircle, Zap } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { localeDirection, type Locale } from "@/i18n/locales"
import { posInvoicesService } from "@/features/pos/services/pos-invoices.service"
import { whatsAppConnectionService } from "@/features/settings/services/whatsapp-connection.service"
import { AppError } from "@/lib/errors/app-error"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// A phone number in WhatsApp's form (digits, country code first). Saudi local forms
// (05XXXXXXXX, 5XXXXXXXX) become 9665XXXXXXXX. Null when it can't be one -- same rules as the
// backend's toWhatsAppNumber.
export function toWhatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  if (digits.startsWith("9660")) digits = `966${digits.slice(4)}`
  if (digits.startsWith("966") && !/^9665\d{8}$/.test(digits)) return null
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

const isMobileDevice = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

// WhatsApp Web on a computer; the WhatsApp app (through wa.me) on a phone or tablet.
export function whatsAppUrl(phone: string, message: string): string {
  const text = encodeURIComponent(message)
  return isMobileDevice()
    ? `https://wa.me/${phone}?text=${text}`
    : `https://web.whatsapp.com/send?phone=${phone}&text=${text}`
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={localeDirection(locale)} className="sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle className="text-[15px] font-extrabold text-[#0d1b3e]">
            {t("title", { number: invoice.invoiceNumber })}
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12px] leading-6 text-[#5b6b85]">{t("description")}</p>
        {/* Keyed so each opening starts fresh with this invoice's number and link. */}
        {open ? (
          <ShareBody key={invoice.id} invoice={invoice} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ShareBody({
  invoice,
  onDone,
}: {
  invoice: { id: string; customerPhone: string | null }
  onDone: () => void
}) {
  const t = useTranslations("invoices.whatsapp")
  const [phone, setPhone] = useState(invoice.customerPhone ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Whether the store sends from its own connected number (Settings -> WhatsApp).
  const [automatic, setAutomatic] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    whatsAppConnectionService
      .get()
      .then((overview) => {
        if (!cancelled) {
          setAutomatic(
            overview.sendMode === "business" && overview.connection?.status === "connected"
          )
        }
      })
      .catch(() => {
        // Unknown -- WhatsApp Web works either way.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Prepared as soon as the dialog opens, so the button below is a plain link -- browsers don't
  // block a window opened from a direct click.
  useEffect(() => {
    let cancelled = false
    posInvoicesService
      .getInvoiceWhatsAppLink(invoice.id)
      .then((link) => {
        if (!cancelled) setMessage(link.message)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [invoice.id])

  const number = useMemo(() => toWhatsAppNumber(phone), [phone])
  const href = number && message ? whatsAppUrl(number, message) : null

  const sendAutomatically = async () => {
    if (!number) return
    setSending(true)
    try {
      await posInvoicesService.sendInvoiceWhatsApp(invoice.id, phone)
      toast.success(t("sentAuto", { phone }))
      onDone()
    } catch (error) {
      toast.error(t("autoFailed"), {
        description: error instanceof AppError ? error.message : undefined,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {automatic ? (
        <p className="-mt-1 text-[12px] leading-6 text-[#1a9e55]">{t("autoDescription")}</p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Input
          dir="ltr"
          type="tel"
          inputMode="tel"
          value={phone}
          placeholder="05XXXXXXXX"
          onChange={(event) => setPhone(event.target.value)}
          className="h-11 rounded-[10px] text-right"
        />
        {phone.trim() && !number ? (
          <p className="text-[11.5px] font-medium text-[#d92d20]">{t("toasts.invalidPhone")}</p>
        ) : null}
      </div>

      {failed ? (
        <p className="text-[12px] font-medium text-[#d92d20]">{t("toasts.failed")}</p>
      ) : null}

      {automatic ? (
        <button
          type="button"
          disabled={!number || sending}
          onClick={() => void sendAutomatically()}
          className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#1f9d55] px-4 text-[13.5px] font-bold text-white hover:bg-[#188045] disabled:pointer-events-none disabled:bg-[#1f9d55]/50"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {sending ? t("sending") : t("sendAuto")}
        </button>
      ) : null}

      <a
        href={href ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!href}
        onClick={(event) => {
          if (!href) {
            event.preventDefault()
            return
          }
          onDone()
        }}
        className={
          automatic
            ? href
              ? "flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[#1f9d55] hover:underline"
              : "pointer-events-none flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[#1f9d55]/50"
            : href
              ? "flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#1f9d55] px-4 text-[13.5px] font-bold text-white hover:bg-[#188045]"
              : "pointer-events-none flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#1f9d55]/50 px-4 text-[13.5px] font-bold text-white"
        }
      >
        {!message && !failed ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MessageCircle className="size-4" />
        )}
        {automatic ? t("orWeb") : t("open")}
      </a>
    </>
  )
}
