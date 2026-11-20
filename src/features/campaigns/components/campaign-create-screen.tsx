"use client"

// إنشاء حملة: the publish wizard, and under it the campaigns already published from Madar with
// their on/off switch and remove button (backend: campaigns/publishing/service.ts).

import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppSwitch } from "@/components/app"

import { Can } from "@/features/authentication"

import {
  campaignPublishingService,
  type Publication,
} from "../services/campaign-publishing.service"
import { CampaignModuleNav } from "./campaign-module-nav"
import { CampaignPublishWizard } from "./campaign-publish-wizard"

import { cairo } from "@/components/design/fonts"
import { PlatformBadge } from "@/components/platform-badge"
import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

const STATE_TINT: Record<string, string> = {
  active: "bg-[#e7f8ee] text-[#137a41]",
  paused: "bg-[#f1f4f9] text-[#475467]",
  publishing: "bg-[#eef4ff] text-[#1d4fd8]",
  failed: "bg-[#fef3f2] text-[#b42318]",
}

function PublishedCampaigns({
  publications,
  onChanged,
  onRemoved,
}: {
  publications: Publication[]
  onChanged: (next: Publication) => void
  onRemoved: (id: string) => void
}) {
  const t = useTranslations("campaigns.publish.published")
  const locale = useLocale() as Locale
  const [switching, setSwitching] = useState<string | null>(null)

  const toggle = async (publication: Publication, active: boolean) => {
    setSwitching(publication.id)
    try {
      onChanged(await campaignPublishingService.setActive(publication.id, active))
      toast.success(active ? t("switchedOn") : t("switchedOff"))
    } catch {
      toast.error(t("switchFailed"))
    } finally {
      setSwitching(null)
    }
  }

  // Removing deletes the campaign on Snapchat, so it is asked for twice: the bin, then a
  // confirmation in the row itself.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const remove = async (publication: Publication) => {
    setRemoving(publication.id)
    try {
      await campaignPublishingService.removePublication(publication.id)
      onRemoved(publication.id)
      toast.success(t("removed"))
    } catch {
      toast.error(t("removeFailed"))
    } finally {
      setRemoving(null)
      setConfirming(null)
    }
  }

  const money = (publication: Publication) => {
    const currency = publication.currency ?? "SAR"
    return `${publication.dailyBudget} ${currency === "SAR" && locale === "ar" ? "ر.س" : currency}`
  }

  return (
    <div className={cn(PANEL, "p-4 md:p-5")}>
      <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("title")}</h2>
      <p className={cn("mt-1 text-[12.5px]", MUTED)}>{t("subtitle")}</p>
      <ul className="mt-4 divide-y divide-[#eef1f6]">
        {publications.map((publication) => {
          const state =
            publication.status === "published" ? publication.platformStatus : publication.status
          return (
            <li key={publication.id} className="flex flex-wrap items-center gap-3 py-3">
              <PlatformBadge platform="Snapchat" className="size-9" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[14px] font-bold", HEADING)}>{publication.name}</p>
                <p className={cn("mt-0.5 text-[12px]", MUTED)}>
                  {t("perDay", { amount: money(publication) })}
                  {" · "}
                  {publication.headline}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                  STATE_TINT[state] ?? STATE_TINT.paused
                )}
              >
                {t(`states.${state}`)}
              </span>
              {publication.status === "published" ? (
                <Can permission="campaigns:create">
                  {switching === publication.id ? (
                    <Loader2 className="size-5 animate-spin text-[#98a2b3]" />
                  ) : (
                    <AppSwitch
                      checked={publication.platformStatus === "active"}
                      onCheckedChange={(active) => void toggle(publication, active)}
                      aria-label={t("switchLabel", { name: publication.name })}
                    />
                  )}
                </Can>
              ) : null}
              {publication.status === "published" ? (
                <Can permission="campaigns:create">
                  {confirming === publication.id ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                      <p className="min-w-0 flex-1 text-[12.5px] leading-6 text-[#b42318]">
                        {t("removeWarning")}
                      </p>
                      <button
                        type="button"
                        disabled={removing === publication.id}
                        onClick={() => void remove(publication)}
                        className="h-10 rounded-[10px] bg-[#d92d20] px-4 text-[12.5px] font-bold text-white disabled:opacity-60"
                      >
                        {removing === publication.id ? t("removing") : t("confirmRemove")}
                      </button>
                      <button
                        type="button"
                        disabled={removing === publication.id}
                        onClick={() => setConfirming(null)}
                        className="h-10 rounded-[10px] border border-[#e1e7f0] px-4 text-[12.5px] font-semibold text-[#3b4a66]"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("removeLabel", { name: publication.name })}
                      title={t("remove")}
                      onClick={() => setConfirming(publication.id)}
                      className="flex size-10 items-center justify-center rounded-[10px] border border-[#e1e7f0] text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </Can>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function CampaignCreateScreen() {
  const t = useTranslations("campaigns.publish")
  const locale = useLocale() as Locale
  const [publications, setPublications] = useState<Publication[]>([])

  const loadPublications = useCallback(() => {
    campaignPublishingService
      .listPublications()
      // A publish that failed left nothing on the platform, so it is not listed.
      .then((items) => setPublications(items.filter((item) => item.status !== "failed")))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadPublications()
  }, [loadPublications])

  return (
    <div
      className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")}
      dir={localeDirection(locale)}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div>
          <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("subtitle")}</p>
        </div>

        <CampaignModuleNav />

        <CampaignPublishWizard onPublished={loadPublications} />

        {publications.length > 0 ? (
          <PublishedCampaigns
            publications={publications}
            onChanged={(next) =>
              setPublications((current) =>
                current.map((publication) => (publication.id === next.id ? next : publication))
              )
            }
            onRemoved={(id) =>
              setPublications((current) => current.filter((publication) => publication.id !== id))
            }
          />
        ) : null}
      </div>
    </div>
  )
}
