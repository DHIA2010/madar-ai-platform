"use client"

// What a customer sees: the page they join the programme from (opened from the business's QR),
// and their own card, opened from its link.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, Gift, Loader2, Star, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { publicLoyaltyService } from "../services/loyalty.service"
import type { PublicLoyaltyCard, PublicLoyaltyProgram, PublicReward } from "../types/loyalty.types"
import { LoyaltyCard } from "./shell"

const SHELL = "mx-auto flex min-h-dvh w-full max-w-[460px] flex-col gap-4 px-4 py-6"
const BOX = "rounded-[18px] border border-[#e4e9f2] bg-white p-4"
const INPUT =
  "h-12 w-full rounded-[12px] border border-[#e1e7f0] bg-white px-3 text-[15px] text-[#0b1738] outline-none focus:border-[#0b1738]"

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)

function Missing({ text }: { text: string }) {
  return (
    <main dir="rtl" className={cn(SHELL, "items-center justify-center text-center")}>
      <Gift className="size-10 text-[#a3b0c6]" />
      <p className="text-[15px] font-bold text-[#0b1738]">{text}</p>
    </main>
  )
}

function Waiting() {
  return (
    <main className={cn(SHELL, "items-center justify-center")}>
      <Loader2 className="size-6 animate-spin text-[#6b7b96]" />
    </main>
  )
}

function useRewardText() {
  const t = useTranslations("loyalty.public")
  return (reward: PublicReward) =>
    reward.kind === "amount"
      ? t("rewardAmount", { amount: number(reward.value) })
      : reward.kind === "percent"
        ? t("rewardPercent", { percent: number(reward.value) })
        : t("rewardFree")
}

function Rewards({
  program,
  points,
  busyId,
  onTake,
}: {
  program: PublicLoyaltyProgram
  // The member's balance, on their own card; absent on the join page.
  points?: number
  busyId?: string | null
  onTake?: (reward: PublicReward) => void
}) {
  const t = useTranslations("loyalty.public")
  const rewardText = useRewardText()
  if (program.rewards.length === 0) return null
  return (
    <section className={BOX}>
      <h2 className="text-[15px] font-extrabold text-[#0b1738]">{t("rewards")}</h2>
      <ul className="mt-2 divide-y divide-[#eef1f6]">
        {program.rewards.map((reward) => {
          const short = points === undefined ? 0 : Math.max(0, reward.pointsCost - points)
          return (
            <li key={reward.id} className="flex items-center gap-3 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f1f4f9] text-[#0b1738]">
                <Gift className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[#0b1738]">{reward.name}</span>
                <span className="block text-[12.5px] leading-5 text-[#6b7b96]">
                  {rewardText(reward)}
                  {reward.items.length ? ` · ${reward.items.join("، ")}` : ""}
                </span>
                <span className="block text-[12.5px] font-bold text-[#0b1738]">
                  {t("pointsCount", { count: reward.pointsCost })}
                </span>
              </span>
              {onTake ? (
                short > 0 ? (
                  <span className="shrink-0 text-[12px] font-semibold text-[#6b7b96]">
                    {t("shortBy", { count: short })}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="h-10 shrink-0 rounded-full bg-[#0b1738] px-4 text-[13px] font-bold text-white disabled:opacity-60"
                    disabled={busyId !== null && busyId !== undefined}
                    onClick={() => onTake(reward)}
                  >
                    {busyId === reward.id ? <Loader2 className="size-4 animate-spin" /> : t("take")}
                  </button>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// The join page behind the business's QR.
export function PublicLoyaltyJoinView({ code }: { code: string }) {
  const t = useTranslations("loyalty.public")
  const router = useRouter()
  const [program, setProgram] = useState<PublicLoyaltyProgram | null>(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [sending, setSending] = useState(false)
  const [already, setAlready] = useState(false)
  const [problem, setProblem] = useState(false)

  useEffect(() => {
    publicLoyaltyService
      .joinPage(code)
      .then(setProgram)
      .catch(() => setMissing(true))
  }, [code])

  if (missing) return <Missing text={t("joinMissing")} />
  if (!program) return <Waiting />

  const cleanPhone = phone.replace(/[\s-]/g, "")
  const ready = name.trim().length > 1 && /^\+?[0-9]{9,15}$/.test(cleanPhone)
  const join = async () => {
    setSending(true)
    setProblem(false)
    try {
      const result = await publicLoyaltyService.join(code, { name: name.trim(), phone: cleanPhone })
      if (result.token) router.replace(ROUTES.publicLoyaltyCard(result.token))
      else setAlready(true)
    } catch {
      setProblem(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <main dir="rtl" className={SHELL}>
      <div className="flex justify-center">
        <LoyaltyCard look={program} name={name.trim() || t("yourName")} points={0} />
      </div>
      <section className={BOX}>
        <h1 className="text-[18px] font-extrabold text-[#0b1738]">
          {t("joinTitle", { name: program.businessName })}
        </h1>
        <p className="mt-1 text-[13.5px] leading-6 text-[#6b7b96]">
          {t("joinEarn", { count: program.pointsPerSar })}
        </p>
        {already ? (
          <p className="mt-4 rounded-[12px] bg-[#eef4ff] px-3 py-3 text-[13.5px] leading-6 font-semibold text-[#1d4fd8]">
            {t("alreadyMember")}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <input
              className={INPUT}
              placeholder={t("name")}
              aria-label={t("name")}
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <input
              className={INPUT}
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder="05XXXXXXXX"
              aria-label={t("phone")}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            {problem ? (
              <p className="text-[13px] font-semibold text-[#b42318]">{t("problem")}</p>
            ) : null}
            <button
              type="button"
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#0b1738] text-[15px] font-bold text-white disabled:opacity-50"
              disabled={!ready || sending}
              onClick={() => void join()}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("join")}
            </button>
          </div>
        )}
      </section>
      <Rewards program={program} />
      {program.terms ? (
        <p className="px-1 text-[12px] leading-5 whitespace-pre-line text-[#6b7b96]">
          {program.terms}
        </p>
      ) : null}
    </main>
  )
}

// A member's own card.
export function PublicLoyaltyCardView({ token }: { token: string }) {
  const t = useTranslations("loyalty.public")
  const kinds = useTranslations("loyalty.kinds")
  const [card, setCard] = useState<PublicLoyaltyCard | null>(null)
  const [missing, setMissing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [asking, setAsking] = useState<PublicReward | null>(null)
  const [reviewOpened, setReviewOpened] = useState(false)
  const [problem, setProblem] = useState(false)

  useEffect(() => {
    publicLoyaltyService
      .card(token)
      .then(setCard)
      .catch(() => setMissing(true))
  }, [token])

  if (missing) return <Missing text={t("cardMissing")} />
  if (!card) return <Waiting />

  const act = async (id: string, work: () => Promise<PublicLoyaltyCard>) => {
    setBusyId(id)
    setProblem(false)
    try {
      setCard(await work())
    } catch {
      setProblem(true)
    } finally {
      setBusyId(null)
      setAsking(null)
    }
  }
  const date = (instant: string) =>
    new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Riyadh",
    }).format(new Date(instant))

  return (
    <main dir="rtl" className={SHELL}>
      <div className="flex justify-center">
        <LoyaltyCard look={card} name={card.name} points={card.points} code={card.cardCode} />
      </div>
      <p className="text-center text-[12.5px] leading-5 text-[#6b7b96]">{t("showCode")}</p>

      {card.walletAvailable ? (
        <a
          href={publicLoyaltyService.passUrl(token)}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-black text-[15px] font-bold text-white"
        >
          <Wallet className="size-5" />
          {t("addToWallet")}
        </a>
      ) : null}

      {card.points > 0 ? (
        <p className="rounded-[14px] bg-[#f1f4f9] px-4 py-3 text-center text-[13.5px] font-semibold text-[#0b1738]">
          {t("worth", { amount: number(card.pointsValue) })}
        </p>
      ) : null}

      {card.waitingReward ? (
        <section className="rounded-[18px] border border-[#abefc6] bg-[#ecfdf3] p-4 text-center">
          <p className="text-[13.5px] font-bold text-[#067647]">
            {t("waitingReward", { reward: card.waitingReward.name })}
          </p>
          <p className="mt-2 font-mono text-[30px] leading-9 font-black tracking-[0.3em] text-[#067647]">
            {card.waitingReward.code}
          </p>
          <p className="mt-1 text-[12.5px] text-[#067647]">{t("waitingHint")}</p>
        </section>
      ) : null}

      {problem ? (
        <p className="text-center text-[13px] font-semibold text-[#b42318]">{t("problem")}</p>
      ) : null}

      {asking ? (
        <section className={cn(BOX, "text-center")}>
          <p className="text-[14.5px] font-bold text-[#0b1738]">
            {t("confirmTake", { reward: asking.name, count: asking.pointsCost })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="h-11 rounded-full border border-[#e1e7f0] text-[14px] font-bold text-[#0b1738]"
              disabled={busyId !== null}
              onClick={() => setAsking(null)}
            >
              {t("back")}
            </button>
            <button
              type="button"
              className="flex h-11 items-center justify-center rounded-full bg-[#0b1738] text-[14px] font-bold text-white disabled:opacity-60"
              disabled={busyId !== null}
              onClick={() =>
                void act(asking.id, () => publicLoyaltyService.redeem(token, asking.id))
              }
            >
              {busyId ? <Loader2 className="size-4 animate-spin" /> : t("confirm")}
            </button>
          </div>
        </section>
      ) : null}

      {card.isActive ? (
        <Rewards
          program={card}
          points={card.points}
          busyId={busyId}
          onTake={card.waitingReward ? undefined : setAsking}
        />
      ) : null}

      {card.isActive && (card.review || card.onlineBonus) ? (
        <section className={BOX}>
          <h2 className="text-[15px] font-extrabold text-[#0b1738]">{t("more")}</h2>
          {card.review ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#fffaeb] text-[#b54708]">
                <Star className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[#0b1738]">{t("review")}</span>
                <span className="block text-[12.5px] text-[#6b7b96]">
                  {t("bonus", { count: card.review.points })}
                </span>
              </span>
              {card.review.done ? (
                <CheckCircle2 className="size-6 shrink-0 text-[#17b26a]" />
              ) : reviewOpened ? (
                <button
                  type="button"
                  className="h-10 shrink-0 rounded-full bg-[#0b1738] px-4 text-[13px] font-bold text-white disabled:opacity-60"
                  disabled={busyId !== null}
                  onClick={() => void act("review", () => publicLoyaltyService.reviewDone(token))}
                >
                  {busyId === "review" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("reviewDone")
                  )}
                </button>
              ) : (
                <a
                  href={card.review.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 shrink-0 items-center rounded-full bg-[#0b1738] px-4 text-[13px] font-bold text-white"
                  onClick={() => setReviewOpened(true)}
                >
                  {t("reviewGo")}
                </a>
              )}
            </div>
          ) : null}
          {card.onlineBonus ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#1d4fd8]">
                <Gift className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[#0b1738]">{t("online")}</span>
                <span className="block text-[12.5px] text-[#6b7b96]">
                  {t("bonus", { count: card.onlineBonus })}
                </span>
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {card.activity.length ? (
        <section className={BOX}>
          <h2 className="text-[15px] font-extrabold text-[#0b1738]">{t("activity")}</h2>
          <ul className="mt-2 divide-y divide-[#eef1f6]">
            {card.activity.map((line, index) => (
              <li key={index} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-[#0b1738]">
                    {kinds.has(line.kind) ? kinds(line.kind) : line.kind}
                  </span>
                  <span className="block text-[12px] text-[#6b7b96]">{date(line.createdAt)}</span>
                </span>
                <span
                  dir="ltr"
                  className={cn(
                    "text-[14px] font-black tabular-nums",
                    line.points > 0 ? "text-[#137a41]" : "text-[#b42318]"
                  )}
                >
                  {line.points > 0 ? "+" : "−"}
                  {number(Math.abs(line.points))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="px-1 text-center text-[12px] leading-5 text-[#6b7b96]">{t("keepLink")}</p>
      {card.terms ? (
        <p className="px-1 text-[12px] leading-5 whitespace-pre-line text-[#6b7b96]">
          {card.terms}
        </p>
      ) : null}
    </main>
  )
}
