"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Flag,
  Globe2,
  Link2,
  List,
  Megaphone,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  Tag,
  Target,
  Trash2,
  Type as TypeIcon,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppForm, AppFormField, AppFormSection } from "@/components/app"

import type { CampaignRecord } from "../services/campaign-picker.service"
import {
  type CampaignLinkFormInput,
  type CampaignLinkRecord,
  linkListService,
  type TrackingType,
} from "../services/link-list.service"
import { CampaignLinkPreviewPanel } from "./campaign-link-preview-panel"
import { DialogInput, DialogSelect } from "./design/dialog-input"
import { tajawal } from "./design/fonts"
import { SectionHeader } from "./design/section-header"
import { SegmentedControl } from "./design/segmented-control"

interface CustomParamRow {
  key: string
  value: string
}

interface CampaignLinkFormProps {
  campaigns: CampaignRecord[]
  onCreated: (link: CampaignLinkRecord) => void
  onCancel: () => void
}

const PREVIEW_DEBOUNCE_MS = 400
const COPY_RESET_MS = 1500

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

export function CampaignLinkForm({ campaigns, onCreated, onCancel }: CampaignLinkFormProps) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [name, setName] = useState("")
  const [trackingType, setTrackingType] = useState<TrackingType>("SHORT_LINK")
  const [destinationBaseUrl, setDestinationBaseUrl] = useState("")
  const [utmSource, setUtmSource] = useState("")
  const [utmMedium, setUtmMedium] = useState("")
  const [utmCampaign, setUtmCampaign] = useState("")
  const [adGroupName, setAdGroupName] = useState("")
  const [adName, setAdName] = useState("")
  const [utmContent, setUtmContent] = useState("")
  const [utmTerm, setUtmTerm] = useState("")
  const [customParamRows, setCustomParamRows] = useState<CustomParamRow[]>([])

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewShortUrl, setPreviewShortUrl] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  const formInput: CampaignLinkFormInput | null = useMemo(() => {
    if (!campaignId || !name.trim() || !isHttpsUrl(destinationBaseUrl)) {
      return null
    }
    if (!utmSource.trim() || !utmMedium.trim() || !utmCampaign.trim()) {
      return null
    }
    if (!adGroupName.trim() || !adName.trim()) {
      return null
    }

    const customParams = customParamRows.reduce<Record<string, string>>((acc, row) => {
      if (row.key.trim()) {
        acc[row.key.trim()] = row.value
      }
      return acc
    }, {})

    return {
      campaignId,
      name: name.trim(),
      trackingType,
      destinationBaseUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      adGroupName,
      adName,
      utmContent: utmContent || undefined,
      utmTerm: utmTerm || undefined,
      customParams: Object.keys(customParams).length > 0 ? customParams : undefined,
    }
  }, [
    campaignId,
    name,
    trackingType,
    destinationBaseUrl,
    utmSource,
    utmMedium,
    utmCampaign,
    adGroupName,
    adName,
    utmContent,
    utmTerm,
    customParamRows,
  ])

  // Live preview -- mirrors the backend's own non-persisting preview endpoint, debounced so we
  // don't fire a request on every keystroke.
  useEffect(() => {
    if (!formInput) {
      setPreviewUrl(null)
      setPreviewShortUrl(null)
      setIsPreviewLoading(false)
      return
    }

    let cancelled = false
    setIsPreviewLoading(true)
    const timer = setTimeout(() => {
      linkListService
        .previewCampaignLink(formInput)
        .then((preview) => {
          if (cancelled) return
          setPreviewUrl(preview.finalUrl)
          setPreviewShortUrl(preview.shortUrl)
        })
        .catch(() => {
          if (cancelled) return
          setPreviewUrl(null)
          setPreviewShortUrl(null)
        })
        .finally(() => {
          if (!cancelled) setIsPreviewLoading(false)
        })
    }, PREVIEW_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [formInput])

  function updateCustomParamRow(index: number, field: keyof CustomParamRow, value: string) {
    setCustomParamRows((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    )
  }

  function removeCustomParamRow(index: number) {
    setCustomParamRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
  }

  function handleCopyPreview() {
    const value = previewShortUrl ?? previewUrl
    if (!value) return
    void navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_RESET_MS)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formInput) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة")
      return
    }

    setIsSubmitting(true)
    try {
      const link = await linkListService.createCampaignLink(formInput)
      toast.success("تم إنشاء رابط الحملة بنجاح")
      onCreated(link)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل إنشاء رابط الحملة")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppForm
      dir="rtl"
      onSubmit={handleSubmit}
      className={`${tajawal.variable} flex flex-col gap-6 font-[family-name:var(--font-tajawal)]`}
    >
      <div className="flex flex-col gap-0 lg:flex-row">
        <div className="flex-1 space-y-8 lg:pe-6">
          <AppFormSection
            title={<SectionHeader icon={<Megaphone className="size-4" />} title="تفاصيل الحملة" />}
            description="ما الغرض من هذا الرابط وكيف يتم تتبعه"
            className="space-y-4"
          >
            <DialogSelect
              id="campaign-link-campaign"
              label="الحملة"
              required
              placeholder="اختر حملة"
              value={campaignId}
              onValueChange={setCampaignId}
              options={campaigns.map((campaign) => ({
                value: campaign.id,
                label: campaign.displayName,
              }))}
            />

            <DialogInput
              id="campaign-link-name"
              label="اسم الرابط"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: إعلان قصة تيك توك"
            />

            <AppFormField label="نوع التتبع" required>
              <SegmentedControl
                value={trackingType}
                onChange={setTrackingType}
                options={[
                  { value: "SHORT_LINK", label: "رابط مختصر", icon: <Link2 className="size-4" /> },
                  { value: "FULL_URL", label: "رابط كامل", icon: <Globe2 className="size-4" /> },
                ]}
              />
            </AppFormField>
          </AppFormSection>

          <AppFormSection
            title={
              <SectionHeader icon={<Target className="size-4" />} title="وجهة الرابط ومعلمات UTM" />
            }
            description="أين يصل النقر وكيف يتم تمييزه للتتبع"
            className="space-y-4"
          >
            <DialogInput
              id="campaign-link-destination"
              label="رابط الوجهة"
              required
              startIcon={<Link2 className="size-4" />}
              helperText="يجب أن يبدأ الرابط بـ https://"
              value={destinationBaseUrl}
              onChange={(event) => setDestinationBaseUrl(event.target.value)}
              placeholder="https://yourstore.com/product"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <DialogInput
                id="campaign-link-utm-campaign"
                label="utm_campaign"
                required
                endIcon={<Flag className="size-4" />}
                value={utmCampaign}
                onChange={(event) => setUtmCampaign(event.target.value)}
                placeholder="ramadan-push"
              />
              <DialogInput
                id="campaign-link-utm-medium"
                label="utm_medium"
                required
                endIcon={<Tag className="size-4" />}
                value={utmMedium}
                onChange={(event) => setUtmMedium(event.target.value)}
                placeholder="paid-social"
              />
              <DialogInput
                id="campaign-link-utm-source"
                label="utm_source"
                required
                endIcon={<Radio className="size-4" />}
                value={utmSource}
                onChange={(event) => setUtmSource(event.target.value)}
                placeholder="tiktok"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DialogInput
                id="campaign-link-ad-group"
                label="Ad group"
                required
                endIcon={<Users className="size-4" />}
                value={adGroupName}
                onChange={(event) => setAdGroupName(event.target.value)}
                placeholder="مثال: الجمهور 1"
              />
              <DialogInput
                id="campaign-link-ad-name"
                label="Ad name"
                required
                endIcon={<TypeIcon className="size-4" />}
                value={adName}
                onChange={(event) => setAdName(event.target.value)}
                placeholder="مثال: إعلان المنتجات الجديدة"
              />
            </div>
          </AppFormSection>

          <AppFormSection
            title={
              <SectionHeader
                icon={<SlidersHorizontal className="size-4" />}
                title="خيارات متقدمة"
              />
            }
            description="خيارات إضافية (اختيارية)"
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DialogInput
                id="campaign-link-utm-term"
                label="utm_term (اختياري)"
                endIcon={<Search className="size-4" />}
                value={utmTerm}
                onChange={(event) => setUtmTerm(event.target.value)}
                placeholder="مثال: أحذية رياضية"
              />
              <DialogInput
                id="campaign-link-utm-content"
                label="utm_content (اختياري)"
                endIcon={<List className="size-4" />}
                value={utmContent}
                onChange={(event) => setUtmContent(event.target.value)}
                placeholder="مثال: زر التسوق"
              />
            </div>

            <AppFormField label="معلومات إضافية">
              <div className="space-y-2">
                {customParamRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <DialogInput
                      value={row.key}
                      onChange={(event) => updateCustomParamRow(index, "key", event.target.value)}
                      placeholder="المفتاح"
                      wrapperClassName="w-1/3"
                    />
                    <DialogInput
                      value={row.value}
                      onChange={(event) => updateCustomParamRow(index, "value", event.target.value)}
                      placeholder="القيمة"
                      wrapperClassName="flex-1"
                    />
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCustomParamRow(index)}
                      aria-label="حذف"
                      className="mt-6"
                    >
                      <Trash2 className="size-4" />
                    </AppButton>
                  </div>
                ))}
                <AppButton
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={<Plus className="size-4" />}
                  onClick={() => setCustomParamRows((rows) => [...rows, { key: "", value: "" }])}
                  className="rounded-xl border-[#E2E8F0]"
                >
                  إضافة حقل
                </AppButton>
              </div>
            </AppFormField>
          </AppFormSection>
        </div>

        <CampaignLinkPreviewPanel
          previewUrl={previewUrl}
          previewShortUrl={previewShortUrl}
          isPreviewLoading={isPreviewLoading}
          copied={copied}
          onCopy={handleCopyPreview}
          utmSource={utmSource}
          utmMedium={utmMedium}
          utmCampaign={utmCampaign}
          adGroupName={adGroupName}
          adName={adName}
        />
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#E2E8F0] bg-white py-4">
        <AppButton
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-11 rounded-xl border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC]"
        >
          إلغاء
        </AppButton>
        <AppButton
          type="submit"
          disabled={!formInput || isSubmitting}
          loading={isSubmitting}
          icon={<Link2 className="size-4" />}
          className="h-11 rounded-xl bg-[#4F46E5] text-white hover:bg-[#4338CA]"
        >
          إنشاء الرابط
        </AppButton>
      </div>
    </AppForm>
  )
}
