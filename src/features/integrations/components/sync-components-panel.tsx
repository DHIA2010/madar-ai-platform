"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppButton, AppSwitch } from "@/components/app"

import { type SyncComponentSettings, syncComponentsService } from "../services"

const COMPONENTS: Array<keyof SyncComponentSettings> = ["products", "orders", "customers"]

// Lets the merchant choose, after connecting a store, which of its data keeps syncing. Turning
// one off stops its syncs and webhook updates; what was already synced stays in Madar.
export function SyncComponentsPanel({
  providerId,
  connectionId,
  className,
}: {
  providerId: string
  connectionId: string
  className?: string
}) {
  const t = useTranslations("integrations.syncComponents")
  const [saved, setSaved] = useState<SyncComponentSettings | null>(null)
  const [draft, setDraft] = useState<SyncComponentSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    syncComponentsService
      .get(providerId, connectionId)
      .then((settings) => {
        if (cancelled) return
        setSaved(settings)
        setDraft(settings)
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"))
      })
    return () => {
      cancelled = true
    }
  }, [providerId, connectionId, t])

  const changed =
    saved !== null &&
    draft !== null &&
    COMPONENTS.some((component) => saved[component] !== draft[component])
  const noneOn = draft !== null && COMPONENTS.every((component) => !draft[component])

  async function onSave() {
    if (!draft || noneOn) return
    setIsSaving(true)
    try {
      const result = await syncComponentsService.save(providerId, connectionId, draft)
      setSaved(result)
      setDraft(result)
      toast.success(t("saved"))
    } catch {
      toast.error(t("saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={cn("rounded-[14px] border border-[#e1e7f0] bg-white px-5 py-4", className)}>
      <h2 className="text-[15px] font-bold text-[#0b1738]">{t("title")}</h2>
      <p className="mt-0.5 text-[12px] text-[#6b7b96]">{t("description")}</p>

      <div className="mt-3 divide-y divide-[#eef1f6]">
        {COMPONENTS.map((component) => (
          <label
            key={component}
            className="flex cursor-pointer items-center justify-between gap-3 py-2.5"
          >
            <span>
              <span className="block text-[13px] font-semibold text-[#0b1738]">
                {t(`components.${component}.label`)}
              </span>
              <span className="block text-[11.5px] text-[#6b7b96]">
                {t(`components.${component}.hint`)}
              </span>
            </span>
            <AppSwitch
              checked={draft?.[component] ?? true}
              disabled={draft === null || isSaving}
              onCheckedChange={(checked) =>
                setDraft((current) => (current ? { ...current, [component]: checked } : current))
              }
            />
          </label>
        ))}
      </div>

      {noneOn ? <p className="mt-2 text-[11.5px] text-[#dc2626]">{t("atLeastOne")}</p> : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#6b7b96]">{t("keepsExisting")}</p>
        <AppButton
          size="sm"
          className="h-9 shrink-0 rounded-[9px] px-4 font-semibold"
          loading={isSaving}
          disabled={!changed || noneOn}
          onClick={onSave}
        >
          {t("save")}
        </AppButton>
      </div>
    </div>
  )
}
