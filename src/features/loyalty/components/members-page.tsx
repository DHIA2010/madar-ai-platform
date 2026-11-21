"use client"

// The programme's members: who has a card, their balance, and for one member everything the
// staff do by hand -- show the card to scan, add or take points, hand over a reward.

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, Copy, Loader2, Plus, Search, Smartphone, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog, AppInput } from "@/components/app"

import { useLoad, useLoyaltyAccess, useLoyaltyError, useLoyaltyFormat } from "../hooks/use-loyalty"
import { loyaltyService } from "../services/loyalty.service"
import type { LoyaltyMemberDetails, LoyaltyReward } from "../types/loyalty.types"
import { Choice, Empty, LoadFailed, Loading, LoyaltyPage, QrImage } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  HEADING,
  ICON_BUTTON,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TH,
} from "./styles"

function MemberDialog({
  memberId,
  rewards,
  onClose,
  onChanged,
}: {
  memberId: string | null
  rewards: LoyaltyReward[]
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations("loyalty.members")
  const kinds = useTranslations("loyalty.kinds")
  const format = useLoyaltyFormat()
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const [details, setDetails] = useState<LoyaltyMemberDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [rewardId, setRewardId] = useState("")

  useEffect(() => {
    setDetails(null)
    setAmount("")
    setNote("")
    setRewardId("")
    if (!memberId) return
    let cancelled = false
    loyaltyService
      .member(memberId)
      .then((value) => {
        if (!cancelled) setDetails(value)
      })
      .catch(() => {
        if (!cancelled) onClose()
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads only for another member
  }, [memberId])

  const run = async (work: () => Promise<LoyaltyMemberDetails>, done: string) => {
    setBusy(true)
    try {
      setDetails(await work())
      toast.success(done)
      onChanged()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  const member = details?.member
  const cardLink =
    member && typeof window !== "undefined"
      ? `${window.location.origin}${ROUTES.publicLoyaltyCard(member.token)}`
      : ""
  const offered = rewards.filter((reward) => reward.isActive)
  const chosen = offered.find((reward) => reward.id === rewardId)
  const points = Math.round(Number(amount) || 0)
  const waiting = details?.redemptions.filter((entry) => entry.status === "active") ?? []

  return (
    <AppDialog
      open={memberId !== null}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
      title={member?.name ?? t("member")}
      description={member?.phone ?? undefined}
    >
      {!details || !member ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto pe-1">
          <div className="flex flex-wrap items-center gap-4 rounded-[14px] bg-[#fdf2f8] p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-[#9d174d]">{t("balance")}</p>
              <p className="text-[30px] leading-9 font-black text-[#9d174d] tabular-nums">
                {format.number(member.points)}
              </p>
              <p className="mt-1 text-[12.5px] text-[#9d174d]/80">
                {t("lifetime", { count: member.lifetimePoints })} · {t("cardCode")}{" "}
                <span dir="ltr" className="font-mono">
                  {member.cardCode}
                </span>
              </p>
              {member.inWallet ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#137a41]">
                  <Smartphone className="size-3.5" />
                  {t("inWallet")}
                </p>
              ) : null}
            </div>
            <div className="text-center">
              <QrImage value={cardLink} size={104} label={t("showCard")} />
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#9d174d]"
                onClick={() => {
                  void navigator.clipboard.writeText(cardLink)
                  toast.success(t("linkCopied"))
                }}
              >
                <Copy className="size-3.5" />
                {t("copyLink")}
              </button>
            </div>
            <p className="w-full text-[12px] leading-5 text-[#9d174d]/80">{t("showCardHint")}</p>
          </div>

          {waiting.length > 0 ? (
            <div className="rounded-[14px] border border-[#fedf89] bg-[#fffaeb] p-3">
              {waiting.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-3">
                  <span className="rounded-[10px] bg-white px-2.5 py-1 font-mono text-[14px] font-bold tracking-widest text-[#93370d]">
                    {entry.code}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] font-bold text-[#93370d]">
                    {t("waiting", { reward: entry.rewardName })}
                  </span>
                  {canManage ? (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await loyaltyService.closeRedemption(entry.id, "use")
                            return loyaltyService.member(member.id)
                          }, t("handedOver"))
                        }
                      >
                        <Check className="size-4" />
                        {t("handOver")}
                      </button>
                      <button
                        type="button"
                        className={cn(ICON_BUTTON, "size-11 text-[#b42318]")}
                        aria-label={t("callOff")}
                        title={t("callOff")}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await loyaltyService.closeRedemption(entry.id, "cancel")
                            return loyaltyService.member(member.id)
                          }, t("calledOff"))
                        }
                      >
                        <X className="size-4" />
                      </button>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {canManage ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[14px] border border-[#eef1f6] p-3">
                <p className={cn("text-[13.5px] font-bold", HEADING)}>{t("redeemTitle")}</p>
                {offered.length === 0 ? (
                  <p className={cn("mt-2 text-[12.5px]", MUTED)}>{t("noRewards")}</p>
                ) : (
                  <>
                    <Choice
                      className="mt-2"
                      value={rewardId}
                      onChange={setRewardId}
                      ariaLabel={t("redeemTitle")}
                      options={offered.map((reward) => ({
                        value: reward.id,
                        label: reward.name,
                        hint: format.points(reward.pointsCost),
                      }))}
                    />
                    <button
                      type="button"
                      className={cn(PRIMARY_BUTTON, "mt-2 w-full")}
                      disabled={busy || !chosen || chosen.pointsCost > member.points}
                      onClick={() =>
                        chosen
                          ? void run(async () => {
                              const next = await loyaltyService.redeem(member.id, chosen.id)
                              setRewardId("")
                              return next
                            }, t("redeemed"))
                          : undefined
                      }
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {chosen && chosen.pointsCost > member.points
                        ? t("short", { count: chosen.pointsCost - member.points })
                        : t("redeem")}
                    </button>
                  </>
                )}
              </div>
              <div className="rounded-[14px] border border-[#eef1f6] p-3">
                <p className={cn("text-[13.5px] font-bold", HEADING)}>{t("adjustTitle")}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <AppInput
                    type="number"
                    inputMode="numeric"
                    className={FIELD}
                    placeholder={t("adjustPoints")}
                    aria-label={t("adjustPoints")}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <AppInput
                    className={FIELD}
                    maxLength={200}
                    placeholder={t("adjustNote")}
                    aria-label={t("adjustNote")}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={busy || points <= 0}
                    onClick={() =>
                      void run(async () => {
                        const next = await loyaltyService.adjust(member.id, {
                          points,
                          note: note.trim() || null,
                        })
                        setAmount("")
                        setNote("")
                        return next
                      }, t("adjusted"))
                    }
                  >
                    {t("give")}
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    disabled={busy || points <= 0 || points > member.points}
                    onClick={() =>
                      void run(async () => {
                        const next = await loyaltyService.adjust(member.id, {
                          points: -points,
                          note: note.trim() || null,
                        })
                        setAmount("")
                        setNote("")
                        return next
                      }, t("adjusted"))
                    }
                  >
                    {t("takeBack")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <p className={cn("text-[13.5px] font-bold", HEADING)}>{t("history")}</p>
            {details.ledger.length === 0 ? (
              <p className={cn("mt-2 text-[12.5px]", MUTED)}>{t("historyEmpty")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#eef1f6] rounded-[12px] border border-[#eef1f6]">
                {details.ledger.map((line) => (
                  <li key={line.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px] font-semibold", HEADING)}>
                        {kinds.has(line.kind) ? kinds(line.kind) : line.kind}
                        {line.note ? ` — ${line.note}` : ""}
                      </span>
                      <span className={cn("block text-[12px]", MUTED)}>
                        {t(`sources.${line.source}`)} · {format.date(line.createdAt)}
                      </span>
                    </span>
                    <span
                      dir="ltr"
                      className={cn(
                        "text-[13.5px] font-black tabular-nums",
                        line.points > 0 ? "text-[#137a41]" : "text-[#b42318]"
                      )}
                    >
                      {line.points > 0 ? "+" : "−"}
                      {format.number(Math.abs(line.points))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AppDialog>
  )
}

export function LoyaltyMembersPage() {
  const t = useTranslations("loyalty.members")
  const format = useLoyaltyFormat()
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const [search, setSearch] = useState("")
  const [needle, setNeedle] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ name: string; phone: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setNeedle(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  const data = useLoad(
    () =>
      Promise.all([loyaltyService.members(needle || undefined), loyaltyService.rewards()]).then(
        ([members, rewards]) => ({ members, rewards })
      ),
    [needle]
  )

  const add = async () => {
    if (!adding) return
    setBusy(true)
    try {
      const member = await loyaltyService.addMember({
        name: adding.name.trim(),
        phone: adding.phone.trim(),
      })
      toast.success(t("added"))
      setAdding(null)
      data.reload()
      setOpenId(member.id)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <LoyaltyPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => setAdding({ name: "", phone: "" })}
          >
            <Plus className="size-4" />
            {t("add")}
          </button>
        ) : null
      }
    >
      <div className={cn(PANEL, "overflow-hidden")}>
        <div className="flex items-center gap-2 border-b border-[#eef1f6] px-4">
          <Search className="size-4 text-[#8a97ad]" />
          <input
            className="h-12 w-full bg-transparent text-[13.5px] outline-none"
            placeholder={t("search")}
            aria-label={t("search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {data.failed ? (
          <LoadFailed onRetry={data.reload} />
        ) : data.data === null ? (
          <Loading />
        ) : data.data.members.length === 0 ? (
          <Empty title={needle ? t("noMatch") : t("emptyTitle")}>
            {needle ? null : t("emptyHint")}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("name")}</th>
                  <th className={TH}>{t("phone")}</th>
                  <th className={TH}>{t("points")}</th>
                  <th className={TH}>{t("earnedTotal")}</th>
                  <th className={TH}>{t("joined")}</th>
                </tr>
              </thead>
              <tbody>
                {data.data.members.map((member) => (
                  <tr
                    key={member.id}
                    className="cursor-pointer border-b border-[#eef1f6] hover:bg-[#fafbfd]"
                    onClick={() => setOpenId(member.id)}
                  >
                    <td className={cn(TD, "font-bold")}>
                      <button type="button" className="text-start">
                        {member.name}
                      </button>
                      {member.inWallet ? (
                        <span
                          className="ms-2 inline-flex items-center gap-1 rounded-full bg-[#e7f8ee] px-2 py-0.5 text-[11px] font-bold text-[#137a41]"
                          title={t("inWallet")}
                        >
                          <Smartphone className="size-3" />
                          {t("wallet")}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD} dir="ltr">
                      <span className="block text-start">{member.phone ?? "—"}</span>
                    </td>
                    <td className={cn(TD, "font-black tabular-nums")}>
                      {format.number(member.points)}
                    </td>
                    <td className={cn(TD, "tabular-nums", MUTED)}>
                      {format.number(member.lifetimePoints)}
                    </td>
                    <td className={cn(TD, MUTED)}>
                      {t(`joinedBy.${member.source}`)} · {format.date(member.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MemberDialog
        memberId={openId}
        rewards={data.data?.rewards ?? []}
        onClose={() => setOpenId(null)}
        onChanged={data.reload}
      />

      <AppDialog
        open={adding !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setAdding(null)
        }}
        title={t("addTitle")}
        description={t("addHint")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setAdding(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={
                busy ||
                !adding?.name.trim() ||
                !/^\+?[0-9]{9,15}$/.test((adding?.phone ?? "").replace(/[\s-]/g, ""))
              }
              onClick={() => void add()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {adding ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL} htmlFor="member-name">
                {t("name")}
              </label>
              <AppInput
                id="member-name"
                className={FIELD}
                maxLength={120}
                value={adding.name}
                onChange={(event) => setAdding({ ...adding, name: event.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="member-phone">
                {t("phone")}
              </label>
              <AppInput
                id="member-phone"
                dir="ltr"
                inputMode="tel"
                className={FIELD}
                placeholder="05XXXXXXXX"
                value={adding.phone}
                onChange={(event) => setAdding({ ...adding, phone: event.target.value })}
              />
            </div>
          </div>
        ) : null}
      </AppDialog>
    </LoyaltyPage>
  )
}
