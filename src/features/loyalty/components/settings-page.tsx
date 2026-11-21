"use client"

// The programme's rules: what a riyal earns, what a point is worth, and the extra ways to earn
// the business switches on.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import { useLoad, useLoyaltyAccess, useLoyaltyError, useLoyaltyFormat } from "../hooks/use-loyalty"
import { loyaltyService } from "../services/loyalty.service"
import type { LoyaltyProgram } from "../types/loyalty.types"
import { LoadFailed, Loading, LoyaltyPage, ToggleRow } from "./shell"
import { FIELD, FIELD_LABEL, HEADING, MUTED, PANEL, PRIMARY_BUTTON, TEXTAREA } from "./styles"

export function LoyaltySettingsPage() {
  const t = useTranslations("loyalty.settings")
  const format = useLoyaltyFormat()
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const loaded = useLoad(() => loyaltyService.program(), [])
  const [draft, setDraft] = useState<LoyaltyProgram | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (loaded.data) setDraft(loaded.data)
  }, [loaded.data])
  const set = <K extends keyof LoyaltyProgram>(key: K, value: LoyaltyProgram[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const save = async () => {
    if (!draft) return
    if (draft.reviewBonusEnabled && !draft.googleReviewUrl?.trim()) {
      toast.error(t("reviewUrlNeeded"))
      return
    }
    setSaving(true)
    try {
      const saved = await loyaltyService.updateProgram({
        isActive: draft.isActive,
        pointsPerSar: draft.pointsPerSar,
        pointValue: draft.pointValue,
        reviewBonusEnabled: draft.reviewBonusEnabled,
        reviewBonusPoints: draft.reviewBonusPoints,
        googleReviewUrl: draft.googleReviewUrl?.trim() || null,
        onlineBonusEnabled: draft.onlineBonusEnabled,
        onlineBonusPoints: draft.onlineBonusPoints,
        terms: draft.terms?.trim() || null,
      })
      setDraft(saved)
      toast.success(t("saved"))
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  const whole = (value: string, least = 0) => Math.max(least, Math.round(Number(value) || 0))

  return (
    <LoyaltyPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage && draft ? (
          <button type="button" className={PRIMARY_BUTTON} disabled={saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("save")}
          </button>
        ) : null
      }
    >
      {loaded.failed ? (
        <LoadFailed onRetry={loaded.reload} />
      ) : draft === null ? (
        <Loading />
      ) : (
        <fieldset disabled={!canManage} className="flex max-w-3xl flex-col gap-4">
          <section className={cn(PANEL, "p-5")}>
            <ToggleRow
              checked={draft.isActive}
              onChange={(next) => set("isActive", next)}
              title={t("active")}
              hint={t("activeHint")}
            />
          </section>

          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("pointsTitle")}</h2>
            <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("pointsHint")}</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL} htmlFor="loyalty-earn">
                  {t("perSar")}
                </label>
                <AppInput
                  id="loyalty-earn"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.5}
                  className={FIELD}
                  value={draft.pointsPerSar}
                  onChange={(event) =>
                    set("pointsPerSar", Math.max(0.01, Number(event.target.value) || 1))
                  }
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="loyalty-value">
                  {t("pointValue")}
                </label>
                <AppInput
                  id="loyalty-value"
                  type="number"
                  inputMode="decimal"
                  min={0.0001}
                  step={0.01}
                  className={FIELD}
                  value={draft.pointValue}
                  onChange={(event) =>
                    set("pointValue", Math.max(0.0001, Number(event.target.value) || 0.05))
                  }
                />
              </div>
            </div>
            <p className="mt-3 rounded-[12px] bg-[#fdf2f8] px-3 py-2.5 text-[13px] leading-6 text-[#9d174d]">
              {t("example", {
                points: format.number(Math.floor(100 * draft.pointsPerSar)),
                worth: format.money(
                  Math.round(Math.floor(100 * draft.pointsPerSar) * draft.pointValue * 100) / 100
                ),
              })}
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("bonusTitle")}</h2>
            <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("bonusHint")}</p>

            <div className="mt-4 rounded-[14px] border border-[#eef1f6] p-4">
              <ToggleRow
                checked={draft.reviewBonusEnabled}
                onChange={(next) => set("reviewBonusEnabled", next)}
                title={t("review")}
                hint={t("reviewHint")}
              />
              {draft.reviewBonusEnabled ? (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={FIELD_LABEL} htmlFor="loyalty-review-points">
                      {t("bonusPoints")}
                    </label>
                    <AppInput
                      id="loyalty-review-points"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={FIELD}
                      value={draft.reviewBonusPoints}
                      onChange={(event) => set("reviewBonusPoints", whole(event.target.value))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={FIELD_LABEL} htmlFor="loyalty-review-url">
                      {t("reviewUrl")}
                    </label>
                    <AppInput
                      id="loyalty-review-url"
                      dir="ltr"
                      className={FIELD}
                      placeholder="https://g.page/r/.../review"
                      value={draft.googleReviewUrl ?? ""}
                      onChange={(event) => set("googleReviewUrl", event.target.value)}
                    />
                  </div>
                  <p className={cn("text-[12.5px] leading-5 sm:col-span-3", MUTED)}>
                    {t("reviewNote")}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-3 rounded-[14px] border border-[#eef1f6] p-4">
              <ToggleRow
                checked={draft.onlineBonusEnabled}
                onChange={(next) => set("onlineBonusEnabled", next)}
                title={t("online")}
                hint={t("onlineHint")}
              />
              {draft.onlineBonusEnabled ? (
                <div className="mt-4 max-w-[220px]">
                  <label className={FIELD_LABEL} htmlFor="loyalty-online-points">
                    {t("bonusPoints")}
                  </label>
                  <AppInput
                    id="loyalty-online-points"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className={FIELD}
                    value={draft.onlineBonusPoints}
                    onChange={(event) => set("onlineBonusPoints", whole(event.target.value))}
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("termsTitle")}</h2>
            <p className={cn("mt-0.5 text-[13px] leading-6", MUTED)}>{t("termsHint")}</p>
            <textarea
              className={cn(TEXTAREA, "mt-3 min-h-[110px]")}
              maxLength={1000}
              aria-label={t("termsTitle")}
              value={draft.terms ?? ""}
              onChange={(event) => set("terms", event.target.value)}
            />
          </section>

          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("text-[16px] font-extrabold", HEADING)}>{t("whereTitle")}</h2>
            <ul className={cn("mt-2 list-disc space-y-1 ps-5 text-[13px] leading-6", MUTED)}>
              <li>{t("whereBooking")}</li>
              <li>{t("whereCashier")}</li>
            </ul>
          </section>
        </fieldset>
      )}
    </LoyaltyPage>
  )
}
