"use client"

import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { ExpenseForm } from "./expense-form"

import { type Locale, localeDirection } from "@/i18n/locales"

export function ExpenseFormPage() {
  const t = useTranslations("expenses")
  const locale = useLocale()
  const router = useRouter()

  return (
    <div dir={localeDirection(locale as Locale)} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push(ROUTES.expenses)}
        className="flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {t("backToExpenses")}
      </button>

      <h1 className="text-2xl font-bold text-foreground">{t("addExpense")}</h1>

      <ExpenseForm />
    </div>
  )
}
