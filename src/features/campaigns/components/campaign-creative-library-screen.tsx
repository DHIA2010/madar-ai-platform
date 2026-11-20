"use client"

// مكتبة التصاميم: the images and videos the organization keeps for its ads (backend:
// campaigns/creatives.ts). A file is uploaded once here -- or straight from the campaign wizard
// -- and can then be used in any campaign published from Madar. Each creative is one compact row:
// a small preview (opened full-size on a tap), its name (renamed in place), the campaigns it was
// used in, the numbers its ads collected and its rank among the others
// (campaigns/creative-insights.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  Check,
  Eye,
  ImagePlus,
  Loader2,
  Megaphone,
  Pencil,
  Trash2,
  Trophy,
  UploadCloud,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog, AppInput } from "@/components/app"

import { Can } from "@/features/authentication"

import {
  campaignPublishingService,
  type Creative,
  type CreativeInsights,
} from "../services/campaign-publishing.service"
import {
  CREATIVE_ACCEPT,
  CreativeThumb,
  formatBytes,
  SnapchatFitBadge,
  useCreativeUploader,
} from "./campaign-creative-shared"
import { CampaignModuleNav } from "./campaign-module-nav"

import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

type KindFilter = "all" | "image" | "video"
const KIND_FILTERS: KindFilter[] = ["all", "image", "video"]

type SortKey = "newest" | "performance" | "usage"
const SORT_KEYS: SortKey[] = ["newest", "performance", "usage"]

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className={cn("truncate text-[11px]", MUTED)}>{label}</p>
      <p className={cn("mt-0.5 truncate text-[14px] font-extrabold", HEADING)} dir="ltr">
        {value}
      </p>
    </div>
  )
}

function RankBadge({ insights }: { insights: CreativeInsights | undefined }) {
  const t = useTranslations("campaigns.creativeLibrary.rank")
  if (!insights || insights.campaigns.length === 0) return null
  if (insights.rank === null) {
    return (
      <span
        className="rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[11.5px] font-bold text-[#475467]"
        title={t("pendingHint")}
      >
        {t("pending")}
      </span>
    )
  }
  const best = insights.rank === 1
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold",
        best ? "bg-[#fff4d6] text-[#935f00]" : "bg-[#eef4ff] text-[#1d4fd8]"
      )}
      title={t("hint")}
    >
      {best ? <Trophy className="size-3.5" /> : null}
      {best && insights.rankedOutOf > 1
        ? t("best")
        : t("position", { rank: insights.rank, total: insights.rankedOutOf })}
    </span>
  )
}

export function CampaignCreativeLibraryScreen() {
  const t = useTranslations("campaigns.creativeLibrary")
  const locale = useLocale() as Locale
  const fileInput = useRef<HTMLInputElement>(null)

  const [creatives, setCreatives] = useState<Creative[] | null>(null)
  const [insights, setInsights] = useState<Map<string, CreativeInsights>>(new Map())
  const [loadFailed, setLoadFailed] = useState(false)
  const [filter, setFilter] = useState<KindFilter>("all")
  const [sort, setSort] = useState<SortKey>("newest")
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [preview, setPreview] = useState<Creative | null>(null)

  const load = useCallback(() => {
    setLoadFailed(false)
    campaignPublishingService
      .listCreatives()
      .then(setCreatives)
      .catch(() => setLoadFailed(true))
    // The numbers are an extra: the library still shows without them.
    campaignPublishingService
      .creativeInsights()
      .then((items) => setInsights(new Map(items.map((item) => [item.creativeId, item]))))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { upload, progress } = useCreativeUploader(
    useCallback((creative: Creative) => {
      setCreatives((current) => [creative, ...(current ?? [])])
    }, [])
  )

  const visible = useMemo(() => {
    const list = (creatives ?? []).filter(
      (creative) => filter === "all" || creative.kind === filter
    )
    if (sort === "newest") return list
    const sorted = [...list]
    if (sort === "usage") {
      sorted.sort(
        (a, b) =>
          (insights.get(b.id)?.campaigns.length ?? 0) - (insights.get(a.id)?.campaigns.length ?? 0)
      )
    } else {
      // Ranked creatives first, best on top; then the ones with some numbers; then the rest.
      const weight = (creative: Creative) => {
        const own = insights.get(creative.id)
        if (!own) return [2, 0, 0]
        if (own.rank !== null) return [0, own.rank, 0]
        return [1, 0, -own.impressions]
      }
      sorted.sort((a, b) => {
        const [groupA, rankA, seenA] = weight(a)
        const [groupB, rankB, seenB] = weight(b)
        return groupA - groupB || rankA - rankB || seenA - seenB
      })
    }
    return sorted
  }, [creatives, filter, sort, insights])

  const remove = async (id: string) => {
    setRemoving(id)
    try {
      await campaignPublishingService.removeCreative(id)
      setCreatives((current) => (current ?? []).filter((creative) => creative.id !== id))
      toast.success(t("removed"))
    } catch {
      toast.error(t("removeFailed"))
    } finally {
      setRemoving(null)
      setConfirming(null)
    }
  }

  const saveName = async () => {
    if (!renaming) return
    const name = renaming.name.trim()
    const current = creatives?.find((creative) => creative.id === renaming.id)
    if (!name || name === current?.name) {
      setRenaming(null)
      return
    }
    setSavingName(true)
    try {
      const saved = await campaignPublishingService.renameCreative(renaming.id, name)
      setCreatives((list) =>
        (list ?? []).map((creative) => (creative.id === saved.id ? saved : creative))
      )
      toast.success(t("renamed"))
      setRenaming(null)
    } catch {
      toast.error(t("renameFailed"))
    } finally {
      setSavingName(false)
    }
  }

  const numberLocale = locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB"
  const whole = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 })
  const money = (amount: number, currency: string | null) => {
    const code = currency ?? "SAR"
    const figure = new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
    return `${figure} ${code === "SAR" && locale === "ar" ? "ر.س" : code}`
  }
  const dateFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  )

  return (
    <div
      className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-4 py-5 md:px-6")}
      dir={localeDirection(locale)}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
              {t("title")}
            </h1>
            <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("subtitle")}</p>
          </div>
          <Can permission="campaigns:create">
            <button
              type="button"
              disabled={progress !== null}
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] bg-[#1d4fd8] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1a45bd] disabled:opacity-60"
            >
              {progress ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {progress ? t("uploading", progress) : t("upload")}
            </button>
          </Can>
        </div>

        <CampaignModuleNav />

        <input
          ref={fileInput}
          type="file"
          multiple
          accept={CREATIVE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void upload(event.target.files)
            event.target.value = ""
          }}
        />

        <Can permission="campaigns:create">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void upload(event.dataTransfer.files)
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-[14px] border-2 border-dashed px-4 py-3 text-start transition-colors",
              dragging
                ? "border-[#1d4fd8] bg-[#eef4ff]"
                : "border-[#cfd8e6] bg-white hover:border-[#1d4fd8]/50"
            )}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]">
              {progress ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <UploadCloud className="size-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[14px] font-bold", HEADING)}>
                {progress ? t("uploading", progress) : t("dropzone.title")}
              </span>
              <span className={cn("mt-0.5 block text-[12px] leading-5", MUTED)}>
                {t("dropzone.hint")}
              </span>
            </span>
          </button>
        </Can>

        <div className={cn(PANEL, "p-4 md:p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {KIND_FILTERS.map((kind) => {
                const count =
                  kind === "all"
                    ? (creatives?.length ?? 0)
                    : (creatives ?? []).filter((creative) => creative.kind === kind).length
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setFilter(kind)}
                    className={cn(
                      "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[12.5px] font-semibold transition-colors",
                      filter === kind
                        ? "border-[#1d4fd8] bg-[#1d4fd8] text-white"
                        : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#1d4fd8]/40"
                    )}
                  >
                    {t(`filters.${kind}`)}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px]",
                        filter === kind ? "bg-white/20" : "bg-[#f1f4f9]"
                      )}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("text-[12px]", MUTED)}>{t("sort.label")}</span>
              {SORT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={cn(
                    "h-10 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors",
                    sort === key
                      ? "bg-[#eef4ff] text-[#1d4fd8]"
                      : "text-[#3b4a66] hover:bg-[#f4f6fa]"
                  )}
                >
                  {t(`sort.${key}`)}
                </button>
              ))}
            </div>
          </div>
          <p className={cn("mt-3 text-[11.5px] leading-5", MUTED)}>{t("numbersNote")}</p>

          <div className="mt-3">
            {loadFailed ? (
              <div className="py-14 text-center">
                <p className={cn("text-[14px] font-bold", HEADING)}>{t("loadFailed")}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-3 h-11 rounded-[10px] border border-[#e1e7f0] px-5 text-[13px] font-semibold text-[#1d4fd8]"
                >
                  {t("retry")}
                </button>
              </div>
            ) : creatives === null ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-[104px] animate-pulse rounded-[12px] bg-[#eef1f6]"
                  />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="py-14 text-center">
                <p className={cn("text-[15px] font-bold", HEADING)}>{t("emptyTitle")}</p>
                <p className={cn("mx-auto mt-1.5 max-w-[460px] text-[12.5px] leading-6", MUTED)}>
                  {t("emptyDescription")}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {visible.map((creative) => {
                  const own = insights.get(creative.id)
                  const used = own?.campaigns ?? []
                  const editing = renaming?.id === creative.id
                  return (
                    <li
                      key={creative.id}
                      className="rounded-[12px] border border-[#e1e7f0] bg-white p-3"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 items-start gap-3 lg:w-[34%]">
                          <button
                            type="button"
                            onClick={() => setPreview(creative)}
                            aria-label={t("preview", { name: creative.name })}
                            title={t("previewHint")}
                            className="shrink-0 overflow-hidden rounded-[10px] ring-1 ring-[#e1e7f0] transition hover:ring-2 hover:ring-[#1d4fd8]"
                          >
                            <CreativeThumb creative={creative} className="h-[96px] w-[54px]" />
                          </button>
                          <div className="min-w-0 flex-1">
                            {editing ? (
                              <div className="flex items-center gap-1.5">
                                <AppInput
                                  autoFocus
                                  maxLength={120}
                                  value={renaming.name}
                                  disabled={savingName}
                                  aria-label={t("renameLabel")}
                                  onChange={(event) =>
                                    setRenaming({ id: creative.id, name: event.target.value })
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") void saveName()
                                    if (event.key === "Escape") setRenaming(null)
                                  }}
                                  className="h-10 min-w-0 flex-1 rounded-[10px] text-[13px]"
                                />
                                <button
                                  type="button"
                                  disabled={savingName}
                                  onClick={() => void saveName()}
                                  aria-label={t("saveName")}
                                  title={t("saveName")}
                                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#1d4fd8] text-white disabled:opacity-60"
                                >
                                  {savingName ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Check className="size-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingName}
                                  onClick={() => setRenaming(null)}
                                  aria-label={t("cancel")}
                                  title={t("cancel")}
                                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e1e7f0] text-[#3b4a66]"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <p
                                  className={cn("min-w-0 truncate text-[14px] font-bold", HEADING)}
                                  title={creative.name}
                                >
                                  {creative.name}
                                </p>
                                <Can permission="campaigns:create">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRenaming({ id: creative.id, name: creative.name })
                                    }
                                    aria-label={t("rename", { name: creative.name })}
                                    title={t("renameLabel")}
                                    className="flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[#6b7b96] transition-colors hover:bg-[#f4f6fa] hover:text-[#1d4fd8]"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                </Can>
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <SnapchatFitBadge creative={creative} />
                              <span className={cn("text-[11.5px]", MUTED)} dir="ltr">
                                {creative.width && creative.height
                                  ? `${creative.width}×${creative.height} · `
                                  : ""}
                                {creative.durationSeconds
                                  ? `${Math.round(creative.durationSeconds)}s · `
                                  : ""}
                                {formatBytes(creative.sizeBytes)}
                              </span>
                              <span className={cn("text-[11.5px]", MUTED)}>
                                {dateFormat.format(new Date(creative.createdAt))}
                              </span>
                            </div>
                            <p className={cn("mt-1.5 text-[12px] leading-5", MUTED)}>
                              {used.length === 0 ? (
                                t("usage.none")
                              ) : (
                                <>
                                  <span className="font-bold text-[#3b4a66]">
                                    {t("usage.count", { count: used.length })}
                                  </span>{" "}
                                  {used.map((campaign) => campaign.name).join("، ")}
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="grid min-w-0 flex-1 grid-cols-3 gap-x-3 gap-y-2 rounded-[10px] bg-[#f7f9fd] px-3 py-2.5 sm:grid-cols-5">
                          <Figure
                            label={t("numbers.impressions")}
                            value={own ? whole.format(own.impressions) : "—"}
                          />
                          <Figure
                            label={t("numbers.clicks")}
                            value={own ? whole.format(own.clicks) : "—"}
                          />
                          <Figure
                            label={t("numbers.clickRate")}
                            value={
                              own && own.clickRate !== null ? `${own.clickRate.toFixed(2)}%` : "—"
                            }
                          />
                          <Figure
                            label={t("numbers.spend")}
                            value={own ? money(own.spend, own.currency) : "—"}
                          />
                          <Figure
                            label={t("numbers.signUps")}
                            value={own ? whole.format(own.signUps) : "—"}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 lg:w-[330px] lg:justify-end">
                          <RankBadge insights={own} />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreview(creative)}
                              aria-label={t("preview", { name: creative.name })}
                              title={t("previewHint")}
                              className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#e1e7f0] px-3 text-[12.5px] font-semibold text-[#3b4a66] transition-colors hover:bg-[#f4f6fa]"
                            >
                              <Eye className="size-3.5" />
                              {t("previewButton")}
                            </button>
                            <Can permission="campaigns:create">
                              <div className="flex items-center gap-2">
                                {confirming === creative.id ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={removing === creative.id}
                                      onClick={() => void remove(creative.id)}
                                      className="h-10 rounded-[10px] bg-[#d92d20] px-3 text-[12.5px] font-bold text-white disabled:opacity-60"
                                    >
                                      {removing === creative.id
                                        ? t("removing")
                                        : t("confirmRemove")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirming(null)}
                                      className="h-10 rounded-[10px] border border-[#e1e7f0] px-3 text-[12.5px] font-semibold text-[#3b4a66]"
                                    >
                                      {t("cancel")}
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <Link
                                      href={`${ROUTES.campaignsCreate}?creative=${creative.id}`}
                                      className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[#eef4ff] px-3 text-[12.5px] font-bold text-[#1d4fd8] transition-colors hover:bg-[#e0eaff]"
                                    >
                                      <Megaphone className="size-3.5" />
                                      {t("useInCampaign")}
                                    </Link>
                                    <button
                                      type="button"
                                      aria-label={t("remove")}
                                      title={t("remove")}
                                      onClick={() => setConfirming(creative.id)}
                                      className="flex size-10 items-center justify-center rounded-[10px] border border-[#e1e7f0] text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </Can>
                          </div>
                        </div>
                      </div>

                      {used.length > 1 ? (
                        <div className="mt-3 overflow-x-auto border-t border-[#eef1f6] pt-2">
                          <table className="w-full min-w-[520px] text-[12px]">
                            <thead>
                              <tr className={cn("text-start", MUTED)}>
                                <th className="py-1 text-start font-semibold">
                                  {t("usage.campaign")}
                                </th>
                                <th className="py-1 text-start font-semibold">
                                  {t("numbers.impressions")}
                                </th>
                                <th className="py-1 text-start font-semibold">
                                  {t("numbers.clicks")}
                                </th>
                                <th className="py-1 text-start font-semibold">
                                  {t("numbers.spend")}
                                </th>
                                <th className="py-1 text-start font-semibold">
                                  {t("numbers.signUps")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {used.map((campaign) => (
                                <tr key={campaign.publicationId} className="text-[#3b4a66]">
                                  <td className="py-1 font-semibold">{campaign.name}</td>
                                  <td className="py-1">{whole.format(campaign.impressions)}</td>
                                  <td className="py-1">{whole.format(campaign.clicks)}</td>
                                  <td className="py-1">
                                    {money(campaign.spend, own?.currency ?? null)}
                                  </td>
                                  <td className="py-1">{whole.format(campaign.signUps)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <AppDialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        title={preview?.name}
        contentClassName="max-w-[26rem]"
      >
        {preview ? (
          <CreativeThumb
            creative={preview}
            controls
            className="mx-auto aspect-[9/16] max-h-[70dvh] rounded-[12px]"
          />
        ) : null}
      </AppDialog>
    </div>
  )
}
