"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react"

import { AppButton, AppInput } from "@/components/app"

type UploadItem = {
  id: string
  name: string
  progress: number
  status: "uploading" | "completed"
}

const ALLOWED_TYPES = ["image/", "video/", "application/pdf", "text/html"]

export function CampaignCreativeUploadArea() {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [error, setError] = useState("")

  const hasUploads = uploads.length > 0

  function validateFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    const invalid = fileArray.find(
      (file) => !ALLOWED_TYPES.some((type) => file.type.startsWith(type))
    )

    if (invalid) {
      setError("One or more files are invalid. Supported: images, videos, PDFs, HTML5.")
      return
    }

    const existing = new Set(uploads.map((item) => item.name))
    const deduped = fileArray.filter((file) => !existing.has(file.name))

    if (deduped.length !== fileArray.length) {
      setError("Duplicate files were skipped.")
    } else {
      setError("")
    }

    const next = deduped.map((file) => ({
      id: `${file.name}-${file.lastModified}`,
      name: file.name,
      progress: 0,
      status: "uploading" as const,
    }))

    if (next.length === 0) {
      return
    }

    setUploads((current) => [...current, ...next])

    next.forEach((item) => {
      let value = 0
      const timer = window.setInterval(() => {
        value += 20
        setUploads((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  progress: Math.min(100, value),
                  status: value >= 100 ? "completed" : "uploading",
                }
              : entry
          )
        )

        if (value >= 100) {
          window.clearInterval(timer)
        }
      }, 200)
    })
  }

  const completedCount = useMemo(
    () => uploads.filter((item) => item.status === "completed").length,
    [uploads]
  )

  return (
    <div className="space-y-3">
      <label className="block cursor-pointer rounded-xl border border-dashed border-border/80 bg-muted/10 p-8 text-center transition-colors hover:bg-muted/20">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full border border-border/70 bg-background">
          <UploadCloud className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Drag & drop files here or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Multiple upload supported. Preview and validation enabled.
        </p>
        <AppInput
          type="file"
          multiple
          className="hidden"
          onChange={(event) => validateFiles(event.target.files)}
        />
      </label>

      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-3 py-2 text-xs">
        <span className="text-muted-foreground">Upload queue</span>
        <span className="font-medium">
          {completedCount}/{uploads.length} completed
        </span>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {hasUploads ? (
        <div className="space-y-2">
          {uploads.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/70 bg-card px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate">{item.name}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  {item.status === "completed" ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  {item.progress}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <AppButton variant="outline" size="sm" icon={<FileUp className="size-3.5" />}>
          Preview Before Save
        </AppButton>
        <AppButton size="sm">Save to Library</AppButton>
      </div>
    </div>
  )
}
