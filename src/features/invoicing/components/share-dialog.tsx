"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Check, Copy, ExternalLink, Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog } from "@/components/app"

import { HEADING, MUTED } from "./styles"

// A Saudi mobile as wa.me wants it: digits only, country code first.
function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("00")) return digits.slice(2)
  if (digits.startsWith("05") && digits.length === 10) return `966${digits.slice(1)}`
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`
  return digits
}

export const publicLink = (route: string) =>
  typeof window === "undefined" ? route : `${window.location.origin}${route}`

// The customer's link to a document, with the ways to hand it over.
export function ShareDialog({
  open,
  onOpenChange,
  title,
  description,
  link,
  message,
  phone,
  email,
  subject,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  link: string
  // The text sent with the link.
  message: string
  phone: string | null
  email: string | null
  subject: string
}) {
  const t = useTranslations("invoicing.share")
  const [copied, setCopied] = useState(false)
  const text = `${message}\n${link}`
  const number = whatsappNumber(phone)
  const whatsapp = `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`
  const mail = `mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success(t("copied"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  const channel =
    "flex h-12 items-center justify-center gap-2 rounded-[14px] border border-[#e1e7f0] bg-white text-[13px] font-bold text-[#0b1738] transition hover:bg-[#f7f9fc]"

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      contentClassName="max-w-[30rem] rounded-[22px] p-6"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-[14px] border border-[#e1e7f0] bg-[#f7f9fc] p-1.5 ps-3">
          <span
            dir="ltr"
            className={cn("min-w-0 flex-1 truncate text-start text-[12.5px]", HEADING)}
          >
            {link}
          </span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#4f46e5] px-3.5 text-[12.5px] font-bold text-white hover:bg-[#4338ca]"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("copiedShort") : t("copy")}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a href={whatsapp} target="_blank" rel="noreferrer" className={channel}>
            <MessageCircle className="size-4 text-[#16a34a]" />
            {t("whatsapp")}
          </a>
          <a href={mail} className={channel}>
            <Mail className="size-4 text-[#2563eb]" />
            {t("email")}
          </a>
          <a href={link} target="_blank" rel="noreferrer" className={channel}>
            <ExternalLink className="size-4 text-[#4f46e5]" />
            {t("open")}
          </a>
        </div>
        <p className={cn("text-[11.5px] leading-5", MUTED)}>{t("hint")}</p>
      </div>
    </AppDialog>
  )
}
