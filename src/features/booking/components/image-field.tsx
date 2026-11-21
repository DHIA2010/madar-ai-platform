"use client"

// A picture the staff choose for the public page or a service: shown once chosen, replaced by
// choosing another, taken off with one press.

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ImagePlus, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { uploadBookingImage } from "../services/image-upload"

export function ImageField({
  value,
  onChange,
  label,
  shape = "wide",
  className,
}: {
  value: string | null
  onChange: (next: string | null) => void
  label: string
  // wide: a cover or a service picture. square: a logo or a gallery picture.
  shape?: "wide" | "square"
  className?: string
}) {
  const t = useTranslations("booking.image")
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const choose = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadBookingImage(file))
    } catch {
      toast.error(t("failed"))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-[14px] border border-dashed border-[#cfd8e6] bg-[#f7f9fc]",
          shape === "wide" ? "aspect-[16/7] w-full" : "aspect-square w-[120px]"
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- the business's own picture, shown as-is
          <img src={value} alt="" className="size-full object-cover" />
        ) : null}
        <button
          type="button"
          aria-label={label}
          disabled={busy}
          onClick={() => input.current?.click()}
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold transition",
            value
              ? "bg-black/0 text-transparent hover:bg-black/45 hover:text-white"
              : "text-[#52607a] hover:bg-[#eef2f8]"
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {value ? t("replace") : t("choose")}
        </button>
        {value && !busy ? (
          <button
            type="button"
            aria-label={t("remove")}
            title={t("remove")}
            onClick={() => onChange(null)}
            className="absolute end-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/95 text-[#b42318] shadow"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
