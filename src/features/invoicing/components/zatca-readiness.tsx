"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ArrowUpLeft, ShieldAlert, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { salesInvoiceService } from "../services/invoicing.service"
import type { TaxType, ZatcaReadiness } from "../types/invoicing.types"
import { HEADING } from "./styles"

export function useZatcaReadiness(enabled = true) {
  const [readiness, setReadiness] = useState<ZatcaReadiness | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    salesInvoiceService
      .readiness()
      .then((result) => !cancelled && setReadiness(result))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled])
  return readiness
}

type Problem = "noDevice" | "noStandard" | "noSimplified" | "seller"

function problemOf(readiness: ZatcaReadiness, taxType: TaxType | null): Problem | null {
  if (!readiness.hasDevice) return "noDevice"
  if (taxType !== "simplified" && !readiness.supportsStandard) return "noStandard"
  if (taxType === "simplified" && !readiness.supportsSimplified) return "noSimplified"
  if (readiness.sellerMissing.length) return "seller"
  return null
}

// What still stands between this organization and ZATCA-cleared invoices, with where to fix it.
export function ZatcaReadinessBanner({
  readiness,
  taxType = null,
  showReady = false,
  className,
}: {
  readiness: ZatcaReadiness | null
  taxType?: TaxType | null
  showReady?: boolean
  className?: string
}) {
  const t = useTranslations("invoicing.readiness")
  const tFields = useTranslations("invoicing.sellerFields")
  const locale = useLocale()
  if (!readiness) return null
  const problem = problemOf(readiness, taxType)

  if (!problem) {
    if (!showReady) return null
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-[16px] border border-[#cdeedb] bg-[#f3fbf6] px-4 py-3",
          className
        )}
      >
        <ShieldCheck className="size-5 shrink-0 text-[#15803d]" />
        <p className="text-[12.5px] font-semibold text-[#166534]">
          {readiness.environment === "production" ? t("ready") : t("readyTest")}
        </p>
      </div>
    )
  }

  const soft = problem === "noDevice"
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-[16px] border px-4 py-3",
        soft ? "border-[#d9e2ff] bg-[#f5f7ff]" : "border-[#fde3b0] bg-[#fffaf0]",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <ShieldAlert
          className={cn("mt-0.5 size-5 shrink-0", soft ? "text-[#4f46e5]" : "text-[#b45309]")}
        />
        <div className="min-w-0">
          <p className={cn("text-[13px] font-extrabold", HEADING)}>{t(`${problem}.title`)}</p>
          <p className="mt-0.5 text-[12px] leading-5 text-[#5b6b85]">
            {problem === "seller"
              ? t("seller.description", {
                  fields: readiness.sellerMissing
                    .map((field) => (tFields.has(field) ? tFields(field) : field))
                    .join(locale === "ar" ? "، " : ", "),
                })
              : t(`${problem}.description`)}
          </p>
        </div>
      </div>
      <Link
        href={problem === "seller" ? ROUTES.settingsGeneral : ROUTES.settingsZatca}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[12.5px] font-bold text-[#4f46e5] ring-1 ring-[#d9dcfb] hover:bg-[#f5f6ff]"
      >
        {t(`${problem}.cta`)}
        <ArrowUpLeft className="size-3.5 ltr:-scale-x-100" />
      </Link>
    </div>
  )
}
