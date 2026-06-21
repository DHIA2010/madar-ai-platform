"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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
import { getCampaignStatusMeta } from "../services"

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

const DETAILS_TABS: Array<{ key: CampaignDetailsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "creatives", label: "Creatives" },
  { key: "audience", label: "Audience" },
  { key: "budget", label: "Budget" },
  { key: "performance", label: "Performance" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
]

const CREATIVE_TYPE_OPTIONS: Array<{ value: CreativeType; label: string }> = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "html5", label: "HTML5" },
]

const CTA_OPTIONS = ["Learn More", "Shop Now", "Get Offer", "Sign Up", "Contact Us"]

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

function getCreativeStatusMeta(status: CreativeStatus) {
  if (status === "ready") {
    return { label: "Ready", tone: "success" as const }
  }
  if (status === "needs_review") {
    return { label: "Needs Review", tone: "warning" as const }
  }
  return { label: "Draft", tone: "neutral" as const }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
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

async function validateCreativeFile(file: File, type: CreativeType) {
  const messages: string[] = []

  const allowed = ACCEPTED_MIME[type]
  if (!allowed.includes(file.type)) {
    messages.push(`Unsupported file type for ${type}.`)
  }

  const maxSizeMb = type === "video" ? 50 : 10
  if (file.size > maxSizeMb * 1024 * 1024) {
    messages.push(`File is too large. Maximum allowed size is ${maxSizeMb} MB.`)
  }

  if (type === "image" || type === "carousel") {
    const dimensions = await getImageDimensions(file)
    if (!dimensions) {
      messages.push("Unable to read image dimensions.")
    }
  }

  if (type === "video") {
    const duration = await getVideoDuration(file)
    if (duration === null) {
      messages.push("Unable to read video duration.")
    } else if (duration > 120) {
      messages.push("Video duration must be 120 seconds or less.")
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

function UploadProgress({ value }: { value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Upload Progress</span>
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
  const statusMeta = details ? getCampaignStatusMeta(details.status) : null

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

    const validationMessages = await validateCreativeFile(file, creativeType)
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
      validationMessages.push("Please select a file to upload.")
    }

    if (!headline.trim()) {
      validationMessages.push("Headline is required.")
    }

    if (landingPageUrl.trim()) {
      try {
        new URL(landingPageUrl)
      } catch {
        validationMessages.push("Landing page URL must be a valid URL.")
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
          ? "Video"
          : "N/A"
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
    return <AppEmpty title="Campaign not found" description="Unable to load campaign details." />
  }

  return (
    <div className="space-y-6">
      <AppCard
        title={details.name}
        subtitle={details.overview}
        actions={
          <AppButton asChild icon={<Edit className="size-4" />}>
            <Link href={ROUTES.campaignsEdit(details.id)}>Edit</Link>
          </AppButton>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <DetailItem label="Status">
            <AppStatusBadge status={statusMeta.tone} label={statusMeta.label} />
          </DetailItem>
          <DetailItem label="Objective">{details.objective}</DetailItem>
          <DetailItem label="Channel">{details.channel}</DetailItem>
          <DetailItem label="Owner">{details.owner}</DetailItem>
          <DetailItem label="Audience">{details.audience}</DetailItem>
          <DetailItem label="Period">
            {details.startDate} → {details.endDate}
          </DetailItem>
        </div>
      </AppCard>

      <div className="space-y-4">
        <div className="overflow-x-auto">
          <div
            role="tablist"
            aria-label="Campaign details tabs"
            className="inline-flex min-w-full gap-2 rounded-xl border border-border/70 bg-card p-1"
          >
            {DETAILS_TABS.map((tab) => (
              <button
                key={tab.key}
                id={`tab-${tab.key}`}
                type="button"
                role="tab"
                aria-controls={`panel-${tab.key}`}
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  activeTab === tab.key
                    ? "cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {tab.label}
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
              <AppCard title="KPIs" subtitle="Core marketing performance indicators">
                <div className="grid gap-4 md:grid-cols-3">
                  <DetailItem label="Total Revenue">
                    {formatCurrency(details.kpis.totalRevenue)}
                  </DetailItem>
                  <DetailItem label="Marketing Spend">
                    {formatCurrency(details.kpis.marketingSpend)}
                  </DetailItem>
                  <DetailItem label="ROAS">{details.kpis.roas.toFixed(2)}x</DetailItem>
                  <DetailItem label="CAC">{formatCurrency(details.kpis.cac)}</DetailItem>
                  <DetailItem label="Conversion Rate">
                    {details.kpis.conversionRate.toFixed(2)}%
                  </DetailItem>
                  <DetailItem label="Website Visitors">
                    {formatNumber(details.kpis.websiteVisitors)}
                  </DetailItem>
                </div>
              </AppCard>

              <AppCard title="AI Recommendations" subtitle="Mock insights">
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
                title="Creatives"
                subtitle="Upload and manage campaign assets after campaign setup."
                actions={
                  <div className="flex items-center gap-2">
                    <AppButton
                      icon={<Upload className="size-4" />}
                      onClick={() => setIsUploadOpen(true)}
                    >
                      Upload Creative
                    </AppButton>
                    <AppButton
                      variant="outline"
                      icon={<Library className="size-4" />}
                      onClick={() => setIsAssetLibraryOpen(true)}
                    >
                      Select Existing Asset
                    </AppButton>
                  </div>
                }
              >
                {creatives.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-10">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                      <ImageIcon className="size-10 text-muted-foreground/50" />
                      <p className="text-base font-medium">No creatives uploaded yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Start by uploading your first creative asset for this campaign.
                      </p>
                      <AppButton
                        icon={<Plus className="size-4" />}
                        onClick={() => setIsUploadOpen(true)}
                      >
                        Upload your first creative
                      </AppButton>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {creatives.map((creative) => {
                      const TypeIcon = getCreativeTypeIcon(creative.type)
                      const status = getCreativeStatusMeta(creative.status)

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
                                  aria-label={`Actions for ${creative.name}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </AppButton>
                              </AppDropdownMenuTrigger>
                              <AppDropdownMenuContent align="end">
                                <AppDropdownMenuItem>
                                  <Eye className="size-4" />
                                  Preview
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
                                  Remove
                                </AppDropdownMenuItem>
                              </AppDropdownMenuContent>
                            </AppDropdownMenu>
                          </div>

                          <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-2">
                            {creative.previewUrl ? (
                              <img
                                src={creative.previewUrl}
                                alt={creative.name}
                                className="h-32 w-full rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-32 items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
                                Preview unavailable
                              </div>
                            )}
                          </div>

                          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center justify-between">
                              <span>Dimensions</span>
                              <span className="text-foreground">{creative.dimensions}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>File size</span>
                              <span className="text-foreground">{creative.fileSize}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Created</span>
                              <span className="text-foreground">
                                {formatDate(creative.createdAt)}
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
                title="Upload Creative"
                description="Upload a creative asset and provide delivery metadata for this campaign."
                contentClassName="sm:max-w-2xl"
                footer={
                  <>
                    <AppButton
                      variant="outline"
                      onClick={() => setIsUploadOpen(false)}
                      disabled={isUploading}
                    >
                      Cancel
                    </AppButton>
                    <AppButton onClick={handleUpload} loading={isUploading} disabled={isUploading}>
                      Upload Creative
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
                      <p className="text-sm font-medium">Drag and drop your creative here</p>
                      <p className="text-xs text-muted-foreground">
                        Supported: JPG, PNG, WEBP, MP4, MOV, WEBM, ZIP (HTML5)
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
                          Browse Files
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
                        <img
                          src={previewUrl}
                          alt="Creative preview"
                          className="h-36 w-full rounded-lg object-cover"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {isUploading ? <UploadProgress value={uploadProgress} /> : null}

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
                        <AppSelectValue placeholder="Creative type" />
                      </AppSelectTrigger>
                      <AppSelectContent align="start" position="popper">
                        {CREATIVE_TYPE_OPTIONS.map((option) => (
                          <AppSelectItem key={option.value} value={option.value}>
                            {option.label}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>

                    <AppSelect value={callToAction} onValueChange={setCallToAction}>
                      <AppSelectTrigger className="h-9 rounded-xl">
                        <AppSelectValue placeholder="Call to action" />
                      </AppSelectTrigger>
                      <AppSelectContent align="start" position="popper">
                        {CTA_OPTIONS.map((option) => (
                          <AppSelectItem key={option} value={option}>
                            {option}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>

                    <AppInput
                      label="Headline"
                      required
                      value={headline}
                      onChange={(event) => setHeadline(event.target.value)}
                      placeholder="Creative headline"
                    />

                    <AppInput
                      label="Landing Page URL"
                      value={landingPageUrl}
                      onChange={(event) => setLandingPageUrl(event.target.value)}
                      placeholder="https://example.com/page"
                    />

                    <AppInput
                      label="Tags"
                      wrapperClassName="md:col-span-2"
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="awareness, q3, ecommerce"
                    />

                    <AppTextarea
                      label="Description"
                      wrapperClassName="md:col-span-2"
                      className="min-h-[84px]"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Add a short description for this creative..."
                    />
                  </div>
                </div>
              </AppDialog>

              <AppDialog
                open={isAssetLibraryOpen}
                onOpenChange={setIsAssetLibraryOpen}
                title="Select Existing Asset"
                description="Asset Library integration is ready in structure and will be enabled in a future sprint."
                footer={<AppButton onClick={() => setIsAssetLibraryOpen(false)}>Close</AppButton>}
              >
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  This campaign is currently configured to upload assets directly. Shared library
                  selection will plug into this entry point.
                </div>
              </AppDialog>
            </>
          ) : null}

          {activeTab === "audience" ? (
            <AppCard
              title="Audience Insights"
              subtitle="Audience and channel distribution for this campaign."
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium">Audience Segments</h3>
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
                  <h3 className="mb-2 text-sm font-medium">Channel Contribution</h3>
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
            <AppCard title="Budget Allocation" subtitle="Budget, spend, and remaining allocation.">
              <ul className="space-y-2 text-sm">
                {details.budgetSummary.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <span>{item.label}</span>
                    <span>{formatCurrency(item.value)}</span>
                  </li>
                ))}
              </ul>
            </AppCard>
          ) : null}

          {activeTab === "performance" ? (
            <AppCard title="Performance" subtitle="Monthly performance snapshot.">
              <ul className="space-y-2 text-sm">
                {details.performance.map((item) => (
                  <li
                    key={item.month}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <span>{item.month}</span>
                    <span>{formatCurrency(item.spend)}</span>
                    <span>{formatCurrency(item.revenue)}</span>
                    <span>{formatNumber(item.leads)} leads</span>
                  </li>
                ))}
              </ul>
            </AppCard>
          ) : null}

          {activeTab === "activity" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <AppCard title="Timeline">
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

              <AppCard title="Recent Activity">
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
              title="Campaign Settings"
              subtitle="Settings controls can be expanded here without changing tab structure."
            >
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Settings controls are intentionally lightweight in this sprint and ready for future
                expansion.
              </div>
            </AppCard>
          ) : null}
        </section>
      </div>
    </div>
  )
}
