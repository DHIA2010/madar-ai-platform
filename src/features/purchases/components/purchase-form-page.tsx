"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, Loader2 } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { purchaseService } from "../services"
import type { Purchase } from "../types"
import { PurchaseForm } from "./purchase-form"

import { type Locale, localeDirection } from "@/i18n/locales"

export function PurchaseFormPage() {
  const t = useTranslations("purchases.form")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("id")

  const [existing, setExisting] = useState<Purchase | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(Boolean(editId))

  useEffect(() => {
    async function run() {
      if (!editId) {
        setExisting(undefined)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        setExisting(await purchaseService.get(editId))
      } finally {
        setIsLoading(false)
      }
    }
    void run()
  }, [editId])

  return (
    <div dir={localeDirection(locale as Locale)} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.purchases)}
        className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("backToPurchases")}
      </button>

      <h1 className="text-2xl font-bold text-foreground">
        {existing ? t("editHeading", { code: existing.code }) : t("addHeading")}
      </h1>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {tCommon("loading")}
        </div>
      ) : (
        <PurchaseForm initialPurchase={existing} />
      )}
    </div>
  )
}
