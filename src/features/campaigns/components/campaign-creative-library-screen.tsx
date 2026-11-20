"use client"

// مكتبة التصاميم: the images and videos the organization keeps for its ads (backend:
// campaigns/creatives.ts). A file is uploaded once here -- or straight from the campaign wizard
// -- and can then be used in any campaign published from Madar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ImagePlus, Loader2, Megaphone, Trash2, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { Can } from "@/features/authentication"

import { campaignPublishingService, type Creative } from "../services/campaign-publishing.service"
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

export function CampaignCreativeLibraryScreen() {
  const t = useTranslations("campaigns.creativeLibrary")
  const locale = useLocale() as Locale
  const fileInput = useRef<HTMLInputElement>(null)

  const [creatives, setCreatives] = useState<Creative[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filter, setFilter] = useState<KindFilter>("all")
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadFailed(false)
    campaignPublishingService
      .listCreatives()
      .then(setCreatives)
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { upload, progress } = useCreativeUploader(
    useCallback((creative: Creative) => {
      setCreatives((current) => [creative, ...(current ?? [])])
    }, [])
  )

  const visible = useMemo(
    () => (creatives ?? []).filter((creative) => filter === "all" || creative.kind === filter),
    [creatives, filter]
  )

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

  const dateFormat = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  )

  return (
    <div
      className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")}
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
              className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-[12px] bg-[#1d4fd8] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1a45bd] disabled:opacity-60"
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
              "flex w-full flex-col items-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging
                ? "border-[#1d4fd8] bg-[#eef4ff]"
                : "border-[#cfd8e6] bg-white hover:border-[#1d4fd8]/50"
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]">
              {progress ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <UploadCloud className="size-5" />
              )}
            </span>
            <span className={cn("text-[14.5px] font-bold", HEADING)}>
              {progress ? t("uploading", progress) : t("dropzone.title")}
            </span>
            <span className={cn("max-w-[560px] text-[12.5px] leading-6", MUTED)}>
              {t("dropzone.hint")}
            </span>
          </button>
        </Can>

        <div className={cn(PANEL, "p-4 md:p-5")}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className="aspect-[9/16] animate-pulse rounded-[12px] bg-[#eef1f6]"
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visible.map((creative) => (
                <article
                  key={creative.id}
                  className="flex flex-col overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white"
                >
                  <CreativeThumb creative={creative} controls className="aspect-[9/16]" />
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p
                      className={cn("truncate text-[13px] font-bold", HEADING)}
                      title={creative.name}
                    >
                      {creative.name}
                    </p>
                    <SnapchatFitBadge creative={creative} />
                    <p className={cn("text-[11.5px] leading-5", MUTED)} dir="ltr">
                      {creative.width && creative.height
                        ? `${creative.width}×${creative.height} · `
                        : ""}
                      {creative.durationSeconds
                        ? `${Math.round(creative.durationSeconds)}s · `
                        : ""}
                      {formatBytes(creative.sizeBytes)}
                    </p>
                    <p className={cn("text-[11px]", MUTED)}>
                      {dateFormat.format(new Date(creative.createdAt))}
                    </p>
                    <Can permission="campaigns:create">
                      <div className="mt-auto flex items-center gap-2 pt-1">
                        {confirming === creative.id ? (
                          <>
                            <button
                              type="button"
                              disabled={removing === creative.id}
                              onClick={() => void remove(creative.id)}
                              className="h-10 flex-1 rounded-[10px] bg-[#d92d20] text-[12.5px] font-bold text-white disabled:opacity-60"
                            >
                              {removing === creative.id ? t("removing") : t("confirmRemove")}
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
                              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#eef4ff] text-[12.5px] font-bold text-[#1d4fd8] transition-colors hover:bg-[#e0eaff]"
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
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
