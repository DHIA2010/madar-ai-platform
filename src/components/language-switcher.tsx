"use client"

import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"

import { setLocale } from "@/i18n/actions"
import { LOCALES, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALE_FLAGS: Record<Locale, string> = {
  en: "🇺🇸",
  ar: "🇸🇦",
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations("common")
  const [isPending, startTransition] = useTransition()

  function handleSelect(next: Locale) {
    if (next === locale) return
    startTransition(async () => {
      await setLocale(next)
      window.location.reload()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-10 rounded-full hover:bg-muted/60", className)}
          aria-label={t("language")}
          disabled={isPending}
        >
          <span className="text-base leading-none" aria-hidden="true">
            {LOCALE_FLAGS[locale]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => handleSelect(option)}
            className={cn("gap-2", option === locale ? "font-semibold" : undefined)}
          >
            <span aria-hidden="true">{LOCALE_FLAGS[option]}</span>
            {option === "ar" ? t("languageArabic") : t("languageEnglish")}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
