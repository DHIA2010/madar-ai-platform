"use client"

// Keeping the card on the customer's own phone without an app: the card page saved to the home
// screen (it opens with one tap and always shows the current points), or the card saved as a
// picture with its code, for the staff to scan.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Download, ImageDown, Loader2, MoreVertical, PlusSquare, Share, X } from "lucide-react"
import QRCode from "qrcode"

import { publicLoyaltyService } from "../services/loyalty.service"
import type { PublicLoyaltyCard } from "../types/loyalty.types"

type Device = "ios" | "android" | "other"

function deviceOf(): Device {
  if (typeof navigator === "undefined") return "other"
  const agent = navigator.userAgent
  // An iPad says it is a Mac, but a Mac has no touch screen.
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return "ios"
  }
  return /Android/.test(agent) ? "android" : "other"
}

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source
  })

// The card drawn as a picture: the business's colours, the member's name and the card's code.
// The balance is left out on purpose -- a saved picture would go on showing an old one.
async function drawCard(card: PublicLoyaltyCard, labels: { title: string; hint: string }) {
  const width = 1080
  const height = 680
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const pen = canvas.getContext("2d")
  if (!pen) throw new Error("canvas")
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif"
  const type = (weight: number, size: number) => `${weight} ${size}px ${family}`

  pen.fillStyle = card.cardColor
  pen.beginPath()
  pen.roundRect(0, 0, width, height, 56)
  pen.fill()
  pen.save()
  pen.clip()
  pen.globalAlpha = 0.1
  pen.fillStyle = card.textColor
  pen.beginPath()
  pen.arc(120, 40, 300, 0, Math.PI * 2)
  pen.fill()
  pen.restore()

  pen.fillStyle = card.textColor
  pen.direction = "rtl"
  pen.textAlign = "right"
  pen.textBaseline = "alphabetic"
  const right = width - 64
  pen.font = type(800, 60)
  pen.fillText(card.businessName, right, 122, 560)
  pen.globalAlpha = 0.78
  pen.font = type(500, 32)
  pen.fillText(card.cardTitle ?? labels.title, right, 174, 560)
  pen.globalAlpha = 1
  pen.font = type(700, 48)
  pen.fillText(card.name, right, 420, 560)
  pen.globalAlpha = 0.8
  pen.font = type(500, 30)
  pen.fillText(labels.hint, right, 474, 560)
  if (card.cardNote) pen.fillText(card.cardNote, right, 600, 600)
  pen.globalAlpha = 1

  const code = await loadImage(
    await QRCode.toDataURL(card.cardCode, { margin: 1, width: 600, errorCorrectionLevel: "M" })
  )
  pen.fillStyle = "#ffffff"
  pen.beginPath()
  pen.roundRect(64, 250, 320, 320, 32)
  pen.fill()
  pen.drawImage(code, 84, 270, 280, 280)
  pen.fillStyle = card.textColor
  pen.direction = "ltr"
  pen.textAlign = "center"
  pen.font = `600 34px ui-monospace, monospace`
  pen.fillText(card.cardCode.split("").join(" "), 224, 624)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/png")
  )
}

export function SaveCard({ card, token }: { card: PublicLoyaltyCard; token: string }) {
  const t = useTranslations("loyalty.save")
  const face = useTranslations("loyalty.cardFace")
  const [open, setOpen] = useState(false)
  const [device, setDevice] = useState<Device>("other")
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)

  // What the phone shows once the page is on its home screen: the business's name and a
  // picture in the card's colours, instead of a snapshot of the page.
  useEffect(() => {
    setDevice(deviceOf())
    const previousTitle = document.title
    document.title = card.businessName
    const icon = document.createElement("link")
    icon.rel = "apple-touch-icon"
    icon.href = publicLoyaltyService.iconUrl(token)
    const name = document.createElement("meta")
    name.name = "apple-mobile-web-app-title"
    name.content = card.businessName
    document.head.append(icon, name)
    return () => {
      document.title = previousTitle
      icon.remove()
      name.remove()
    }
  }, [card.businessName, token])

  const savePicture = async () => {
    setWorking(true)
    setFailed(false)
    try {
      const blob = await drawCard(card, { title: face("title"), hint: t("pictureHint") })
      const file = new File([blob], "loyalty-card.png", { type: "image/png" })
      // On a phone this opens the share sheet, where "Save Image" puts it in the photos.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: card.businessName }).catch(() => undefined)
      } else {
        const link = document.createElement("a")
        link.href = URL.createObjectURL(blob)
        link.download = file.name
        link.click()
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
      }
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }

  const steps =
    device === "ios"
      ? [
          { icon: <Share className="size-4" />, text: t("iosShare") },
          { icon: <PlusSquare className="size-4" />, text: t("iosAdd") },
        ]
      : device === "android"
        ? [
            { icon: <MoreVertical className="size-4" />, text: t("androidMenu") },
            { icon: <PlusSquare className="size-4" />, text: t("androidAdd") },
          ]
        : [{ icon: <PlusSquare className="size-4" />, text: t("otherAdd") }]

  if (!open) {
    return (
      <button
        type="button"
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#0b1738] text-[15px] font-bold text-white"
        onClick={() => setOpen(true)}
      >
        <Download className="size-5" />
        {t("button")}
      </button>
    )
  }
  return (
    <section className="rounded-[18px] border border-[#e4e9f2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-extrabold text-[#0b1738]">{t("title")}</h2>
        <button
          type="button"
          aria-label={t("close")}
          className="flex size-8 items-center justify-center rounded-full text-[#6b7b96] hover:bg-[#f1f4f9]"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </button>
      </div>

      <p className="mt-3 text-[13.5px] font-bold text-[#0b1738]">{t("homeTitle")}</p>
      <p className="text-[12.5px] leading-5 text-[#6b7b96]">{t("homeHint")}</p>
      <ol className="mt-2 flex flex-col gap-2">
        {steps.map((step, index) => (
          <li
            key={index}
            className="flex items-center gap-3 rounded-[12px] bg-[#f7f9fc] px-3 py-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0b1738] text-[12px] font-black text-white">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] leading-6 font-semibold text-[#0b1738]">
              {step.text}
            </span>
            <span className="shrink-0 text-[#0b1738]">{step.icon}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[13.5px] font-bold text-[#0b1738]">{t("pictureTitle")}</p>
      <p className="text-[12.5px] leading-5 text-[#6b7b96]">{t("pictureNote")}</p>
      <button
        type="button"
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#e1e7f0] text-[14px] font-bold text-[#0b1738] disabled:opacity-60"
        disabled={working}
        onClick={() => void savePicture()}
      >
        {working ? <Loader2 className="size-4 animate-spin" /> : <ImageDown className="size-4" />}
        {t("pictureButton")}
      </button>
      {failed ? (
        <p className="mt-2 text-[12.5px] font-semibold text-[#b42318]">{t("pictureFailed")}</p>
      ) : null}
    </section>
  )
}
