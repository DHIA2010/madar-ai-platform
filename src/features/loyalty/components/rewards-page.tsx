"use client"

// What points can be traded for: a number of points, and what the customer gets for them --
// riyals off, a percent off, or one of the business's products or services for nothing.

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppCheckbox, AppDialog, AppInput, AppSwitch } from "@/components/app"

import { useLoad, useLoyaltyAccess, useLoyaltyError, useLoyaltyFormat } from "../hooks/use-loyalty"
import { loyaltyService } from "../services/loyalty.service"
import type { LoyaltyReward, LoyaltyRewardInput, RewardItem } from "../types/loyalty.types"
import { Choice, Empty, LoadFailed, Loading, LoyaltyPage } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  ICON_BUTTON,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TH,
} from "./styles"

const BLANK: LoyaltyRewardInput = {
  name: "",
  pointsCost: 100,
  kind: "amount",
  value: 10,
  items: [],
  isActive: true,
}

export function LoyaltyRewardsPage() {
  const t = useTranslations("loyalty.rewards")
  const format = useLoyaltyFormat()
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const data = useLoad(
    () =>
      Promise.all([
        loyaltyService.rewards(),
        loyaltyService.catalog(),
        loyaltyService.program(),
      ]).then(([rewards, catalog, program]) => ({ rewards, catalog, program })),
    []
  )
  const [editing, setEditing] = useState<{ id: string | null; draft: LoyaltyRewardInput } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [needle, setNeedle] = useState("")
  const draft = editing?.draft
  const set = <K extends keyof LoyaltyRewardInput>(key: K, value: LoyaltyRewardInput[K]) =>
    setEditing((current) =>
      current ? { ...current, draft: { ...current.draft, [key]: value } } : current
    )
  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await work()
      toast.success(done)
      setEditing(null)
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const gives = (reward: LoyaltyReward | LoyaltyRewardInput) =>
    reward.kind === "amount"
      ? t("givesAmount", { amount: format.money(reward.value) })
      : reward.kind === "percent"
        ? t("givesPercent", { percent: format.number(reward.value) })
        : t("givesFree")
  const covered = (items: RewardItem[]) =>
    items.length === 0 ? t("everything") : items.map((item) => item.name).join("، ")

  const shown = useMemo(() => {
    const text = needle.trim().toLowerCase()
    const all = data.data?.catalog ?? []
    return text ? all.filter((item) => item.name.toLowerCase().includes(text)) : all
  }, [data.data, needle])
  const picked = (item: RewardItem) =>
    draft?.items.some((entry) => entry.id === item.id && entry.kind === item.kind) ?? false
  const toggle = (item: RewardItem) =>
    set(
      "items",
      picked(item)
        ? (draft?.items ?? []).filter(
            (entry) => !(entry.id === item.id && entry.kind === item.kind)
          )
        : [...(draft?.items ?? []), item]
    )
  const valid =
    !!draft &&
    draft.name.trim().length > 0 &&
    draft.pointsCost >= 1 &&
    (draft.kind === "free"
      ? draft.items.length > 0
      : draft.value > 0 && (draft.kind !== "percent" || draft.value <= 100))

  return (
    <LoyaltyPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => {
              setNeedle("")
              setEditing({ id: null, draft: BLANK })
            }}
          >
            <Plus className="size-4" />
            {t("add")}
          </button>
        ) : null
      }
    >
      <div className={cn(PANEL, "overflow-hidden")}>
        {data.failed ? (
          <LoadFailed onRetry={data.reload} />
        ) : data.data === null ? (
          <Loading />
        ) : data.data.rewards.length === 0 ? (
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("name")}</th>
                  <th className={TH}>{t("cost")}</th>
                  <th className={TH}>{t("gives")}</th>
                  <th className={TH}>{t("covers")}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {data.data.rewards.map((reward) => (
                  <tr key={reward.id} className="border-b border-[#eef1f6]">
                    <td className={cn(TD, "font-bold")}>
                      {reward.name}
                      {reward.isActive ? null : (
                        <span className="ms-2 rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-bold text-[#667085]">
                          {t("stopped")}
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, "tabular-nums")}>{format.points(reward.pointsCost)}</td>
                    <td className={TD}>{gives(reward)}</td>
                    <td className={cn(TD, "max-w-[280px] truncate", MUTED)}>
                      {covered(reward.items)}
                    </td>
                    <td className={TD}>
                      {canManage ? (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={t("edit")}
                            title={t("edit")}
                            onClick={() => {
                              const { id, ...rest } = reward
                              setNeedle("")
                              setEditing({ id, draft: rest })
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(ICON_BUTTON, "text-[#b42318]")}
                            aria-label={t("remove")}
                            title={t("remove")}
                            onClick={() =>
                              void act(() => loyaltyService.removeReward(reward.id), t("removed"))
                            }
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setEditing(null)
        }}
        title={editing?.id ? t("editTitle") : t("addTitle")}
        description={t("formHint")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !valid}
              onClick={() => {
                if (!editing) return
                const input = { ...editing.draft, name: editing.draft.name.trim() }
                void act(
                  () =>
                    editing.id
                      ? loyaltyService.updateReward(editing.id, input)
                      : loyaltyService.createReward(input),
                  t("saved")
                )
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="grid grid-cols-1 gap-4 overflow-y-auto pe-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="reward-name">
                {t("name")}
              </label>
              <AppInput
                id="reward-name"
                className={FIELD}
                maxLength={120}
                placeholder={t("namePlaceholder")}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="reward-cost">
                {t("cost")}
              </label>
              <AppInput
                id="reward-cost"
                type="number"
                inputMode="numeric"
                min={1}
                className={FIELD}
                value={draft.pointsCost}
                onChange={(event) =>
                  set("pointsCost", Math.max(1, Math.round(Number(event.target.value) || 1)))
                }
              />
              {data.data ? (
                <p className={cn("mt-1 text-[12px]", MUTED)}>
                  {t("costHint", {
                    amount: format.money(
                      Math.ceil(draft.pointsCost / Math.max(0.01, data.data.program.pointsPerSar))
                    ),
                  })}
                </p>
              ) : null}
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("gives")}</span>
              <Choice
                value={draft.kind}
                onChange={(next) => set("kind", next as LoyaltyRewardInput["kind"])}
                ariaLabel={t("gives")}
                options={[
                  { value: "amount", label: t("kinds.amount") },
                  { value: "percent", label: t("kinds.percent") },
                  { value: "free", label: t("kinds.free") },
                ]}
              />
            </div>
            {draft.kind === "free" ? null : (
              <div>
                <label className={FIELD_LABEL} htmlFor="reward-value">
                  {draft.kind === "amount" ? t("amount") : t("percent")}
                </label>
                <AppInput
                  id="reward-value"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={draft.kind === "percent" ? 100 : undefined}
                  className={FIELD}
                  value={draft.value}
                  onChange={(event) => set("value", Math.max(0, Number(event.target.value) || 0))}
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <span className={FIELD_LABEL}>
                {draft.kind === "free" ? t("freeItems") : t("onItems")}
              </span>
              <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>
                {draft.kind === "free" ? t("freeItemsHint") : t("onItemsHint")}
              </p>
              {(data.data?.catalog.length ?? 0) === 0 ? (
                <p className="rounded-[12px] bg-[#f7f9fc] px-3 py-3 text-[12.5px] text-[#52607a]">
                  {t("noCatalog")}
                </p>
              ) : (
                <div className="rounded-[12px] border border-[#e1e7f0]">
                  <div className="flex items-center gap-2 border-b border-[#eef1f6] px-3">
                    <Search className="size-4 text-[#8a97ad]" />
                    <input
                      className="h-10 w-full bg-transparent text-[13px] outline-none"
                      placeholder={t("searchItems")}
                      aria-label={t("searchItems")}
                      value={needle}
                      onChange={(event) => setNeedle(event.target.value)}
                    />
                    <span className={cn("shrink-0 text-[12px]", MUTED)}>
                      {t("chosen", { count: draft.items.length })}
                    </span>
                  </div>
                  <ul className="max-h-[200px] overflow-y-auto overscroll-contain py-1">
                    {shown.map((item) => (
                      <li key={`${item.kind}:${item.id}`}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-[#f7f9fc]">
                          <AppCheckbox
                            checked={picked(item)}
                            aria-label={item.name}
                            onCheckedChange={() => toggle(item)}
                          />
                          <span className="min-w-0 flex-1 truncate text-[#0b1738]">
                            {item.name}
                          </span>
                          <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-bold text-[#667085]">
                            {t(`itemKinds.${item.kind}`)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <label className="flex items-center gap-3 sm:col-span-2">
              <AppSwitch
                checked={draft.isActive}
                aria-label={t("offered")}
                onCheckedChange={(on) => set("isActive", on)}
              />
              <span className="text-[13.5px] font-semibold text-[#0b1738]">{t("offered")}</span>
            </label>
          </div>
        ) : null}
      </AppDialog>
    </LoyaltyPage>
  )
}
