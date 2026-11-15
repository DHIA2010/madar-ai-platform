"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { presetRange, today, useFormatters, useLoader } from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import type { Account, StatementSection } from "../types/accounting.types"
import {
  AccountingPage,
  DateField,
  Empty,
  ExportButton,
  LoadFailed,
  Loading,
  RangeControl,
} from "./shell"
import { ACCOUNT_CODE, AMOUNT, HEADING, MUTED, PANEL, TD, TH } from "./styles"

// ---- Trial balance ----

export function TrialBalancePage() {
  const t = useTranslations("accounting.trialBalance")
  const { money, accountName } = useFormatters()
  const [range, setRange] = useState(() => presetRange("thisMonth"))
  const { data, loading, failed, reload } = useLoader(
    () => accountingService.trialBalance(range),
    `${range.from}|${range.to}`
  )
  const columns = [
    "openingDebit",
    "openingCredit",
    "debit",
    "credit",
    "closingDebit",
    "closingCredit",
  ] as const
  const cell = (value: number) => (value ? money(value) : "—")

  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <>
          <RangeControl range={range} onChange={setRange} />
          {data ? (
            <ExportButton
              filename={`trial-balance-${range.from}-${range.to}`}
              rows={() => [
                [t("code"), t("account"), ...columns.map((column) => t(column))],
                ...data.rows.map((row) => [
                  row.account.code,
                  accountName(row.account),
                  ...columns.map((column) => String(row[column])),
                ]),
                ["", t("total"), ...columns.map((column) => String(data.totals[column]))],
              ]}
            />
          ) : null}
        </>
      }
    >
      {failed ? (
        <LoadFailed onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={cn(PANEL, "overflow-x-auto transition-opacity", loading && "opacity-60")}>
          <table className="w-full min-w-[56rem]">
            <thead>
              <tr>
                <th className={TH} rowSpan={2}>
                  {t("code")}
                </th>
                <th className={TH} rowSpan={2}>
                  {t("account")}
                </th>
                <th className={cn(TH, "text-center")} colSpan={2}>
                  {t("opening")}
                </th>
                <th className={cn(TH, "text-center")} colSpan={2}>
                  {t("movement")}
                </th>
                <th className={cn(TH, "text-center")} colSpan={2}>
                  {t("closing")}
                </th>
              </tr>
              <tr>
                {columns.map((column) => (
                  <th key={column} className={cn(TH, "text-end")}>
                    {t(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.account.id} className="border-t border-[#eef1f6] hover:bg-[#fafbfd]">
                  <td className={cn(TD, MUTED, AMOUNT)}>{row.account.code}</td>
                  <td className={TD}>
                    <Link
                      href={ROUTES.accountingLedgerFor(row.account.id)}
                      className="font-semibold hover:text-[#047857] hover:underline"
                    >
                      {accountName(row.account)}
                    </Link>
                  </td>
                  {columns.map((column) => (
                    <td key={column} className={cn(TD, AMOUNT, "text-end")}>
                      {cell(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#d9e0ec] bg-[#f7f9fc]">
                <td className={TD} />
                <td className={cn(TD, "font-extrabold")}>{t("total")}</td>
                {columns.map((column) => (
                  <td key={column} className={cn(TD, AMOUNT, "text-end font-extrabold")}>
                    {money(data.totals[column])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
          {data.rows.length === 0 ? <Empty>{t("empty")}</Empty> : null}
        </div>
      )}
    </AccountingPage>
  )
}

// ---- The two statements share one layout: sections of accounts, then totals ----

function SectionRows({
  title,
  section,
  totalLabel,
}: {
  title: string
  section: StatementSection
  totalLabel: string
}) {
  const { signed, accountName } = useFormatters()
  return (
    <Fragment>
      <tr className="bg-[#f7f9fc]">
        <td className={cn(TD, "font-extrabold")} colSpan={2}>
          {title}
        </td>
      </tr>
      {section.lines.map((line) => (
        <tr key={line.account.id} className="border-t border-[#eef1f6]">
          <td className={cn(TD, "ps-8")}>
            <Link
              href={ROUTES.accountingLedgerFor(line.account.id)}
              className="hover:text-[#047857] hover:underline"
            >
              <span className={ACCOUNT_CODE}>{line.account.code}</span>
              {accountName(line.account)}
            </Link>
          </td>
          <td className={cn(TD, AMOUNT, "text-end")}>{signed(line.amount)}</td>
        </tr>
      ))}
      <tr className="border-t border-[#d9e0ec]">
        <td className={cn(TD, "font-bold")}>{totalLabel}</td>
        <td className={cn(TD, AMOUNT, "text-end font-bold")}>{signed(section.total)}</td>
      </tr>
    </Fragment>
  )
}

function ResultRow({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  const { signed } = useFormatters()
  return (
    <tr className={cn("border-t-2 border-[#d9e0ec]", strong ? "bg-[#ecfdf5]" : "bg-[#fafbfd]")}>
      <td className={cn(TD, "font-extrabold", strong && "text-[15px]")}>{label}</td>
      <td
        className={cn(
          TD,
          AMOUNT,
          "text-end font-extrabold",
          strong && "text-[15px]",
          amount < 0 && "text-[#dc2626]"
        )}
      >
        {signed(amount)}
      </td>
    </tr>
  )
}

const sectionCsv = (
  title: string,
  section: StatementSection,
  name: (account: Account) => string
) => [[title, ""], ...section.lines.map((line) => [name(line.account), String(line.amount)])]

export function IncomeStatementPage() {
  const t = useTranslations("accounting.incomeStatement")
  const { accountName } = useFormatters()
  const [range, setRange] = useState(() => presetRange("thisMonth"))
  const { data, loading, failed, reload } = useLoader(
    () => accountingService.incomeStatement(range),
    `${range.from}|${range.to}`
  )
  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <>
          <RangeControl range={range} onChange={setRange} />
          {data ? (
            <ExportButton
              filename={`income-statement-${range.from}-${range.to}`}
              rows={() => [
                ...sectionCsv(t("revenue"), data.revenue, accountName),
                ...sectionCsv(t("costOfSales"), data.costOfSales, accountName),
                [t("grossProfit"), String(data.grossProfit)],
                ...sectionCsv(t("operatingExpenses"), data.operatingExpenses, accountName),
                ...sectionCsv(t("otherIncome"), data.otherIncome, accountName),
                [t("netProfit"), String(data.netProfit)],
              ]}
            />
          ) : null}
        </>
      }
    >
      {failed ? (
        <LoadFailed onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div
          className={cn(
            PANEL,
            "mx-auto w-full max-w-3xl overflow-hidden transition-opacity",
            loading && "opacity-60"
          )}
        >
          <table className="w-full">
            <tbody>
              <SectionRows
                title={t("revenue")}
                section={data.revenue}
                totalLabel={t("totalRevenue")}
              />
              <SectionRows
                title={t("costOfSales")}
                section={data.costOfSales}
                totalLabel={t("totalCostOfSales")}
              />
              <ResultRow label={t("grossProfit")} amount={data.grossProfit} />
              <SectionRows
                title={t("operatingExpenses")}
                section={data.operatingExpenses}
                totalLabel={t("totalOperatingExpenses")}
              />
              {data.otherIncome.lines.length > 0 ? (
                <SectionRows
                  title={t("otherIncome")}
                  section={data.otherIncome}
                  totalLabel={t("totalOtherIncome")}
                />
              ) : null}
              <ResultRow label={t("netProfit")} amount={data.netProfit} strong />
            </tbody>
          </table>
        </div>
      )}
    </AccountingPage>
  )
}

export function BalanceSheetPage() {
  const t = useTranslations("accounting.balanceSheet")
  const { accountName, signed } = useFormatters()
  const [asOf, setAsOf] = useState(today)
  const { data, loading, failed, reload } = useLoader(
    () => accountingService.balanceSheet(asOf),
    asOf
  )
  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <>
          <div className="flex items-center gap-2 text-[13px] text-[#6b7b96]">
            {t("asOf")}
            <DateField
              ariaLabel={t("asOf")}
              value={asOf}
              onChange={setAsOf}
              className="w-[172px]"
            />
          </div>
          {data ? (
            <ExportButton
              filename={`balance-sheet-${asOf}`}
              rows={() => [
                ...sectionCsv(t("currentAssets"), data.currentAssets, accountName),
                ...sectionCsv(t("fixedAssets"), data.fixedAssets, accountName),
                [t("totalAssets"), String(data.totalAssets)],
                ...sectionCsv(t("currentLiabilities"), data.currentLiabilities, accountName),
                ...sectionCsv(t("longTermLiabilities"), data.longTermLiabilities, accountName),
                [t("totalLiabilities"), String(data.totalLiabilities)],
                ...sectionCsv(t("equity"), data.equity, accountName),
                [t("currentEarnings"), String(data.currentEarnings)],
                [t("totalEquity"), String(data.totalEquity)],
                [t("totalLiabilitiesAndEquity"), String(data.totalLiabilitiesAndEquity)],
              ]}
            />
          ) : null}
        </>
      }
    >
      {failed ? (
        <LoadFailed onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div
          className={cn("grid gap-4 transition-opacity lg:grid-cols-2", loading && "opacity-60")}
        >
          <div className={cn(PANEL, "overflow-hidden self-start")}>
            <h2 className={cn("px-4 py-3 text-[15px] font-extrabold", HEADING)}>{t("assets")}</h2>
            <table className="w-full">
              <tbody>
                <SectionRows
                  title={t("currentAssets")}
                  section={data.currentAssets}
                  totalLabel={t("totalCurrentAssets")}
                />
                {data.fixedAssets.lines.length > 0 ? (
                  <SectionRows
                    title={t("fixedAssets")}
                    section={data.fixedAssets}
                    totalLabel={t("totalFixedAssets")}
                  />
                ) : null}
                <ResultRow label={t("totalAssets")} amount={data.totalAssets} strong />
              </tbody>
            </table>
          </div>
          <div className={cn(PANEL, "overflow-hidden self-start")}>
            <h2 className={cn("px-4 py-3 text-[15px] font-extrabold", HEADING)}>
              {t("liabilitiesAndEquity")}
            </h2>
            <table className="w-full">
              <tbody>
                <SectionRows
                  title={t("currentLiabilities")}
                  section={data.currentLiabilities}
                  totalLabel={t("totalCurrentLiabilities")}
                />
                {data.longTermLiabilities.lines.length > 0 ? (
                  <SectionRows
                    title={t("longTermLiabilities")}
                    section={data.longTermLiabilities}
                    totalLabel={t("totalLongTermLiabilities")}
                  />
                ) : null}
                <ResultRow label={t("totalLiabilities")} amount={data.totalLiabilities} />
                <SectionRows
                  title={t("equity")}
                  section={data.equity}
                  totalLabel={t("totalPaidInEquity")}
                />
                <tr className="border-t border-[#eef1f6]">
                  <td className={cn(TD, "ps-8")}>{t("currentEarnings")}</td>
                  <td className={cn(TD, AMOUNT, "text-end")}>{signed(data.currentEarnings)}</td>
                </tr>
                <ResultRow label={t("totalEquity")} amount={data.totalEquity} />
                <ResultRow
                  label={t("totalLiabilitiesAndEquity")}
                  amount={data.totalLiabilitiesAndEquity}
                  strong
                />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AccountingPage>
  )
}
