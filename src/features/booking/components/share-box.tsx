"use client"

// The "share your page" box in booking settings: the page's link with a QR code the business can
// print for the counter, save as a picture for social media, or send over WhatsApp.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Copy, Download, ExternalLink, MessageCircle, Printer } from "lucide-react"
import QRCode from "qrcode"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { MUTED, SECONDARY_BUTTON } from "./styles"

export function ShareBox({ link, businessName }: { link: string; businessName: string | null }) {
  const t = useTranslations("booking.settings.share")
  const [code, setCode] = useState<{ link: string; picture: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(link, { margin: 2, width: 900, errorCorrectionLevel: "M" })
      .then((picture) => {
        if (!cancelled) setCode({ link, picture })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [link])

  const picture = code?.link === link ? code.picture : null
  const message = businessName
    ? t("messageNamed", { name: businessName, link })
    : t("message", { link })

  const print = () => {
    const sheet = window.open("", "_blank")
    if (!picture || !sheet) return
    const page = sheet.document
    const title = page.createElement("h1")
    title.textContent = businessName ?? ""
    title.style.cssText = "font-size:34px;margin:0 0 8px"
    const line = page.createElement("p")
    line.textContent = t("printLine")
    line.style.cssText = "font-size:22px;margin:0 0 24px"
    const image = page.createElement("img")
    image.src = picture
    image.style.width = "340px"
    const address = page.createElement("p")
    address.textContent = link.replace(/^https?:\/\//, "")
    address.style.cssText = "font-size:15px;color:#555;direction:ltr;margin-top:16px"
    page.body.style.cssText =
      "font-family:system-ui,sans-serif;text-align:center;padding:56px;direction:rtl"
    page.body.append(title, line, image, address)
    page.title = businessName ?? t("title")
    setTimeout(() => sheet.print(), 300)
  }

  return (
    <div className="rounded-[12px] bg-[#f5f3ff] p-4">
      <p className="text-[14px] font-extrabold text-[#5b21b6]">{t("title")}</p>
      <p className={cn("mt-0.5 text-[12.5px] leading-5", MUTED)}>{t("hint")}</p>
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- a QR made on the spot, not a hosted image
          <img
            src={picture}
            alt={t("qrLabel")}
            width={148}
            height={148}
            className="shrink-0 rounded-[10px] bg-white"
          />
        ) : (
          <span className="block size-[148px] shrink-0 rounded-[10px] bg-white" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-[#5b21b6]">{t("link")}</p>
          <p className="mt-1 text-[13px] break-all text-[#0b1738]" dir="ltr">
            {link}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => toast.success(t("copied")))
              }}
            >
              <Copy className="size-4" />
              {t("copy")}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className={SECONDARY_BUTTON}
            >
              <MessageCircle className="size-4" />
              {t("whatsapp")}
            </a>
            {picture ? (
              <a href={picture} download="booking-qr.png" className={SECONDARY_BUTTON}>
                <Download className="size-4" />
                {t("download")}
              </a>
            ) : null}
            <button type="button" className={SECONDARY_BUTTON} disabled={!picture} onClick={print}>
              <Printer className="size-4" />
              {t("print")}
            </button>
            <a href={link} target="_blank" rel="noreferrer" className={SECONDARY_BUTTON}>
              <ExternalLink className="size-4" />
              {t("view")}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
