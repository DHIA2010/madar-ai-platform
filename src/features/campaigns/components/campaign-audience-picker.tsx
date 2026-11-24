"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Check, Loader2, Search } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  campaignPublishingService,
  type PublishAudiences,
} from "../services/campaign-publishing.service"

import type { Locale } from "@/i18n/locales"

// Who a Snapchat campaign is shown to beyond age and gender: the languages people use Snapchat
// in, and what they are interested in (backend: campaigns/publishing/snapchat-audience.ts). Both
// lists are Snapchat's own for the country. Nothing picked means everyone. The interests are
// many, so the wide ones are shown and the narrower ones are found by typing.

export interface ChosenAudience {
  languages: string[]
  interestIds: string[]
}

const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors"
const LABEL = "mb-2 block text-[13px] font-bold text-[#14213d]"
const HINT = "text-[12px] leading-5 text-[#6b7b96]"
// The languages worth offering first in this market.
const FIRST_LANGUAGES = ["ar", "en"]
const MOST_SHOWN = 40

export function CampaignAudiencePicker({
  connectionId,
  countryCode,
  value,
  onChange,
}: {
  connectionId: string
  countryCode: string
  value: ChosenAudience
  onChange: (value: ChosenAudience) => void
}) {
  const t = useTranslations("campaigns.publish.audiences")
  const locale = useLocale() as Locale
  const [audiences, setAudiences] = useState<PublishAudiences | "error" | null>(null)
  const [query, setQuery] = useState("")
  const [allLanguages, setAllLanguages] = useState(false)

  useEffect(() => {
    if (!connectionId || !countryCode) return
    let cancelled = false
    campaignPublishingService
      .audiences(connectionId, countryCode)
      .then((loaded) => {
        if (!cancelled) setAudiences(loaded)
      })
      .catch(() => {
        if (!cancelled) setAudiences("error")
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, countryCode])

  const languages = useMemo(() => {
    const list = audiences && audiences !== "error" ? audiences.languages : []
    const rank = (id: string) => {
      const at = FIRST_LANGUAGES.indexOf(id)
      return at === -1 ? FIRST_LANGUAGES.length : at
    }
    return [...list].sort((a, b) => rank(a.id) - rank(b.id))
  }, [audiences])
  const interests = useMemo(
    () => (audiences && audiences !== "error" ? audiences.interests : []),
    [audiences]
  )

  if (audiences === null) return <Loader2 className="size-5 animate-spin text-[#98a2b3]" />
  if (languages.length === 0 && interests.length === 0) {
    return <p className={HINT}>{t("unavailable")}</p>
  }

  const label = (entry: { name: string; nameAr: string | null }) =>
    (locale === "ar" ? entry.nameAr : null) ?? entry.name
  const toggle = (list: string[], entry: string) =>
    list.includes(entry) ? list.filter((other) => other !== entry) : [...list, entry]

  const chip = (id: string, text: string, on: boolean, pick: () => void) => (
    <button
      key={id}
      type="button"
      aria-pressed={on}
      onClick={pick}
      className={cn(
        CHIP,
        on
          ? "border-[#1d4fd8] bg-[#eef4ff] text-[#1d4fd8]"
          : "border-[#d5dce8] bg-white text-[#3b4a66] hover:border-[#1d4fd8]/50"
      )}
    >
      {on ? <Check className="size-3.5" /> : null}
      {text}
    </button>
  )

  const shownLanguages = allLanguages
    ? languages
    : languages.filter(
        (entry) => FIRST_LANGUAGES.includes(entry.id) || value.languages.includes(entry.id)
      )

  // With nothing typed: the wide interests, and whatever is already picked. With something
  // typed: every interest whose name (in either language) has it.
  const wanted = query.trim().toLowerCase()
  const matching = wanted
    ? interests.filter(
        (entry) =>
          entry.name.toLowerCase().includes(wanted) || (entry.nameAr ?? "").includes(wanted)
      )
    : interests.filter((entry) => !entry.parentId || value.interestIds.includes(entry.id))
  // Only what a search finds is cut short; the wide ones are all shown.
  const shownInterests = wanted ? matching.slice(0, MOST_SHOWN) : matching
  // Picked interests Snapchat's list no longer names stay visible, so they can be removed.
  const known = new Set(interests.map((entry) => entry.id))
  const unknown = wanted ? [] : value.interestIds.filter((id) => !known.has(id))

  return (
    <div className="space-y-5">
      {languages.length > 0 ? (
        <div>
          <span className={LABEL}>{t("languages.label")}</span>
          <div className="flex flex-wrap gap-2">
            {shownLanguages.map((entry) =>
              chip(entry.id, label(entry), value.languages.includes(entry.id), () =>
                onChange({ ...value, languages: toggle(value.languages, entry.id) })
              )
            )}
            {!allLanguages && shownLanguages.length < languages.length ? (
              <button
                type="button"
                onClick={() => setAllLanguages(true)}
                className={cn(CHIP, "border-dashed border-[#d5dce8] bg-white text-[#1d4fd8]")}
              >
                {t("languages.more")}
              </button>
            ) : null}
          </div>
          <p className={cn(HINT, "mt-2")}>
            {value.languages.length === 0 ? t("languages.hintAll") : t("languages.hintSome")}
          </p>
        </div>
      ) : null}

      {interests.length > 0 ? (
        <div>
          <span className={LABEL}>{t("interests.label")}</span>
          <div className="relative mb-3 max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("interests.search")}
              aria-label={t("interests.search")}
              className="h-11 w-full rounded-xl border border-[#d5dce8] bg-white ps-9 pe-3 text-[13px] text-[#14213d] outline-none placeholder:text-[#98a2b3] focus:border-[#1d4fd8]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {shownInterests.map((entry) =>
              chip(entry.id, label(entry), value.interestIds.includes(entry.id), () =>
                onChange({ ...value, interestIds: toggle(value.interestIds, entry.id) })
              )
            )}
            {unknown.map((id) =>
              chip(id, id, true, () =>
                onChange({ ...value, interestIds: toggle(value.interestIds, id) })
              )
            )}
          </div>
          {wanted && shownInterests.length === 0 ? (
            <p className={HINT}>{t("interests.none")}</p>
          ) : null}
          <p className={cn(HINT, "mt-2")}>
            {value.interestIds.length === 0
              ? t("interests.hintAll")
              : t("interests.hintSome", { count: value.interestIds.length })}
          </p>
        </div>
      ) : null}
    </div>
  )
}
