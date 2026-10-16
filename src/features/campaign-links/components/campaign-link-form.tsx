"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
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
  type CampaignPlatform,
  linkListService,
  type TrackingType,
} from "../services/link-list.service"
import { CampaignLinkPreviewPanel } from "./campaign-link-preview-panel"
import { DialogInput, DialogSelect } from "./design/dialog-input"
import { SectionHeader } from "./design/section-header"
import { SegmentedControl } from "./design/segmented-control"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

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

// Radix Select items can't take an empty-string value, so "none" is a sentinel mapped back to
// null when building the submitted/previewed input.
const PLATFORM_NONE_VALUE = "none"

type CampaignLinkFormTranslator = ReturnType<typeof useTranslations<"campaignLinks.form">>

// Platform names (Google Ads, Meta Ads, ...) are brand names, identical in both locales, so
// only the "none" option's label comes from the translator.
function getPlatformOptions(
  t: CampaignLinkFormTranslator
): Array<{ value: string; label: string }> {
  return [
    { value: PLATFORM_NONE_VALUE, label: t("platformNone") },
    { value: "google_ads", label: "Google Ads" },
    { value: "meta_ads", label: "Meta Ads" },
    { value: "tiktok_ads", label: "TikTok Ads" },
    { value: "snapchat_ads", label: "Snapchat Ads" },
  ]
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

export function CampaignLinkForm({ campaigns, onCreated, onCancel }: CampaignLinkFormProps) {
  const t = useTranslations("campaignLinks.form")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const platformOptions = useMemo(() => getPlatformOptions(t), [t])
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [name, setName] = useState("")
  const [trackingType, setTrackingType] = useState<TrackingType>("SHORT_LINK")
  const [platform, setPlatform] = useState<string>(PLATFORM_NONE_VALUE)
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
      platform: platform === PLATFORM_NONE_VALUE ? null : (platform as CampaignPlatform),
      utmContent: utmContent || undefined,
      utmTerm: utmTerm || undefined,
      customParams: Object.keys(customParams).length > 0 ? customParams : undefined,
    }
  }, [
    campaignId,
    name,
    trackingType,
    platform,
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
      toast.error(t("toasts.missingFields"))
      return
    }

    setIsSubmitting(true)
    try {
      const link = await linkListService.createCampaignLink(formInput)
      toast.success(t("toasts.createSuccess"))
      onCreated(link)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.createError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppForm
      dir={localeDirection(locale)}
      onSubmit={handleSubmit}
      className={`${cairo.variable} flex flex-col gap-6 font-[family-name:var(--font-cairo)]`}
    >
      <div className="flex flex-col gap-0 lg:flex-row">
        <div className="flex-1 space-y-8 lg:pe-6">
          <AppFormSection
            title={
              <SectionHeader
                icon={<Megaphone className="size-4" />}
                title={t("sections.campaignDetails.title")}
              />
            }
            description={t("sections.campaignDetails.description")}
            className="space-y-4"
          >
            <DialogSelect
              id="campaign-link-campaign"
              label={t("fields.campaign.label")}
              required
              placeholder={t("fields.campaign.placeholder")}
              value={campaignId}
              onValueChange={setCampaignId}
              options={campaigns.map((campaign) => ({
                value: campaign.id,
                label: campaign.displayName,
              }))}
            />

            <DialogInput
              id="campaign-link-name"
              label={t("fields.name.label")}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("fields.name.placeholder")}
            />

            <AppFormField label={t("fields.trackingType.label")} required>
              <SegmentedControl
                value={trackingType}
                onChange={setTrackingType}
                options={[
                  {
                    value: "SHORT_LINK",
                    label: t("fields.trackingType.shortLink"),
                    icon: <Link2 className="size-4" />,
                  },
                  {
                    value: "FULL_URL",
                    label: t("fields.trackingType.fullUrl"),
                    icon: <Globe2 className="size-4" />,
                  },
                ]}
              />
            </AppFormField>

            <DialogSelect
              id="campaign-link-platform"
              label={t("fields.platform.label")}
              placeholder={t("fields.platform.placeholder")}
              value={platform}
              onValueChange={setPlatform}
              options={platformOptions}
            />
          </AppFormSection>

          <AppFormSection
            title={
              <SectionHeader
                icon={<Target className="size-4" />}
                title={t("sections.destination.title")}
              />
            }
            description={t("sections.destination.description")}
            className="space-y-4"
          >
            <DialogInput
              id="campaign-link-destination"
              label={t("fields.destination.label")}
              required
              startIcon={<Link2 className="size-4" />}
              helperText={t("fields.destination.helper")}
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
                placeholder={t("fields.adGroup.placeholder")}
              />
              <DialogInput
                id="campaign-link-ad-name"
                label="Ad name"
                required
                endIcon={<TypeIcon className="size-4" />}
                value={adName}
                onChange={(event) => setAdName(event.target.value)}
                placeholder={t("fields.adName.placeholder")}
              />
            </div>
          </AppFormSection>

          <AppFormSection
            title={
              <SectionHeader
                icon={<SlidersHorizontal className="size-4" />}
                title={t("sections.advanced.title")}
              />
            }
            description={t("sections.advanced.description")}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DialogInput
                id="campaign-link-utm-term"
                label={t("fields.utmTerm.label")}
                endIcon={<Search className="size-4" />}
                value={utmTerm}
                onChange={(event) => setUtmTerm(event.target.value)}
                placeholder={t("fields.utmTerm.placeholder")}
              />
              <DialogInput
                id="campaign-link-utm-content"
                label={t("fields.utmContent.label")}
                endIcon={<List className="size-4" />}
                value={utmContent}
                onChange={(event) => setUtmContent(event.target.value)}
                placeholder={t("fields.utmContent.placeholder")}
              />
            </div>

            <AppFormField label={t("fields.customParams.label")}>
              <div className="space-y-2">
                {customParamRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <DialogInput
                      value={row.key}
                      onChange={(event) => updateCustomParamRow(index, "key", event.target.value)}
                      placeholder={t("fields.customParams.keyPlaceholder")}
                      wrapperClassName="w-1/3"
                    />
                    <DialogInput
                      value={row.value}
                      onChange={(event) => updateCustomParamRow(index, "value", event.target.value)}
                      placeholder={t("fields.customParams.valuePlaceholder")}
                      wrapperClassName="flex-1"
                    />
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCustomParamRow(index)}
                      aria-label={t("fields.customParams.removeRow")}
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
                  {t("fields.customParams.addRow")}
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
          {tCommon("cancel")}
        </AppButton>
        <AppButton
          type="submit"
          disabled={!formInput || isSubmitting}
          loading={isSubmitting}
          icon={<Link2 className="size-4" />}
          className="h-11 rounded-xl bg-[#4F46E5] text-white hover:bg-[#4338CA]"
        >
          {t("submit")}
        </AppButton>
      </div>
    </AppForm>
  )
}
