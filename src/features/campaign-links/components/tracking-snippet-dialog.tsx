"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Check, Copy, Megaphone, X } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppDialog } from "@/components/app"

import { buildSnippetTag, trackingSnippetService } from "../services/tracking-snippet.service"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

interface TrackingSnippetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COPY_RESET_MS = 1500

export function TrackingSnippetDialog({ open, onOpenChange }: TrackingSnippetDialogProps) {
  const t = useTranslations("campaignLinks.trackingSnippet")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const [snippet, setSnippet] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetched fresh every time the dialog opens rather than cached on mount -- the backend
  // lazily mints the key on first call and returns the same one after, so this is cheap and
  // guarantees the panel never shows a stale/wrong-org key across a workspace switch.
  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function loadSiteKey() {
      setIsLoading(true)
      setError(null)
      setCopied(false)
      try {
        const siteKey = await trackingSnippetService.getSiteKey()
        if (cancelled) return
        setSnippet(buildSnippetTag(siteKey))
      } catch {
        if (cancelled) return
        setError(t("loadError"))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadSiteKey()

    return () => {
      cancelled = true
    }
  }, [open, t])

  function handleCopy() {
    if (!snippet) return
    void navigator.clipboard.writeText(snippet)
    setCopied(true)
    toast.success(t("copySuccess"))
    setTimeout(() => setCopied(false), COPY_RESET_MS)
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
      contentClassName="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
    >
      <div
        dir={localeDirection(locale)}
        className={`${cairo.variable} space-y-4 p-6 font-[family-name:var(--font-cairo)]`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
              <Megaphone className="size-4" />
            </span>
            <h2 className="text-[16px] font-bold text-[#172033]">{t("title")}</h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#172033]"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-sm text-[#64748B]">{t("description")}</p>

        {isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-8 text-sm text-[#64748B]">
            {tCommon("loading")}
          </div>
        ) : error ? (
          <p className="text-sm text-[#EF4444]">{error}</p>
        ) : snippet ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-[#E2E8F0] bg-[#0F172A] p-3">
              <pre
                dir="ltr"
                className="overflow-x-auto whitespace-pre-wrap break-all text-start text-xs leading-5 text-[#E2E8F0]"
              >
                {snippet}
              </pre>
            </div>
            <AppButton
              type="button"
              variant="outline"
              onClick={handleCopy}
              icon={
                copied ? <Check className="size-4 text-[#10B981]" /> : <Copy className="size-4" />
              }
              className="h-10 w-full rounded-xl border-[#E2E8F0]"
            >
              {copied ? t("copied") : t("copyButton")}
            </AppButton>
          </div>
        ) : null}
      </div>
    </AppDialog>
  )
}
