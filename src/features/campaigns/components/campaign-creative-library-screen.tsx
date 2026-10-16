"use client"

import { lazy, Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { FileText, Film, ImageIcon, Plus, Tags, Upload } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppPageHeader,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { CampaignModuleNav } from "./campaign-module-nav"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"

const CreativeUploadArea = lazy(async () => {
  const mod = await import("./campaign-creative-upload-area")
  return { default: mod.CampaignCreativeUploadArea }
})

type CreativeAsset = {
  id: string
  name: string
  type: "image" | "video" | "logo" | "pdf" | "html5" | "headline" | "description" | "cta"
  platforms: string[]
  size: string
  modified: string
  tags: string[]
  usageCount: number
}

const MOCK_CREATIVES: CreativeAsset[] = [
  {
    id: "1",
    name: "Summer Promo - Carousel",
    type: "image",
    platforms: ["Meta", "TikTok"],
    size: "1080x1080",
    modified: "2 days ago",
    tags: ["summer", "promo"],
    usageCount: 4,
  },
  {
    id: "2",
    name: "Brand Intro 15s",
    type: "video",
    platforms: ["Meta", "YouTube", "TikTok"],
    size: "1920x1080",
    modified: "1 week ago",
    tags: ["video", "brand"],
    usageCount: 7,
  },
  {
    id: "3",
    name: "CTA - Shop Now",
    type: "cta",
    platforms: ["Meta", "Google"],
    size: "Text",
    modified: "5 days ago",
    tags: ["cta"],
    usageCount: 12,
  },
]

const TYPE_OPTIONS = [
  { value: "all", labelKey: "all" },
  { value: "image", labelKey: "image" },
  { value: "video", labelKey: "video" },
  { value: "logo", labelKey: "logo" },
  { value: "pdf", labelKey: "pdf" },
  { value: "html5", labelKey: "html5" },
  { value: "headline", labelKey: "headline" },
  { value: "description", labelKey: "description" },
  { value: "cta", labelKey: "cta" },
] as const

export function CampaignCreativeLibraryScreen() {
  const t = useTranslations("campaigns.creativeLibrary")
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo") || ROUTES.campaignsCreate

  const [search, setSearch] = useState("")
  const [type, setType] = useState("all")

  const filtered = useMemo(() => {
    return MOCK_CREATIVES.filter((asset) => {
      const matchesType = type === "all" || asset.type === type
      const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [search, type])

  return (
    <div className="space-y-4">
      <CampaignModuleNav />

      <AppPageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<AppButton icon={<Plus className="size-4" />}>{t("newCreative")}</AppButton>}
      />

      <AppCard title={t("uploadCard.title")} subtitle={t("uploadCard.subtitle")}>
        <Suspense
          fallback={
            <div className="h-52 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
          }
        >
          <CreativeUploadArea />
        </Suspense>
      </AppCard>

      <AppCard title={t("libraryCard.title")} subtitle={t("libraryCard.subtitle")}>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(320px,1fr)_220px]">
            <AppSearchInput
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <AppSelect value={type} onValueChange={setType}>
              <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                <AppSelectValue placeholder={t("typeFilterPlaceholder")} />
              </AppSelectTrigger>
              <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                {TYPE_OPTIONS.map((option) => (
                  <AppSelectItem
                    key={option.value}
                    value={option.value}
                    className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                  >
                    {t(`typeOptions.${option.labelKey}`)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-10 text-center">
              <p className="text-sm font-medium">{t("emptyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyDescription")}</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((asset) => (
                <article key={asset.id} className="rounded-xl border border-border/70 bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-border/60 bg-muted/20 text-muted-foreground">
                      <TypeIcon type={asset.type} />
                    </div>
                    <AppBadge variant="outline">
                      {t("usedCount", { count: asset.usageCount })}
                    </AppBadge>
                  </div>

                  <p className="text-sm font-semibold">{asset.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("lastModified", { modified: asset.modified })}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {asset.platforms.map((platform) => (
                      <AppBadge
                        key={platform}
                        variant="outline"
                        className="rounded-full px-2 py-0 text-[11px]"
                      >
                        {platform}
                      </AppBadge>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{asset.size}</span>
                    <span className="inline-flex items-center gap-1">
                      <Tags className="size-3.5" />
                      {asset.tags.join(", ")}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <AppButton size="sm" variant="outline">
                      {t("actions.preview")}
                    </AppButton>
                    <AppButton asChild size="sm" variant="outline">
                      <Link href={`${returnTo}?creative=${encodeURIComponent(asset.id)}`}>
                        {t("actions.use")}
                      </Link>
                    </AppButton>
                    <AppButton size="sm" variant="outline">
                      {t("actions.edit")}
                    </AppButton>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </AppCard>
    </div>
  )
}

function TypeIcon({ type }: { type: CreativeAsset["type"] }) {
  if (type === "video") return <Film className="size-4" />
  if (type === "pdf") return <FileText className="size-4" />
  if (type === "headline" || type === "description" || type === "cta")
    return <Upload className="size-4" />
  return <ImageIcon className="size-4" />
}
