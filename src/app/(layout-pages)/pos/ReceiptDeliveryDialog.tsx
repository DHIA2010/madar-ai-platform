"use client"

// After a sale when Settings -> الكاشير -> طريقة تسليم الفاتورة is "both": the cashier picks how
// this customer gets the receipt -- print it, or send it from their own WhatsApp -- one or the
// other, never both at once. WhatsApp opens the customer's chat with a ready message linking to
// the invoice; with no customer number on the sale, it asks for one first.

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, ChevronLeft, Loader2, MessageCircle, Printer } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { localeDirection, type Locale } from "@/i18n/locales"
import { posInvoicesService } from "@/features/pos/services/pos-invoices.service"
import { toWhatsAppNumber, whatsAppUrl } from "@/app/(layout-pages)/invoices/whatsapp-send-dialog"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const amountFormat = (locale: Locale) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export function ReceiptDeliveryDialog({
  invoice,
  onPrint,
  onClose,
}: {
  invoice: { id: string; invoiceNumber: string; totalAmount: number; customerPhone: string | null }
  onPrint: () => void
  onClose: () => void
}) {
  const t = useTranslations("pos.cashier.receiptDelivery")
  const locale = useLocale() as Locale
  const [phone, setPhone] = useState(invoice.customerPhone ?? "")
  const [askPhone, setAskPhone] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // The ready message (with the invoice link) is prepared as soon as the dialog opens, so choosing
  // WhatsApp is a plain link -- browsers don't block a window opened from a direct click.
  useEffect(() => {
    let cancelled = false
    posInvoicesService
      .getInvoiceWhatsAppLink(invoice.id)
      .then((link) => {
        if (!cancelled) setMessage(link.message)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [invoice.id])

  const number = useMemo(() => toWhatsAppNumber(phone), [phone])
  const href = number && message ? whatsAppUrl(number, message) : null

  const optionClass =
    "group flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-start transition-all"

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        dir={localeDirection(locale)}
        className="gap-0 overflow-hidden bg-white p-0 sm:max-w-[26rem]"
      >
        <div className="flex flex-col items-center gap-2 bg-gradient-to-b from-[#ecfdf3] to-white px-6 pt-7 pb-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-[#dcfce7] text-[#16a34a] shadow-[0_6px_18px_rgba(22,163,74,0.18)]">
            <CheckCircle2 className="size-8" />
          </span>
          <DialogTitle className="text-[17px] font-extrabold text-[#0b1738]">
            {t("title")}
          </DialogTitle>
          <p className="text-[12.5px] text-[#6b7b96]">
            {t("summary", {
              number: invoice.invoiceNumber,
              total: amountFormat(locale).format(invoice.totalAmount),
            })}
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 pt-3 pb-6">
          <p className="text-[12.5px] font-bold text-[#0b1738]">{t("question")}</p>

          <button
            type="button"
            onClick={onPrint}
            className={cn(
              optionClass,
              "border-[#e1e7f0] hover:border-[#2563eb] hover:bg-[#f5f9ff]"
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <Printer className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-extrabold text-[#0b1738]">
                {t("print")}
              </span>
              <span className="block text-[12px] text-[#6b7b96]">{t("printHint")}</span>
            </span>
            <ChevronLeft className="size-5 shrink-0 text-[#c4cfdd] transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
          </button>

          {askPhone || !invoice.customerPhone ? (
            <div className="flex flex-col gap-2.5 rounded-2xl border-2 border-[#1f9d55] bg-[#f3fbf6] p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#dcfce7] text-[#1f9d55]">
                  <MessageCircle className="size-6" />
                </span>
                <span>
                  <span className="block text-[14.5px] font-extrabold text-[#0b1738]">
                    {t("whatsapp")}
                  </span>
                  <span className="block text-[12px] text-[#6b7b96]">{t("phoneLabel")}</span>
                </span>
              </div>
              <Input
                dir="ltr"
                type="tel"
                inputMode="tel"
                autoFocus
                value={phone}
                placeholder="05XXXXXXXX"
                onChange={(event) => setPhone(event.target.value)}
                className="h-11 rounded-[10px] border-[#cfe9d9] bg-white text-right"
              />
              {phone.trim() && !number ? (
                <p className="text-[11.5px] font-medium text-[#d92d20]">{t("invalidPhone")}</p>
              ) : null}
              <a
                href={href ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!href}
                onClick={(event) => {
                  if (!href) event.preventDefault()
                  else onClose()
                }}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-[10px] text-[13.5px] font-bold text-white",
                  href ? "bg-[#1f9d55] hover:bg-[#188045]" : "pointer-events-none bg-[#1f9d55]/50"
                )}
              >
                {!message ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageCircle className="size-4" />
                )}
                {t("openWhatsApp")}
              </a>
            </div>
          ) : (
            <a
              href={href ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!href) {
                  event.preventDefault()
                  // An invalid number on the sale: let the cashier fix it.
                  if (message) setAskPhone(true)
                  return
                }
                onClose()
              }}
              className={cn(
                optionClass,
                "border-[#e1e7f0] hover:border-[#1f9d55] hover:bg-[#f3fbf6]"
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#dcfce7] text-[#1f9d55]">
                {message ? (
                  <MessageCircle className="size-6" />
                ) : (
                  <Loader2 className="size-6 animate-spin" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold text-[#0b1738]">
                  {t("whatsapp")}
                </span>
                <span dir="ltr" className="block text-end text-[12px] text-[#6b7b96]">
                  {invoice.customerPhone}
                </span>
              </span>
              <ChevronLeft className="size-5 shrink-0 text-[#c4cfdd] transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-1 text-center text-[12.5px] font-semibold text-[#8098b4] hover:text-[#0b1738]"
          >
            {t("skip")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
