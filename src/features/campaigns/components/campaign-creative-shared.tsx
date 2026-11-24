"use client"

// The pieces the creative library and the campaign wizard share: checking a file before it is
// sent, uploading files one after another, and drawing a creative's thumbnail.

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { CheckCircle2, Play, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/app-errors"
import { cn } from "@/lib/utils"

import {
  campaignPublishingService,
  type Creative,
  CREATIVE_LIMITS,
  snapchatCreativeProblem,
} from "../services/campaign-publishing.service"

export const CREATIVE_ACCEPT = "image/png,image/jpeg,video/mp4"
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "video/mp4"])

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Why a file cannot be uploaded, before it is sent: its type or its size.
function fileProblem(file: File): "type" | "imageSize" | "videoSize" | null {
  if (!ACCEPTED_TYPES.has(file.type)) return "type"
  if (file.type === "video/mp4") {
    return file.size > CREATIVE_LIMITS.videoBytes ? "videoSize" : null
  }
  return file.size > CREATIVE_LIMITS.imageBytes ? "imageSize" : null
}

// Uploads the chosen files one after another (a video is large, so never several at once),
// telling the merchant in plain words why a file was left out.
export function useCreativeUploader(onUploaded: (creative: Creative) => void) {
  const t = useTranslations("campaigns.creativeLibrary")
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : []
      if (list.length === 0) return
      const accepted: File[] = []
      for (const file of list) {
        const problem = fileProblem(file)
        if (problem) toast.error(t(`uploadErrors.${problem}`, { name: file.name }))
        else accepted.push(file)
      }
      for (const [index, file] of accepted.entries()) {
        setProgress({ current: index + 1, total: accepted.length })
        try {
          onUploaded(await campaignPublishingService.uploadCreative(file))
        } catch (error) {
          const code = error instanceof AppError ? error.code : ""
          const key =
            code === "CREATIVE_INVALID_FILE"
              ? "type"
              : code === "CREATIVE_TOO_LARGE"
                ? file.type === "video/mp4"
                  ? "videoSize"
                  : "imageSize"
                : code === "CREATIVE_STORAGE_UNAVAILABLE"
                  ? "unavailable"
                  : "failed"
          toast.error(t(`uploadErrors.${key}`, { name: file.name }))
        }
      }
      setProgress(null)
    },
    [onUploaded, t]
  )

  return { upload, progress }
}

// Brings the creatives of the ads already on Snapchat into the library, a few ads per request,
// until none is left (backend: campaigns/creative-import.ts). `onStep` is told each time some
// arrived, so the screen can show them. Answers with how many ads still wait, or null when there
// is nothing (left) to bring in.
export function useCreativeImport(onStep: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)
  const step = useRef(onStep)
  useEffect(() => {
    step.current = onStep
  }, [onStep])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      let waited = false
      // Bounded, so a screen left open never asks for ever.
      for (let round = 0; round < 80 && !cancelled; round += 1) {
        let progress
        try {
          progress = await campaignPublishingService.importCreatives()
        } catch {
          break
        }
        if (cancelled) return
        if (progress.done > 0) step.current()
        // Nothing left, or nothing could be brought in this time: stop and leave it for later.
        if (progress.remaining === 0 || (progress.done === 0 && !progress.busy)) {
          // What another screen brought in meanwhile is shown too.
          if (waited) step.current()
          break
        }
        setRemaining(progress.remaining)
        // Another screen is already at it: look again in a moment.
        if (progress.busy) {
          waited = true
          await new Promise((resolve) => setTimeout(resolve, 4000))
        }
      }
      if (!cancelled) setRemaining(null)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return remaining
}

// The creative itself, cropped to fill its box. A video shows its first frame with a play mark.
export function CreativeThumb({
  creative,
  className,
  controls = false,
  compact = false,
}: {
  creative: Pick<Creative, "kind" | "url" | "name">
  className?: string
  controls?: boolean
  // A very small box (a table row): the play mark shrinks with it.
  compact?: boolean
}) {
  return (
    <div className={cn("relative overflow-hidden bg-[#0b1738]", className)}>
      {creative.kind === "video" ? (
        <>
          <video
            src={`${creative.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            controls={controls}
            className="size-full object-cover"
          />
          {controls ? null : (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className={cn(
                  "flex items-center justify-center rounded-full bg-black/55 text-white",
                  compact ? "size-5" : "size-10"
                )}
              >
                <Play className={cn("fill-current", compact ? "size-2.5" : "size-4")} />
              </span>
            </span>
          )}
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a merchant's uploaded file on the storage host, shown as-is
        <img
          src={creative.url}
          alt={creative.name}
          loading="lazy"
          className="size-full object-cover"
        />
      )}
    </div>
  )
}

// Whether the creative fits Snapchat's full-screen ads, said in a few words.
export function SnapchatFitBadge({ creative }: { creative: Creative }) {
  const t = useTranslations("campaigns.creativeLibrary.fit")
  const problem = snapchatCreativeProblem(creative)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        problem ? "bg-[#fff4e5] text-[#b54708]" : "bg-[#e7f8ee] text-[#137a41]"
      )}
    >
      {problem ? <TriangleAlert className="size-3" /> : <CheckCircle2 className="size-3" />}
      {problem ? t(problem) : t("ok")}
    </span>
  )
}
