"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  Banknote,
  BookText,
  Boxes,
  HandCoins,
  Landmark,
  type LucideIcon,
  Percent,
  ReceiptText,
  RefreshCw,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  presetRange,
  useAccountingAccess,
  useAccountingError,
  useFormatters,
  useLoader,
} from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import { AccountingPage, LoadFailed, Loading, RangeControl } from "./shell"
import { AMOUNT, HEADING, MUTED, PANEL, SECONDARY_BUTTON } from "./styles"

function Figure({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: string
  hint?: string
}) {
  return (
    <div className={cn(PANEL, "p-5")}>
      <span className={cn("flex size-11 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </span>
      <p className={cn("mt-4 text-[13px]", MUTED)}>{label}</p>
      <p className={cn("mt-1 text-[22px] font-extrabold", HEADING, AMOUNT)}>{value}</p>
      {hint ? <p className={cn("mt-1 text-[11.5px]", MUTED)}>{hint}</p> : null}
    </div>
  )
}

// Where the business stands: what it earned in the period and what it holds and owes today.
export function AccountingOverviewPage() {
  const t = useTranslations("accounting.overview")
  const tCommon = useTranslations("accounting.common")
  const { signed, date, dateTime } = useFormatters()
  const { canManage } = useAccountingAccess()
  const errorText = useAccountingError()
  const [range, setRange] = useState(() => presetRange("thisMonth"))
  const [syncing, setSyncing] = useState(false)
  const { data, loading, failed, reload } = useLoader(
    () => accountingService.overview(range),
    `${range.from}|${range.to}`
  )

  async function syncNow() {
    setSyncing(true)
    try {
      const result = await accountingService.sync(false)
      toast.success(t("synced", { count: result.created + result.updated + result.removed }))
      reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setSyncing(false)
    }
  }

  const links = [
    { href: ROUTES.accountingIncomeStatement, label: t("links.incomeStatement"), icon: TrendingUp },
    { href: ROUTES.accountingBalanceSheet, label: t("links.balanceSheet"), icon: Landmark },
    { href: ROUTES.accountingTrialBalance, label: t("links.trialBalance"), icon: Scale },
    { href: ROUTES.accountingJournal, label: t("links.journal"), icon: BookText },
  ]

  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <>
          <RangeControl range={range} onChange={setRange} />
          {canManage ? (
            <button type="button" className={SECONDARY_BUTTON} onClick={syncNow} disabled={syncing}>
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
              {t("syncNow")}
            </button>
          ) : null}
        </>
      }
    >
      {failed ? (
        <LoadFailed onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity", loading && "opacity-60")}>
          <p className={cn("text-[12.5px]", MUTED)}>
            {t("autoPosted")}{" "}
            {data.lastSyncedAt ? t("lastSynced", { when: dateTime(data.lastSyncedAt) }) : null}
            {data.lockedThrough
              ? ` · ${t("lockedThrough", { day: date(data.lockedThrough) })}`
              : null}
          </p>

          <section>
            <h2 className={cn("mb-2.5 text-[14px] font-bold", HEADING)}>{t("periodTitle")}</h2>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <Figure
                label={t("revenue")}
                value={signed(data.revenue)}
                icon={ReceiptText}
                tone="bg-emerald-50 text-emerald-700"
              />
              <Figure
                label={t("grossProfit")}
                value={signed(data.grossProfit)}
                icon={TrendingUp}
                tone="bg-blue-50 text-blue-600"
                hint={t("costOfSales", { amount: signed(data.costOfSales) })}
              />
              <Figure
                label={t("expenses")}
                value={signed(data.expenses)}
                icon={Wallet}
                tone="bg-orange-50 text-orange-600"
              />
              <Figure
                label={t("netProfit")}
                value={signed(data.netProfit)}
                icon={Scale}
                tone={
                  data.netProfit < 0 ? "bg-rose-50 text-rose-600" : "bg-violet-50 text-violet-600"
                }
              />
            </div>
          </section>

          <section>
            <h2 className={cn("mb-2.5 text-[14px] font-bold", HEADING)}>
              {t("positionTitle", { day: date(data.to) })}
            </h2>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              <Figure
                label={t("cash")}
                value={signed(data.cash)}
                icon={Banknote}
                tone="bg-emerald-50 text-emerald-700"
                hint={
                  data.inSettlement
                    ? t("inSettlement", { amount: signed(data.inSettlement) })
                    : undefined
                }
              />
              <Figure
                label={t("receivable")}
                value={signed(data.receivable)}
                icon={HandCoins}
                tone="bg-blue-50 text-blue-600"
              />
              <Figure
                label={t("payable")}
                value={signed(data.payable)}
                icon={Landmark}
                tone="bg-rose-50 text-rose-600"
              />
              <Figure
                label={t("inventory")}
                value={signed(data.inventory)}
                icon={Boxes}
                tone="bg-indigo-50 text-indigo-600"
              />
              <Figure
                label={t("vatDue")}
                value={signed(data.vatDue)}
                icon={Percent}
                tone="bg-orange-50 text-orange-600"
                hint={t("vatDueHint")}
              />
              <Figure
                label={t("totalAssets")}
                value={signed(data.totalAssets)}
                icon={Scale}
                tone="bg-violet-50 text-violet-600"
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  PANEL,
                  "flex items-center gap-3 px-4 py-3.5 text-[13.5px] font-semibold text-[#0b1738] transition hover:border-[#047857]/40 hover:bg-[#f5fbf8]"
                )}
              >
                <link.icon className="size-4.5 text-[#047857]" />
                {link.label}
              </Link>
            ))}
          </section>
          <p className="sr-only">{tCommon("loading")}</p>
        </div>
      )}
    </AccountingPage>
  )
}
