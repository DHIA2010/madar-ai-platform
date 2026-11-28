"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, FileText, Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog, AppTextarea } from "@/components/app"

import { crmService } from "../services"
import {
  COMPANY_PROFILES,
  type CompanyProfile,
  companyProfileUrl,
} from "../services/company-profiles"
import type { CrmLeadDetail } from "../types"
import { whatsappUrl } from "./crm-ui"

// CRM lead → «إرسال الملف التعريفي»: pick the profile that fits the lead's business, adjust the
// message, and send it on WhatsApp or by email (opened from the staff member's own WhatsApp /
// mail app). The send is written on the lead's timeline.

function defaultMessage(name: string, profile: CompanyProfile) {
  const greeting = name ? `مرحباً ${name} 👋` : "مرحباً 👋"
  return `${greeting}

يسعدنا نشاركك الملف التعريفي لمدار (${profile.title}): كيف يجمع لك الكاشير والمخزون والعملاء والتقارير في نظام واحد.

${companyProfileUrl(profile)}

وإذا حاب نرتب لك عرضاً سريعاً أو تجربة مجانية، أنا موجود 🌟`
}

export function SendProfileDialog({
  detail,
  onClose,
  onLogged,
}: {
  detail: CrmLeadDetail
  onClose: () => void
  onLogged: (detail: CrmLeadDetail) => void
}) {
  const { lead } = detail
  const name = lead.contactName || lead.companyName || ""
  const [profile, setProfile] = useState<CompanyProfile>(COMPANY_PROFILES[0])
  const [message, setMessage] = useState(() => defaultMessage(name, COMPANY_PROFILES[0]))

  function choose(next: CompanyProfile) {
    setProfile(next)
    setMessage(defaultMessage(name, next))
  }

  async function log(channel: "whatsapp" | "email") {
    try {
      onLogged(
        await crmService.logActivity(
          lead.id,
          channel,
          `أُرسل الملف التعريفي «${profile.title}»\n${companyProfileUrl(profile)}`
        )
      )
    } catch {
      // The message was still sent; only the timeline note failed.
    }
  }

  function sendWhatsapp() {
    if (!lead.phone) return
    window.open(
      `${whatsappUrl(lead.phone)}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener"
    )
    void log("whatsapp")
    toast.success("فُتح واتساب بالرسالة، اضغط إرسال هناك.")
    onClose()
  }

  function sendEmail() {
    if (!lead.email) return
    const subject = `الملف التعريفي لمدار — ${profile.title}`
    window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    void log("email")
    onClose()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(companyProfileUrl(profile))
      toast.success("نُسخ رابط الملف.")
    } catch {
      toast.error("تعذر النسخ.")
    }
  }

  const action =
    "inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"

  return (
    <AppDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={<span dir="rtl">إرسال الملف التعريفي</span>}
      contentClassName="max-w-2xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2" dir="rtl">
          <button
            type="button"
            className={cn(action, "border border-border hover:bg-muted")}
            onClick={copyLink}
          >
            <Copy className="size-4" />
            نسخ الرابط
          </button>
          <button
            type="button"
            className={cn(action, "border border-border hover:bg-muted")}
            disabled={!lead.email}
            title={lead.email ? undefined : "لا يوجد بريد لهذا العميل"}
            onClick={sendEmail}
          >
            <Mail className="size-4" />
            إرسال بالبريد
          </button>
          <button
            type="button"
            className={cn(action, "bg-emerald-600 text-white hover:bg-emerald-700")}
            disabled={!lead.phone}
            title={lead.phone ? undefined : "لا يوجد رقم جوال لهذا العميل"}
            onClick={sendWhatsapp}
          >
            <MessageCircle className="size-4" />
            إرسال على واتساب
          </button>
        </div>
      }
    >
      <div dir="rtl" className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            اختر الملف المناسب لنشاط العميل
          </p>
          <div className="grid gap-2">
            {COMPANY_PROFILES.map((entry) => {
              const active = entry.key === profile.key
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => choose(entry)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-start transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {active ? <Check className="size-5" /> : <FileText className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                      {entry.title}
                      <span className="text-xs font-normal text-muted-foreground">
                        {entry.pages} صفحة · PDF
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {entry.description}
                    </span>
                  </span>
                  <a
                    href={companyProfileUrl(entry)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    معاينة
                    <ExternalLink className="size-3.5" />
                  </a>
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-foreground"
            htmlFor="profile-message"
          >
            الرسالة
          </label>
          <AppTextarea
            id="profile-message"
            rows={9}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="rounded-[10px] text-sm leading-6"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            يُفتح واتساب أو البريد برسالتك جاهزة، وتُسجَّل في سجل العميل.
          </p>
        </div>
      </div>
    </AppDialog>
  )
}
