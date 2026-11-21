"use client"

// The Loyalty app's first screen: how the programme is doing, the rewards waiting to be handed
// over, and the QR customers scan to join.

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Check, Copy, Printer, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { useLoad, useLoyaltyAccess, useLoyaltyError, useLoyaltyFormat } from "../hooks/use-loyalty"
import { loyaltyService } from "../services/loyalty.service"
import { Empty, LoadFailed, Loading, LoyaltyPage, QrImage } from "./shell"
import { HEADING, ICON_BUTTON, MUTED, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./styles"

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <p className={cn("text-[12.5px] font-semibold", MUTED)}>{label}</p>
      <p className={cn("mt-1 text-[24px] leading-8 font-black tabular-nums", HEADING)}>{value}</p>
      {hint ? <p className={cn("mt-0.5 text-[12px]", MUTED)}>{hint}</p> : null}
    </div>
  )
}

export function LoyaltyOverviewPage() {
  const t = useTranslations("loyalty.overview")
  const kinds = useTranslations("loyalty.kinds")
  const format = useLoyaltyFormat()
  const errorText = useLoyaltyError()
  const { canManage } = useLoyaltyAccess()
  const [busy, setBusy] = useState<string | null>(null)
  const data = useLoad(
    () =>
      Promise.all([
        loyaltyService.overview(),
        loyaltyService.program(),
        loyaltyService.waitingRedemptions(),
      ]).then(([overview, program, waiting]) => ({ overview, program, waiting })),
    []
  )
  const joinLink =
    data.data && typeof window !== "undefined"
      ? `${window.location.origin}${ROUTES.publicLoyaltyJoin(data.data.program.joinCode)}`
      : ""

  const close = async (id: string, outcome: "use" | "cancel") => {
    setBusy(id)
    try {
      await loyaltyService.closeRedemption(id, outcome)
      toast.success(outcome === "use" ? t("handedOver") : t("calledOff"))
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <LoyaltyPage title={t("title")} subtitle={t("subtitle")}>
      {data.failed ? (
        <LoadFailed onRetry={data.reload} />
      ) : data.data === null ? (
        <Loading />
      ) : (
        <>
          {data.data.overview.isActive ? null : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#fedf89] bg-[#fffaeb] px-4 py-3">
              <p className="text-[13.5px] font-semibold text-[#93370d]">{t("inactive")}</p>
              <Link href={ROUTES.loyaltySettings} className={PRIMARY_BUTTON}>
                {t("setUp")}
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label={t("members")}
              value={format.number(data.data.overview.members)}
              hint={t("newMembers", { count: data.data.overview.newMembers })}
            />
            <Tile
              label={t("outstanding")}
              value={format.number(data.data.overview.outstandingPoints)}
              hint={t("worth", { amount: format.money(data.data.overview.outstandingValue) })}
            />
            <Tile
              label={t("earned")}
              value={format.number(data.data.overview.earned)}
              hint={t("last30")}
            />
            <Tile
              label={t("redeemed")}
              value={format.number(data.data.overview.redeemed)}
              hint={t("last30")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <section className={cn(PANEL, "overflow-hidden")}>
                <h2 className={cn("px-4 pt-4 text-[15px] font-extrabold", HEADING)}>
                  {t("waitingTitle")}
                </h2>
                <p className={cn("px-4 text-[12.5px]", MUTED)}>{t("waitingHint")}</p>
                {data.data.waiting.length === 0 ? (
                  <Empty>{t("waitingEmpty")}</Empty>
                ) : (
                  <ul className="mt-3 divide-y divide-[#eef1f6]">
                    {data.data.waiting.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="rounded-[10px] bg-[#fdf2f8] px-2.5 py-1 font-mono text-[14px] font-bold tracking-widest text-[#be185d]">
                          {entry.code}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[13.5px] font-bold", HEADING)}>
                            {entry.rewardName}
                          </span>
                          <span className={cn("block text-[12.5px]", MUTED)}>
                            {entry.memberName}
                            {entry.memberPhone ? ` · ${entry.memberPhone}` : ""}
                          </span>
                        </span>
                        {canManage ? (
                          <span className="flex gap-2">
                            <button
                              type="button"
                              className={SECONDARY_BUTTON}
                              disabled={busy === entry.id}
                              onClick={() => void close(entry.id, "use")}
                            >
                              <Check className="size-4" />
                              {t("handOver")}
                            </button>
                            <button
                              type="button"
                              className={cn(ICON_BUTTON, "size-11 text-[#b42318]")}
                              aria-label={t("callOff")}
                              title={t("callOff")}
                              disabled={busy === entry.id}
                              onClick={() => void close(entry.id, "cancel")}
                            >
                              <X className="size-4" />
                            </button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={cn(PANEL, "overflow-hidden")}>
                <h2 className={cn("px-4 pt-4 text-[15px] font-extrabold", HEADING)}>
                  {t("recentTitle")}
                </h2>
                {data.data.overview.recent.length === 0 ? (
                  <Empty>{t("recentEmpty")}</Empty>
                ) : (
                  <ul className="mt-2 divide-y divide-[#eef1f6]">
                    {data.data.overview.recent.map((line) => (
                      <li key={line.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-[13.5px] font-bold", HEADING)}>
                            {line.memberName}
                          </span>
                          <span className={cn("block text-[12px]", MUTED)}>
                            {kinds.has(line.kind) ? kinds(line.kind) : line.kind} ·{" "}
                            {format.date(line.createdAt)}
                          </span>
                        </span>
                        <span
                          dir="ltr"
                          className={cn(
                            "text-[14px] font-black tabular-nums",
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
              </section>
            </div>

            <div className="flex flex-col gap-4">
              <section className={cn(PANEL, "p-4 text-center")}>
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("joinTitle")}</h2>
                <p className={cn("mt-1 text-[12.5px] leading-5", MUTED)}>{t("joinHint")}</p>
                <div id="loyalty-join-qr" className="mt-3 flex justify-center">
                  {joinLink ? <QrImage value={joinLink} size={180} label={t("joinTitle")} /> : null}
                </div>
                <p dir="ltr" className={cn("mt-2 truncate text-[12px]", MUTED)}>
                  {joinLink}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      void navigator.clipboard.writeText(joinLink)
                      toast.success(t("copied"))
                    }}
                  >
                    <Copy className="size-4" />
                    {t("copy")}
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => {
                      const image = document.querySelector<HTMLImageElement>("#loyalty-join-qr img")
                      const sheet = window.open("", "_blank")
                      if (!image || !sheet) return
                      const title = document.createElement("h1")
                      title.textContent = data.data?.program.businessName ?? ""
                      const line = document.createElement("p")
                      line.textContent = t("printLine")
                      const picture = sheet.document.createElement("img")
                      picture.src = image.src
                      picture.style.width = "320px"
                      sheet.document.body.style.cssText =
                        "font-family:system-ui,sans-serif;text-align:center;padding:48px;direction:rtl"
                      sheet.document.body.append(title, line, picture)
                      sheet.document.title = title.textContent
                      setTimeout(() => sheet.print(), 300)
                    }}
                  >
                    <Printer className="size-4" />
                    {t("print")}
                  </button>
                </div>
              </section>

              <section className={cn(PANEL, "p-4")}>
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("sourcesTitle")}</h2>
                <dl className="mt-3 space-y-2 text-[13.5px]">
                  {(
                    [
                      ["fromBooking", data.data.overview.earnedFromBooking],
                      ["fromCashier", data.data.overview.earnedFromCashier],
                      ["fromBonus", data.data.overview.bonusPoints],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <dt className={MUTED}>{t(key)}</dt>
                      <dd className={cn("font-bold tabular-nums", HEADING)}>
                        {format.number(value)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-[#eef1f6] pt-2">
                    <dt className={MUTED}>{t("inWallet")}</dt>
                    <dd className={cn("font-bold tabular-nums", HEADING)}>
                      {format.number(data.data.overview.inWallet)}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className={cn(PANEL, "p-4")}>
                <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("topTitle")}</h2>
                {data.data.overview.top.length === 0 ? (
                  <p className={cn("mt-2 text-[13px]", MUTED)}>{t("topEmpty")}</p>
                ) : (
                  <ol className="mt-3 space-y-2 text-[13.5px]">
                    {data.data.overview.top.map((member, index) => (
                      <li key={member.id} className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-[#fdf2f8] text-[11.5px] font-black text-[#be185d]">
                          {index + 1}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate font-semibold", HEADING)}>
                          {member.name}
                        </span>
                        <span className={cn("font-bold tabular-nums", HEADING)}>
                          {format.number(member.points)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </LoyaltyPage>
  )
}
