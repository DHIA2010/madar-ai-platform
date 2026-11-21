"use client"

// Loyalty inside the cashier screen: the customer's points on the sale, finding a customer by
// their card (its QR under a scanner, its number, or their phone), and using a reward as a
// discount on the sale. The points for the reward are taken when the sale itself is saved.

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Gift, Loader2, ScanLine, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppDialog } from "@/components/app"

import { loyaltyService } from "../services/loyalty.service"
import type { CashierLoyalty, RewardItem, RewardKind } from "../types/loyalty.types"

// The reward put on the sale. Its discount is worked out by the cashier screen from the cart.
export interface CashierReward {
  customerId: string
  rewardId: string | null
  redemptionId: string | null
  name: string
  kind: RewardKind
  value: number
  // The products it covers. restricted with none listed means it covers services only, which
  // the cashier does not sell.
  restricted: boolean
  productIds: string[]
}

export interface CashierLoyaltyProps {
  customerId: string | null
  online: boolean
  // The reward on the sale now, and what it takes off the total (0 while nothing in the cart
  // is covered by it).
  applied: CashierReward | null
  appliedWorth: number
  saleTotal: number
  // Bumped after a sale so the points are read again.
  refreshKey: number
  formatAmount: (value: number) => string
  onCustomer: (member: { customerId: string; name: string; phone: string | null }) => void
  onApply: (reward: CashierReward | null) => void
}

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)
const productsOf = (items: RewardItem[]) =>
  items.filter((item) => item.kind === "product").map((item) => item.id)

export function CashierLoyaltyBox({
  customerId,
  online,
  applied,
  appliedWorth,
  saleTotal,
  refreshKey,
  formatAmount,
  onCustomer,
  onApply,
}: CashierLoyaltyProps) {
  const t = useTranslations("loyalty.cashier")
  const [loaded, setLoaded] = useState<{ key: string; view: CashierLoyalty } | null>(null)
  const [finding, setFinding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [code, setCode] = useState("")
  const [searching, setSearching] = useState(false)
  const [notFound, setNotFound] = useState<"none" | "missing" | "unlinked" | "failed">("none")

  const key = `${customerId ?? ""}:${refreshKey}`
  useEffect(() => {
    if (!online) return
    let cancelled = false
    loyaltyService
      .cashier(customerId ? { customerId } : {})
      .then((view) => {
        if (!cancelled) setLoaded({ key, view })
      })
      .catch(() => {
        if (!cancelled) setLoaded(null)
      })
    return () => {
      cancelled = true
    }
  }, [customerId, key, online])

  // The programme itself is known from any answer; the member only from this customer's.
  const program = loaded?.view ?? null
  const view = loaded?.key === key ? loaded.view : null
  const member = customerId ? (view?.member ?? null) : null
  const points = member?.points ?? 0

  const choices = useMemo(() => {
    if (!view || !customerId) return []
    const held = view.waiting
      ? [
          {
            id: view.waiting.id,
            held: true,
            name: view.waiting.rewardName,
            cost: 0,
            kind: view.waiting.kind,
            value: view.waiting.value,
            items: view.waiting.items,
            code: view.waiting.code,
          },
        ]
      : []
    const offered = view.rewards
      .slice()
      .sort((a, b) => a.pointsCost - b.pointsCost)
      .map((reward) => ({
        id: reward.id,
        held: false,
        name: reward.name,
        cost: reward.pointsCost,
        kind: reward.kind,
        value: reward.value,
        items: reward.items,
        code: null as string | null,
      }))
    return [...held, ...offered]
  }, [view, customerId])

  if (!online || !program?.isActive) return null

  const find = async () => {
    const typed = code.trim()
    if (!typed) return
    setSearching(true)
    setNotFound("none")
    try {
      const found = await loyaltyService.cashier({ code: typed })
      if (!found.member) setNotFound("missing")
      else if (!found.member.customerId) setNotFound("unlinked")
      else {
        onCustomer({
          customerId: found.member.customerId,
          name: found.member.name,
          phone: found.member.phone,
        })
        setFinding(false)
        setCode("")
      }
    } catch {
      setNotFound("failed")
    } finally {
      setSearching(false)
    }
  }

  const gives = (choice: { kind: RewardKind; value: number }) =>
    choice.kind === "amount"
      ? t("givesAmount", { amount: formatAmount(choice.value) })
      : choice.kind === "percent"
        ? t("givesPercent", { percent: choice.value })
        : t("givesFree")

  return (
    <>
      <div className="rounded-[10px] bg-[#f5f3ff] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-[#5b21b6]">
            <Gift className="size-4 shrink-0" />
            <span className="truncate">
              {customerId ? t("points", { count: points }) : t("title")}
            </span>
          </span>
          {applied ? (
            <span className="flex min-w-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[11.5px] font-bold text-[#5b21b6]">
              <span className="truncate">{applied.name}</span>
              <button
                type="button"
                aria-label={t("removeReward")}
                className="flex size-4 shrink-0 items-center justify-center rounded-full text-[#dc2626] hover:bg-[#fef2f2]"
                onClick={() => onApply(null)}
              >
                <X className="size-3" />
              </button>
            </span>
          ) : customerId ? (
            choices.length > 0 ? (
              <button
                type="button"
                className="shrink-0 rounded-full bg-[#6d28d9] px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-[#5b21b6]"
                onClick={() => setChoosing(true)}
              >
                {t("useReward")}
              </button>
            ) : null
          ) : (
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded-full bg-[#6d28d9] px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-[#5b21b6]"
              onClick={() => {
                setNotFound("none")
                setFinding(true)
              }}
            >
              <ScanLine className="size-3.5" />
              {t("findCard")}
            </button>
          )}
        </div>
        {applied ? (
          <p
            className={cn(
              "mt-1 text-[11.5px] leading-5",
              appliedWorth > 0 ? "text-[#5b21b6]" : "font-semibold text-[#b42318]"
            )}
          >
            {appliedWorth > 0
              ? t("rewardWorth", { amount: formatAmount(appliedWorth) })
              : t("rewardNotInCart")}
          </p>
        ) : customerId && program.pointsPerSar > 0 && saleTotal > 0 ? (
          <p className="mt-1 text-[11.5px] leading-5 text-[#5b21b6]">
            {t("willEarn", { count: Math.floor(saleTotal * program.pointsPerSar) })}
          </p>
        ) : null}
      </div>

      <AppDialog
        open={finding}
        onOpenChange={setFinding}
        title={t("findTitle")}
        description={t("findHint")}
        contentClassName="max-w-[420px]"
      >
        <div className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void find()
            }}
          >
            <input
              autoFocus
              dir="ltr"
              inputMode="tel"
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#e1e7f0] px-3 text-[14px] outline-none focus:border-[#6d28d9]"
              placeholder={t("findPlaceholder")}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button
              type="submit"
              disabled={searching || !code.trim()}
              className="flex h-11 shrink-0 items-center justify-center rounded-[10px] bg-[#6d28d9] px-4 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : t("findButton")}
            </button>
          </form>
          {notFound !== "none" ? (
            <p className="text-[12.5px] font-semibold text-[#b42318]">{t(`find.${notFound}`)}</p>
          ) : null}
        </div>
      </AppDialog>

      <AppDialog
        open={choosing}
        onOpenChange={setChoosing}
        title={t("chooseTitle")}
        description={t("chooseHint", { count: points })}
        contentClassName="max-w-[460px]"
      >
        <div className="min-h-0 overflow-y-auto">
          <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {choices.map((choice) => {
              const productIds = productsOf(choice.items)
              const servicesOnly = choice.items.length > 0 && productIds.length === 0
              const short = !choice.held && choice.cost > points
              // One reward waits at a time, so a held one must be used before another is taken.
              const blocked = !choice.held && Boolean(view?.waiting)
              const disabled = servicesOnly || short || blocked
              return (
                <li key={choice.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-start",
                      disabled
                        ? "border-[#eef1f6] bg-[#f9fafb] opacity-60"
                        : "border-[#ddd6fe] bg-white hover:bg-[#f5f3ff]"
                    )}
                    onClick={() => {
                      if (!customerId) return
                      onApply({
                        customerId,
                        rewardId: choice.held ? null : choice.id,
                        redemptionId: choice.held ? choice.id : null,
                        name: choice.name,
                        kind: choice.kind,
                        value: choice.value,
                        restricted: choice.items.length > 0,
                        productIds,
                      })
                      setChoosing(false)
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-[#0d1b3e]">
                        {choice.name}
                      </span>
                      <span className="block text-[12px] text-[#5b6b85]">
                        {gives(choice)}
                        {choice.items.length > 0
                          ? ` · ${choice.items.map((item) => item.name).join("، ")}`
                          : ""}
                      </span>
                      {servicesOnly || short || blocked ? (
                        <span className="block text-[11.5px] font-semibold text-[#b42318]">
                          {servicesOnly
                            ? t("servicesOnly")
                            : blocked
                              ? t("heldFirst")
                              : t("short", { count: choice.cost - points })}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#f5f3ff] px-2.5 py-1 text-[11.5px] font-bold text-[#5b21b6]">
                      {choice.held
                        ? t("heldCode", { code: choice.code ?? "" })
                        : t("cost", { count: number(choice.cost) })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </AppDialog>
    </>
  )
}
