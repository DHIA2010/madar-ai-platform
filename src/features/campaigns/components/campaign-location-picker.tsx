"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Check, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  campaignPublishingService,
  type PublishLocations,
} from "../services/campaign-publishing.service"

import type { Locale } from "@/i18n/locales"

// Where inside the country a Snapchat campaign is shown: all of it, some of its regions, or some
// of its cities (backend: campaigns/publishing/snapchat-geo.ts). The regions are Snapchat's own
// list for the country; the cities are the ones Madar offers, each a circle around the city.
// Regions and cities are one or the other, so choosing a way clears the other's picks. Give it a
// key made of the connection and the country, so another country starts from its own list.

export interface ChosenPlaces {
  regionIds: string[]
  cityKeys: string[]
}

type Way = "all" | "regions" | "cities"

const WAY =
  "inline-flex h-11 items-center justify-center rounded-xl border-2 px-4 text-[13px] font-bold transition-colors"
const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors"

export function CampaignLocationPicker({
  connectionId,
  countryCode,
  value,
  onChange,
}: {
  connectionId: string
  countryCode: string
  value: ChosenPlaces
  onChange: (value: ChosenPlaces) => void
}) {
  const t = useTranslations("campaigns.publish.places")
  const locale = useLocale() as Locale
  const [locations, setLocations] = useState<PublishLocations | "error" | null>(null)
  // The way being chosen, when it has no picks yet to say so itself.
  const [opened, setOpened] = useState<Way | null>(null)

  useEffect(() => {
    if (!connectionId || !countryCode) return
    let cancelled = false
    campaignPublishingService
      .locations(connectionId, countryCode)
      .then((loaded) => {
        if (!cancelled) setLocations(loaded)
      })
      .catch(() => {
        if (!cancelled) setLocations("error")
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, countryCode])

  const way: Way =
    value.regionIds.length > 0
      ? "regions"
      : value.cityKeys.length > 0
        ? "cities"
        : (opened ?? "all")
  const choose = (next: Way) => {
    setOpened(next === "all" ? null : next)
    onChange({ regionIds: [], cityKeys: [] })
  }
  const toggle = (list: string[], entry: string) =>
    list.includes(entry) ? list.filter((other) => other !== entry) : [...list, entry]

  if (locations === null) {
    return <Loader2 className="size-5 animate-spin text-[#98a2b3]" />
  }
  const regions = locations === "error" ? [] : locations.regions
  const cities = locations === "error" ? [] : locations.cities
  const ways: Way[] = [
    "all",
    ...(regions.length ? (["regions"] as const) : []),
    ...(cities.length ? (["cities"] as const) : []),
  ]
  // A country with nothing to narrow to has nothing to choose.
  if (ways.length === 1) return <p className="text-[12.5px] text-[#6b7b96]">{t("onlyCountry")}</p>

  const chips = (
    entries: Array<{ id: string; label: string }>,
    chosen: string[],
    pick: (id: string) => void
  ) => (
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => {
        const on = chosen.includes(entry.id)
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={on}
            onClick={() => pick(entry.id)}
            className={cn(
              CHIP,
              on
                ? "border-[#1d4fd8] bg-[#eef4ff] text-[#1d4fd8]"
                : "border-[#d5dce8] bg-white text-[#3b4a66] hover:border-[#1d4fd8]/50"
            )}
          >
            {on ? <Check className="size-3.5" /> : null}
            {entry.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ways.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={way === entry}
            onClick={() => choose(entry)}
            className={cn(
              WAY,
              way === entry
                ? "border-[#1d4fd8] bg-[#f3f7ff] text-[#1d4fd8]"
                : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#1d4fd8]/40"
            )}
          >
            {t(`ways.${entry}`)}
          </button>
        ))}
      </div>
      {way === "regions"
        ? chips(
            regions.map((region) => ({
              id: region.id,
              label: (locale === "ar" ? region.nameAr : null) ?? region.name,
            })),
            value.regionIds,
            (id) => onChange({ regionIds: toggle(value.regionIds, id), cityKeys: [] })
          )
        : null}
      {way === "cities"
        ? chips(
            cities.map((city) => ({
              id: city.key,
              label: locale === "ar" ? city.nameAr : city.name,
            })),
            value.cityKeys,
            (key) => onChange({ regionIds: [], cityKeys: toggle(value.cityKeys, key) })
          )
        : null}
      <p className="text-[12px] leading-5 text-[#6b7b96]">{t(`hints.${way}`)}</p>
    </div>
  )
}
