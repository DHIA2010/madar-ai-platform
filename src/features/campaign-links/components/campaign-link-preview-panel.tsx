"use client"

import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Flag,
  Link2,
  Radio,
  Sparkles,
  Tag,
  Type as TypeIcon,
  Users,
} from "lucide-react"

import { AppButton } from "@/components/app"

import { IconBadge } from "./design/icon-badge"

interface CampaignLinkPreviewPanelProps {
  previewUrl: string | null
  previewShortUrl: string | null
  isPreviewLoading: boolean
  copied: boolean
  onCopy: () => void
  utmSource: string
  utmMedium: string
  utmCampaign: string
  adGroupName: string
  adName: string
}

function Chip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#64748B]">
      {icon}
      {value}
    </span>
  )
}

// Width/background/border/radius/padding come directly from the supplied design spec's "Left
// Preview Panel" component spec, not the app's default card styling.
export function CampaignLinkPreviewPanel({
  previewUrl,
  previewShortUrl,
  isPreviewLoading,
  copied,
  onCopy,
  utmSource,
  utmMedium,
  utmCampaign,
  adGroupName,
  adName,
}: CampaignLinkPreviewPanelProps) {
  return (
    <div className="w-full rounded-s-2xl border-s border-[#EEF2F7] bg-[#FAFBFF] p-6 lg:sticky lg:top-0 lg:h-full lg:w-[280px]">
      <div className="flex items-center justify-between gap-2">
        <IconBadge icon={<Eye className="size-4" />} />
        <div className="flex-1 text-end">
          <p className="text-[16px] font-semibold leading-6 text-[#172033]">معاينة مباشرة</p>
        </div>
      </div>
      <p className="mt-1 text-xs text-[#64748B]">املأ الحقول المطلوبة لرؤية معاينة الرابط</p>

      {previewUrl ? (
        <div className="mt-5 space-y-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#EEF2FF] p-3">
            <div className="flex items-start gap-2">
              <Link2 className="mt-0.5 size-4 shrink-0 text-[#4F46E5]" />
              <p className="min-w-0 flex-1 break-all text-sm font-semibold text-[#172033]">
                {previewShortUrl ?? previewUrl}
              </p>
              <AppButton
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onCopy}
                aria-label="نسخ الرابط"
                className="shrink-0"
              >
                {copied ? (
                  <Check className="size-3.5 text-[#10B981]" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </AppButton>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip icon={<Radio className="size-3" />} value={utmSource} />
            <Chip icon={<Tag className="size-3" />} value={utmMedium} />
            <Chip icon={<Flag className="size-3" />} value={utmCampaign} />
            {adGroupName ? <Chip icon={<Users className="size-3" />} value={adGroupName} /> : null}
            {adName ? <Chip icon={<TypeIcon className="size-3" />} value={adName} /> : null}
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#10B981]/10 px-2.5 py-1 text-xs font-medium text-[#10B981]">
            <CheckCircle2 className="size-3.5" />
            جاهز للتتبع
          </span>

          {previewShortUrl ? (
            <div>
              <p className="mb-1 text-xs text-[#64748B]">الوجهة النهائية</p>
              <p className="break-all rounded-lg bg-white px-3 py-2 text-xs text-[#64748B]">
                {previewUrl}
              </p>
            </div>
          ) : null}

          {isPreviewLoading ? <p className="text-xs text-[#64748B]">جارٍ التحديث...</p> : null}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center gap-4 text-center">
          <div className="relative">
            <Sparkles className="absolute -start-3 -top-2 size-4 text-[#4F46E5]/40" />
            <Sparkles className="absolute -end-2 top-1 size-3 text-[#4F46E5]/25" />
            <div className="flex h-20 w-28 flex-col gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-sm">
              <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-[#E2E8F0]" />
                <span className="size-1.5 rounded-full bg-[#E2E8F0]" />
                <span className="size-1.5 rounded-full bg-[#E2E8F0]" />
              </div>
              <div className="mt-1 h-1.5 w-3/4 rounded-full bg-[#E2E8F0]" />
              <div className="h-1.5 w-1/2 rounded-full bg-[#E2E8F0]" />
            </div>
            <div className="absolute -bottom-2 -end-2 flex size-8 items-center justify-center rounded-full bg-[#4F46E5] text-white shadow-md">
              <Link2 className="size-4" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#172033]">ستظهر معاينة الرابط هنا</p>
            <p className="text-xs text-[#64748B]">بعد إدخال البيانات المطلوبة</p>
          </div>
        </div>
      )}
    </div>
  )
}
