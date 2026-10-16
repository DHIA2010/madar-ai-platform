"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  AlertCircle,
  Edit,
  Eye,
  FileCode2,
  Film,
  HardDrive,
  ImageIcon,
  Layers3,
  Library,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppEmpty,
  AppInput,
  AppLoading,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppStatusBadge,
  AppTextarea,
} from "@/components/app"

import { useCampaignDetails } from "../hooks"
import { translatedCampaignStatusMeta } from "../services"

import { type Locale } from "@/i18n/locales"

type CampaignsTranslator = ReturnType<typeof useTranslations<"campaigns">>

type CampaignDetailsTab =
  | "overview"
  | "creatives"
  | "audience"
  | "budget"
  | "performance"
  | "activity"
  | "settings"

type CreativeType = "image" | "video" | "carousel" | "html5"
type CreativeStatus = "draft" | "ready" | "needs_review"

interface CreativeAsset {
  id: string
  name: string
  type: CreativeType
  dimensions: string
  fileSize: string
  status: CreativeStatus
  createdAt: string
  source: "campaign-upload" | "asset-library"
  headline: string
  description: string
  callToAction: string
  landingPageUrl: string
  tags: string[]
  previewUrl?: string
}

const DETAILS_TABS: CampaignDetailsTab[] = [
  "overview",
  "creatives",
  "audience",
  "budget",
  "performance",
  "activity",
  "settings",
]

const CREATIVE_TYPE_OPTIONS: CreativeType[] = ["image", "video", "carousel", "html5"]

// The CTA dropdown's `value` is the literal label saved on the creative (and, if this ever wires up
// to a real ad platform API, the standardized CTA token those platforms expect) -- it stays in
// English regardless of locale, same as a status enum token. Only the displayed option text is
// translated, via `key`.
const CTA_OPTIONS = [
  { value: "Learn More", key: "learnMore" },
  { value: "Shop Now", key: "shopNow" },
  { value: "Get Offer", key: "getOffer" },
  { value: "Sign Up", key: "signUp" },
  { value: "Contact Us", key: "contactUs" },
] as const

const ACCEPTED_MIME = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  carousel: ["image/jpeg", "image/png", "image/webp"],
  html5: ["application/zip"],
}

function getCreativeTypeIcon(type: CreativeType) {
  if (type === "image") return ImageIcon
  if (type === "video") return Film
  if (type === "carousel") return Layers3
  return FileCode2
}

function getCreativeStatusMeta(status: CreativeStatus, t: CampaignsTranslator) {
  if (status === "ready") {
    return { label: t("detailsView.creativeStatus.ready"), tone: "success" as const }
  }
  if (status === "needs_review") {
    return { label: t("detailsView.creativeStatus.needsReview"), tone: "warning" as const }
  }
  return { label: t("detailsView.creativeStatus.draft"), tone: "neutral" as const }
}

// Arabic numerals are forced to Western digits (-u-nu-latn) so they match the plain-number data
// from the backend, and dates are forced to the Gregorian calendar (-ca-gregory) rather than
// defaulting to Hijri -- mirrors src/features/reports/components/kpi-widget-renderer.tsx.
function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
}

function dateLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US"
}

function formatCurrency(value: number, locale: Locale) {
  const amount = new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale)).format(value)
}

function formatDate(value: string, locale: Locale) {
  return new Date(value).toLocaleDateString(dateLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }

  return `${(kb / 1024).toFixed(1)} MB`
}

async function getImageDimensions(file: File): Promise<string | null> {
  return await new Promise((resolve) => {
    const imageUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve(`${img.width} x ${img.height}`)
      URL.revokeObjectURL(imageUrl)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(imageUrl)
    }
    img.src = imageUrl
  })
}

async function getVideoDuration(file: File): Promise<number | null> {
  return await new Promise((resolve) => {
    const video = document.createElement("video")
    const fileUrl = URL.createObjectURL(file)
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      resolve(video.duration)
      URL.revokeObjectURL(fileUrl)
    }
    video.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(fileUrl)
    }
    video.src = fileUrl
  })
}

async function validateCreativeFile(file: File, type: CreativeType, t: CampaignsTranslator) {
  const messages: string[] = []

  const allowed = ACCEPTED_MIME[type]
  if (!allowed.includes(file.type)) {
    messages.push(
      t("detailsView.validation.unsupportedFileType", {
        type: t(
          `detailsView.creativeTypeOptions.${type}` as "detailsView.creativeTypeOptions.image"
        ),
      })
    )
  }

  const maxSizeMb = type === "video" ? 50 : 10
  if (file.size > maxSizeMb * 1024 * 1024) {
    messages.push(t("detailsView.validation.fileTooLarge", { maxSizeMb }))
  }

  if (type === "image" || type === "carousel") {
    const dimensions = await getImageDimensions(file)
    if (!dimensions) {
      messages.push(t("detailsView.validation.unableToReadImageDimensions"))
    }
  }

  if (type === "video") {
    const duration = await getVideoDuration(file)
    if (duration === null) {
      messages.push(t("detailsView.validation.unableToReadVideoDuration"))
    } else if (duration > 120) {
      messages.push(t("detailsView.validation.videoDurationTooLong", { maxSeconds: 120 }))
    }
  }

  return messages
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{children}</p>
    </div>
  )
}

function UploadProgress({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export function CampaignDetailsView({ campaignId }: { campaignId: string }) {
  const t = useTranslations("campaigns")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const campaignDetailsQuery = useCampaignDetails(campaignId)

  const [activeTab, setActiveTab] = useState<CampaignDetailsTab>("overview")
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false)

  const [creativeType, setCreativeType] = useState<CreativeType>("image")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const [headline, setHeadline] = useState("")
  const [description, setDescription] = useState("")
  const [callToAction, setCallToAction] = useState("")
  const [landingPageUrl, setLandingPageUrl] = useState("")
  const [tags, setTags] = useState("")

  const [creatives, setCreatives] = useState<CreativeAsset[]>([])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const details = campaignDetailsQuery.data?.payload
  const statusMeta = details ? translatedCampaignStatusMeta(details.status, t) : null

  const resetUploadForm = () => {
    setCreativeType("image")
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setUploadErrors([])
    setUploadProgress(0)
    setHeadline("")
    setDescription("")
    setCallToAction("")
    setLandingPageUrl("")
    setTags("")
  }

  const onPickFile = async (file: File | null) => {
    if (!file) {
      setSelectedFile(null)
      setUploadErrors([])
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    const validationMessages = await validateCreativeFile(file, creativeType, t)
    setUploadErrors(validationMessages)
    setSelectedFile(file)

    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file))
    } else {
      setPreviewUrl(null)
    }
  }

  const handleUpload = async () => {
    const validationMessages: string[] = []

    if (!selectedFile) {
      validationMessages.push(t("detailsView.validation.selectFileRequired"))
    }

    if (!headline.trim()) {
      validationMessages.push(t("detailsView.validation.headlineRequired"))
    }

    if (landingPageUrl.trim()) {
      try {
        new URL(landingPageUrl)
      } catch {
        validationMessages.push(t("detailsView.validation.invalidLandingPageUrl"))
      }
    }

    if (validationMessages.length > 0 || uploadErrors.length > 0) {
      setUploadErrors((prev) => [...new Set([...prev, ...validationMessages])])
      return
    }

    if (!selectedFile) {
      return
    }

    setIsUploading(true)
    setUploadProgress(10)

    await new Promise<void>((resolve) => {
      const intervalId = window.setInterval(() => {
        setUploadProgress((prev) => {
          const next = Math.min(prev + 15, 95)
          if (next >= 95) {
            window.clearInterval(intervalId)
            resolve()
          }
          return next
        })
      }, 120)
    })

    const imageDimensions =
      creativeType === "video" || creativeType === "html5"
        ? creativeType === "video"
          ? t("detailsView.creativeTypeOptions.video")
          : t("detailsView.dimensionsNotApplicable")
        : ((await getImageDimensions(selectedFile)) ?? "—")

    setUploadProgress(100)

    const now = new Date().toISOString()
    setCreatives((prev) => [
      {
        id: `cr_${Date.now()}`,
        name: selectedFile.name,
        type: creativeType,
        dimensions: imageDimensions,
        fileSize: formatFileSize(selectedFile.size),
        status: "draft",
        createdAt: now,
        source: "campaign-upload",
        headline: headline.trim(),
        description: description.trim(),
        callToAction: callToAction.trim(),
        landingPageUrl: landingPageUrl.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        previewUrl: previewUrl ?? undefined,
      },
      ...prev,
    ])

    setIsUploading(false)
    setIsUploadOpen(false)
    resetUploadForm()
  }

  if (campaignDetailsQuery.isLoading) {
    return <AppLoading variant="page" />
  }

  if (!details || !statusMeta) {
    return (
      <AppEmpty
        title={t("editScreen.notFoundTitle")}
        description={t("detailsView.notFoundDescription")}
      />
    )
  }

  return (
    <div className="space-y-6">
      <AppCard
        title={details.name}
        subtitle={details.overview}
        actions={
          <AppButton asChild icon={<Edit className="size-4" />}>
            <Link href={ROUTES.campaignsEdit(details.id)}>{t("detailsView.editAction")}</Link>
          </AppButton>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <DetailItem label={t("detailsView.detailLabels.status")}>
            <AppStatusBadge status={statusMeta.tone} label={statusMeta.label} />
          </DetailItem>
          <DetailItem label={t("detailsView.detailLabels.objective")}>
            {details.objective}
          </DetailItem>
          <DetailItem label={t("detailsView.detailLabels.channel")}>{details.channel}</DetailItem>
          <DetailItem label={t("detailsView.detailLabels.owner")}>{details.owner}</DetailItem>
          <DetailItem label={t("detailsView.detailLabels.audience")}>{details.audience}</DetailItem>
          <DetailItem label={t("detailsView.detailLabels.period")}>
            {details.startDate} <span className="inline-block rtl:rotate-180">→</span>{" "}
            {details.endDate}
          </DetailItem>
        </div>
      </AppCard>

      <div className="space-y-4">
        <div className="overflow-x-auto">
          <div
            role="tablist"
            aria-label={t("detailsView.tabsAriaLabel")}
            className="inline-flex min-w-full gap-2 rounded-xl border border-border/70 bg-card p-1"
          >
            {DETAILS_TABS.map((tab) => (
              <button
                key={tab}
                id={`tab-${tab}`}
                type="button"
                role="tab"
                aria-controls={`panel-${tab}`}
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={
                  activeTab === tab
                    ? "cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {t(`detailsView.tabs.${tab}` as "detailsView.tabs.overview")}
              </button>
            ))}
          </div>
        </div>

        <section
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="space-y-6"
        >
          {activeTab === "overview" ? (
            <>
              <AppCard
                title={t("detailsView.kpisCard.title")}
                subtitle={t("detailsView.kpisCard.subtitle")}
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <DetailItem label={t("detailsView.kpisCard.labels.totalRevenue")}>
                    {formatCurrency(details.kpis.totalRevenue, locale)}
                  </DetailItem>
                  <DetailItem label={t("detailsView.kpisCard.labels.marketingSpend")}>
                    {formatCurrency(details.kpis.marketingSpend, locale)}
                  </DetailItem>
                  <DetailItem label={t("detailsView.kpisCard.labels.roas")}>
                    {details.kpis.roas.toFixed(2)}x
                  </DetailItem>
                  <DetailItem label={t("detailsView.kpisCard.labels.cac")}>
                    {formatCurrency(details.kpis.cac, locale)}
                  </DetailItem>
                  <DetailItem label={t("detailsView.kpisCard.labels.conversionRate")}>
                    {details.kpis.conversionRate.toFixed(2)}%
                  </DetailItem>
                  <DetailItem label={t("detailsView.kpisCard.labels.websiteVisitors")}>
                    {formatNumber(details.kpis.websiteVisitors, locale)}
                  </DetailItem>
                </div>
              </AppCard>

              <AppCard
                title={t("detailsView.aiRecommendationsCard.title")}
                subtitle={t("detailsView.aiRecommendationsCard.subtitle")}
              >
                <ul className="list-disc space-y-2 ps-6 text-sm">
                  {details.aiRecommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ul>
              </AppCard>
            </>
          ) : null}

          {activeTab === "creatives" ? (
            <>
              <AppCard
                title={t("detailsView.creativesCard.title")}
                subtitle={t("detailsView.creativesCard.subtitle")}
                actions={
                  <div className="flex items-center gap-2">
                    <AppButton
                      icon={<Upload className="size-4" />}
                      onClick={() => setIsUploadOpen(true)}
                    >
                      {t("detailsView.uploadCreativeAction")}
                    </AppButton>
                    <AppButton
                      variant="outline"
                      icon={<Library className="size-4" />}
                      onClick={() => setIsAssetLibraryOpen(true)}
                    >
                      {t("detailsView.selectExistingAssetAction")}
                    </AppButton>
                  </div>
                }
              >
                {creatives.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-10">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                      <ImageIcon className="size-10 text-muted-foreground/50" />
                      <p className="text-base font-medium">{t("detailsView.emptyState.title")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("detailsView.emptyState.description")}
                      </p>
                      <AppButton
                        icon={<Plus className="size-4" />}
                        onClick={() => setIsUploadOpen(true)}
                      >
                        {t("detailsView.emptyState.action")}
                      </AppButton>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {creatives.map((creative) => {
                      const TypeIcon = getCreativeTypeIcon(creative.type)
                      const status = getCreativeStatusMeta(creative.status, t)

                      return (
                        <article
                          key={creative.id}
                          className="rounded-xl border border-border/70 bg-card p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-muted/40">
                                <TypeIcon className="size-4" />
                              </span>
                              <div>
                                <p className="text-sm font-medium">{creative.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {creative.type.toUpperCase()}
                                </p>
                              </div>
                            </div>

                            <AppDropdownMenu>
                              <AppDropdownMenuTrigger asChild>
                                <AppButton
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("detailsView.actionsForCreativeAriaLabel", {
                                    name: creative.name,
                                  })}
                                >
                                  <MoreHorizontal className="size-4" />
                                </AppButton>
                              </AppDropdownMenuTrigger>
                              <AppDropdownMenuContent align="end">
                                <AppDropdownMenuItem>
                                  <Eye className="size-4" />
                                  {t("creativeLibrary.actions.preview")}
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    setCreatives((prev) =>
                                      prev.filter((item) => item.id !== creative.id)
                                    )
                                  }
                                >
                                  <Trash2 className="size-4" />
                                  {t("detailsView.removeAction")}
                                </AppDropdownMenuItem>
                              </AppDropdownMenuContent>
                            </AppDropdownMenu>
                          </div>

                          <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-2">
                            {creative.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={creative.previewUrl}
                                alt={creative.name}
                                className="h-32 w-full rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-32 items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
                                {t("detailsView.previewUnavailable")}
                              </div>
                            )}
                          </div>

                          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center justify-between">
                              <span>{t("detailsView.creativeMeta.dimensions")}</span>
                              <span className="text-foreground">{creative.dimensions}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t("detailsView.creativeMeta.fileSize")}</span>
                              <span className="text-foreground">{creative.fileSize}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t("detailsView.creativeMeta.created")}</span>
                              <span className="text-foreground">
                                {formatDate(creative.createdAt, locale)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <AppStatusBadge status={status.tone} label={status.label} />
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </AppCard>

              <AppDialog
                open={isUploadOpen}
                onOpenChange={(open) => {
                  setIsUploadOpen(open)
                  if (!open) {
                    resetUploadForm()
                  }
                }}
                title={t("detailsView.uploadCreativeAction")}
                description={t("detailsView.uploadDialog.description")}
                contentClassName="sm:max-w-2xl"
                footer={
                  <>
                    <AppButton
                      variant="outline"
                      onClick={() => setIsUploadOpen(false)}
                      disabled={isUploading}
                    >
                      {tCommon("cancel")}
                    </AppButton>
                    <AppButton onClick={handleUpload} loading={isUploading} disabled={isUploading}>
                      {t("detailsView.uploadCreativeAction")}
                    </AppButton>
                  </>
                }
              >
                <div className="space-y-4">
                  <div
                    className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-4"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      void onPickFile(event.dataTransfer.files?.[0] ?? null)
                    }}
                  >
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Upload className="size-6 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {t("detailsView.uploadDialog.dropzoneTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("detailsView.uploadDialog.supportedFormats")}
                      </p>
                      <label>
                        <input
                          type="file"
                          className="sr-only"
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/zip"
                          onChange={(event) => {
                            void onPickFile(event.target.files?.[0] ?? null)
                          }}
                        />
                        <span className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/30">
                          {t("detailsView.uploadDialog.browseFiles")}
                        </span>
                      </label>
                    </div>
                  </div>

                  {selectedFile ? (
                    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <HardDrive className="size-4 text-muted-foreground" />
                        <span>{selectedFile.name}</span>
                        <span className="text-muted-foreground">
                          ({formatFileSize(selectedFile.size)})
                        </span>
                      </div>

                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt={t("detailsView.uploadDialog.creativePreviewAlt")}
                          className="h-36 w-full rounded-lg object-cover"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {isUploading ? (
                    <UploadProgress
                      value={uploadProgress}
                      label={t("detailsView.uploadProgressLabel")}
                    />
                  ) : null}

                  {uploadErrors.length > 0 ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                      <ul className="space-y-1 text-sm text-destructive">
                        {uploadErrors.map((error) => (
                          <li key={error} className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 size-4" />
                            <span>{error}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <AppSelect
                      value={creativeType}
                      onValueChange={(value) => setCreativeType(value as CreativeType)}
                    >
                      <AppSelectTrigger className="h-9 rounded-xl">
                        <AppSelectValue
                          placeholder={t("detailsView.uploadForm.creativeTypePlaceholder")}
                        />
                      </AppSelectTrigger>
                      <AppSelectContent align="start" position="popper">
                        {CREATIVE_TYPE_OPTIONS.map((option) => (
                          <AppSelectItem key={option} value={option}>
                            {t(
                              `detailsView.creativeTypeOptions.${option}` as "detailsView.creativeTypeOptions.image"
                            )}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>

                    <AppSelect value={callToAction} onValueChange={setCallToAction}>
                      <AppSelectTrigger className="h-9 rounded-xl">
                        <AppSelectValue
                          placeholder={t("detailsView.uploadForm.callToActionPlaceholder")}
                        />
                      </AppSelectTrigger>
                      <AppSelectContent align="start" position="popper">
                        {CTA_OPTIONS.map((option) => (
                          <AppSelectItem key={option.value} value={option.value}>
                            {t(
                              `detailsView.ctaOptions.${option.key}` as "detailsView.ctaOptions.learnMore"
                            )}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>

                    <AppInput
                      label={t("detailsView.uploadForm.headlineLabel")}
                      required
                      value={headline}
                      onChange={(event) => setHeadline(event.target.value)}
                      placeholder={t("detailsView.uploadForm.headlinePlaceholder")}
                    />

                    <AppInput
                      label={t("detailsView.uploadForm.landingPageUrlLabel")}
                      value={landingPageUrl}
                      onChange={(event) => setLandingPageUrl(event.target.value)}
                      placeholder="https://example.com/page"
                    />

                    <AppInput
                      label={t("detailsView.uploadForm.tagsLabel")}
                      wrapperClassName="md:col-span-2"
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder={t("detailsView.uploadForm.tagsPlaceholder")}
                    />

                    <AppTextarea
                      label={t("detailsView.uploadForm.descriptionLabel")}
                      wrapperClassName="md:col-span-2"
                      className="min-h-[84px]"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={t("detailsView.uploadForm.descriptionPlaceholder")}
                    />
                  </div>
                </div>
              </AppDialog>

              <AppDialog
                open={isAssetLibraryOpen}
                onOpenChange={setIsAssetLibraryOpen}
                title={t("detailsView.selectExistingAssetAction")}
                description={t("detailsView.assetLibraryDialog.description")}
                footer={
                  <AppButton onClick={() => setIsAssetLibraryOpen(false)}>
                    {t("detailsView.closeAction")}
                  </AppButton>
                }
              >
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t("detailsView.assetLibraryDialog.bodyText")}
                </div>
              </AppDialog>
            </>
          ) : null}

          {activeTab === "audience" ? (
            <AppCard
              title={t("detailsView.audienceCard.title")}
              subtitle={t("detailsView.audienceCard.subtitle")}
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("detailsView.audienceCard.segmentsHeading")}
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {details.audienceSummary.map((item) => (
                      <li
                        key={item.segment}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <span>{item.segment}</span>
                        <span>{item.percentage}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    {t("detailsView.audienceCard.contributionHeading")}
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {details.channelsSummary.map((item) => (
                      <li
                        key={item.channel}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <span>{item.channel}</span>
                        <span>{item.contribution}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AppCard>
          ) : null}

          {activeTab === "budget" ? (
            <AppCard
              title={t("detailsView.budgetCard.title")}
              subtitle={t("detailsView.budgetCard.subtitle")}
            >
              <ul className="space-y-2 text-sm">
                {details.budgetSummary.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <span>{item.label}</span>
                    <span>{formatCurrency(item.value, locale)}</span>
                  </li>
                ))}
              </ul>
            </AppCard>
          ) : null}

          {activeTab === "performance" ? (
            <AppCard
              title={t("detailsView.performanceCard.title")}
              subtitle={t("detailsView.performanceCard.subtitle")}
            >
              <ul className="space-y-2 text-sm">
                {details.performance.map((item) => (
                  <li
                    key={item.month}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <span>{item.month}</span>
                    <span>{formatCurrency(item.spend, locale)}</span>
                    <span>{formatCurrency(item.revenue, locale)}</span>
                    <span>
                      {t("detailsView.performanceCard.leadsSuffix", {
                        count: formatNumber(item.leads, locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </AppCard>
          ) : null}

          {activeTab === "activity" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <AppCard title={t("detailsView.activityTab.timelineTitle")}>
                <ul className="space-y-2 text-sm">
                  {details.timeline.map((entry) => (
                    <li
                      key={`${entry.date}-${entry.title}`}
                      className="rounded-lg border px-3 py-2"
                    >
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-muted-foreground">{entry.date}</p>
                      <p>{entry.description}</p>
                    </li>
                  ))}
                </ul>
              </AppCard>

              <AppCard title={t("detailsView.activityTab.recentActivityTitle")}>
                <ul className="space-y-2 text-sm">
                  {details.activity.map((entry) => (
                    <li key={entry.id} className="rounded-lg border px-3 py-2">
                      <p className="font-medium">{entry.action}</p>
                      <p className="text-muted-foreground">{entry.occurredAt}</p>
                      <p>{entry.actor}</p>
                      <p>{entry.details}</p>
                    </li>
                  ))}
                </ul>
              </AppCard>
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <AppCard
              title={t("detailsView.settingsCard.title")}
              subtitle={t("detailsView.settingsCard.subtitle")}
            >
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                {t("detailsView.settingsCard.bodyText")}
              </div>
            </AppCard>
          ) : null}
        </section>
      </div>
    </div>
  )
}
