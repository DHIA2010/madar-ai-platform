"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { presetRange, today, useFormatters, useLoader } from "../hooks/use-accounting"
import { accountingService } from "../services/accounting.service"
import type { PartyType } from "../types/accounting.types"
import { EntryDialog } from "./entry-dialog"
import { AccountingPage, Empty, ExportButton, LoadFailed, Loading, RangeControl } from "./shell"
import { AMOUNT, FIELD, HEADING, MUTED, PANEL, TD, TH } from "./styles"

// One account's statement: what it opened with, every movement, and the balance after each.
export function LedgerPage() {
  const t = useTranslations("accounting.ledger")
  const tSource = useTranslations("accounting.sources")
  const { money, signed, date, accountName } = useFormatters()
  const linked = useSearchParams().get("account")
  const [accountId, setAccountId] = useState<string | null>(linked)
  const [range, setRange] = useState(() => presetRange("thisMonth"))
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  const accounts = useLoader(() => accountingService.listAccounts(), "accounts")
  const selected = accountId ?? accounts.data?.[0]?.id ?? null
  const ledger = useLoader(
    () => (selected ? accountingService.ledger(selected, range) : Promise.resolve(null)),
    `${selected}|${range.from}|${range.to}`
  )
  const data = ledger.data

  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <>
          <select
            aria-label={t("account")}
            value={selected ?? ""}
            onChange={(event) => setAccountId(event.target.value)}
            className={cn(FIELD, "w-auto max-w-[260px] min-w-[200px]")}
          >
            {(accounts.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {accountName(account)}
              </option>
            ))}
          </select>
          <RangeControl range={range} onChange={setRange} />
          {data ? (
            <ExportButton
              filename={`ledger-${data.account.code}-${range.from}-${range.to}`}
              rows={() => [
                [
                  t("date"),
                  t("reference"),
                  t("description"),
                  t("debit"),
                  t("credit"),
                  t("balance"),
                ],
                ["", "", t("openingBalance"), "", "", String(data.openingBalance)],
                ...data.lines.map((line) => [
                  line.date,
                  line.reference,
                  line.description,
                  String(line.debit),
                  String(line.credit),
                  String(line.balance),
                ]),
              ]}
            />
          ) : null}
        </>
      }
    >
      {ledger.failed || accounts.failed ? (
        <LoadFailed onRetry={ledger.reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div
          className={cn("flex flex-col gap-4 transition-opacity", ledger.loading && "opacity-60")}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [t("openingBalance"), signed(data.openingBalance)],
              [t("totalDebit"), money(data.totalDebit)],
              [t("totalCredit"), money(data.totalCredit)],
              [t("closingBalance"), signed(data.closingBalance)],
            ].map(([label, value]) => (
              <div key={label} className={cn(PANEL, "px-4 py-3.5")}>
                <p className={cn("text-[12.5px]", MUTED)}>{label}</p>
                <p className={cn("mt-1 text-[18px] font-extrabold", HEADING, AMOUNT)}>{value}</p>
              </div>
            ))}
          </div>
          <div className={cn(PANEL, "overflow-x-auto")}>
            <table className="w-full min-w-[46rem]">
              <thead>
                <tr>
                  <th className={TH}>{t("date")}</th>
                  <th className={TH}>{t("reference")}</th>
                  <th className={TH}>{t("description")}</th>
                  <th className={cn(TH, "text-end")}>{t("debit")}</th>
                  <th className={cn(TH, "text-end")}>{t("credit")}</th>
                  <th className={cn(TH, "text-end")}>{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#eef1f6] bg-[#fafbfd]">
                  <td className={TD} colSpan={5}>
                    <span className="font-semibold">{t("openingBalance")}</span>
                  </td>
                  <td className={cn(TD, AMOUNT, "text-end font-semibold")}>
                    {signed(data.openingBalance)}
                  </td>
                </tr>
                {data.lines.map((line) => (
                  <tr
                    key={line.id}
                    className="cursor-pointer border-t border-[#eef1f6] hover:bg-[#f5fbf8]"
                    onClick={() => setOpenEntry(line.entryId)}
                  >
                    <td className={cn(TD, "whitespace-nowrap")}>{date(line.date)}</td>
                    <td className={cn(TD, AMOUNT, "font-semibold")}>{line.reference}</td>
                    <td className={TD}>
                      {line.description}
                      <span className={cn("ms-2 text-[11.5px]", MUTED)}>
                        {tSource(line.sourceType)}
                      </span>
                    </td>
                    <td className={cn(TD, AMOUNT, "text-end")}>
                      {line.debit ? money(line.debit) : "—"}
                    </td>
                    <td className={cn(TD, AMOUNT, "text-end")}>
                      {line.credit ? money(line.credit) : "—"}
                    </td>
                    <td className={cn(TD, AMOUNT, "text-end font-semibold")}>
                      {signed(line.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.lines.length === 0 ? <Empty>{t("empty")}</Empty> : null}
            {data.truncated ? (
              <p className={cn("border-t border-[#eef1f6] px-4 py-3 text-[12px]", MUTED)}>
                {t("truncated")}
              </p>
            ) : null}
          </div>
        </div>
      )}
      <EntryDialog
        entryId={openEntry}
        onClose={() => setOpenEntry(null)}
        onChanged={ledger.reload}
      />
    </AccountingPage>
  )
}

// What customers owe and what is owed to suppliers, by name, plus the VAT position.
export function BalancesPage() {
  const t = useTranslations("accounting.balances")
  const { money, signed } = useFormatters()
  const [type, setType] = useState<PartyType>("customer")
  const [asOf, setAsOf] = useState(today)
  const [vatRange, setVatRange] = useState(() => presetRange("thisQuarter"))
  const parties = useLoader(() => accountingService.partyBalances(type, asOf), `${type}|${asOf}`)
  const vat = useLoader(
    () => accountingService.vat(vatRange),
    `vat|${vatRange.from}|${vatRange.to}`
  )
  const data = parties.data

  return (
    <AccountingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        <>
          <div className="flex rounded-[12px] border border-[#e1e7f0] bg-white p-1">
            {(["customer", "supplier"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={cn(
                  "rounded-[9px] px-4 py-2 text-[13px] font-semibold transition",
                  type === option
                    ? "bg-[#047857] text-white"
                    : "text-[#6b7b96] hover:text-[#0b1738]"
                )}
              >
                {t(option)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-[#6b7b96]">
            {t("asOf")}
            <input
              type="date"
              value={asOf}
              onChange={(event) => event.target.value && setAsOf(event.target.value)}
              className={cn(FIELD, "w-auto")}
            />
          </label>
          {data ? (
            <ExportButton
              filename={`${type}-balances-${asOf}`}
              rows={() => [
                [t("name"), t("debit"), t("credit"), t("balance")],
                ...data.items.map((item) => [
                  item.name,
                  String(item.debit),
                  String(item.credit),
                  String(item.balance),
                ]),
              ]}
            />
          ) : null}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {parties.failed ? (
            <LoadFailed onRetry={parties.reload} />
          ) : !data ? (
            <Loading />
          ) : (
            <div
              className={cn(
                PANEL,
                "overflow-x-auto transition-opacity",
                parties.loading && "opacity-60"
              )}
            >
              <table className="w-full min-w-[32rem]">
                <thead>
                  <tr>
                    <th className={TH}>{t("name")}</th>
                    <th className={cn(TH, "text-end")}>{t("debit")}</th>
                    <th className={cn(TH, "text-end")}>{t("credit")}</th>
                    <th className={cn(TH, "text-end")}>
                      {type === "customer" ? t("owesUs") : t("weOwe")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.partyId} className="border-t border-[#eef1f6]">
                      <td className={cn(TD, "font-semibold")}>{item.name || "—"}</td>
                      <td className={cn(TD, AMOUNT, "text-end")}>{money(item.debit)}</td>
                      <td className={cn(TD, AMOUNT, "text-end")}>{money(item.credit)}</td>
                      <td
                        className={cn(
                          TD,
                          AMOUNT,
                          "text-end font-bold",
                          item.balance < 0 && "text-[#047857]"
                        )}
                      >
                        {signed(item.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#d9e0ec] bg-[#f7f9fc]">
                    <td className={cn(TD, "font-extrabold")} colSpan={3}>
                      {t("total")}
                    </td>
                    <td className={cn(TD, AMOUNT, "text-end font-extrabold")}>
                      {signed(data.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {data.items.length === 0 ? <Empty>{t("empty")}</Empty> : null}
              <p className={cn("border-t border-[#eef1f6] px-4 py-3 text-[12px]", MUTED)}>
                {type === "customer" ? t("customerNote") : t("supplierNote")}
              </p>
            </div>
          )}
        </div>

        <div className={cn(PANEL, "self-start p-5")}>
          <h2 className={cn("text-[15px] font-extrabold", HEADING)}>{t("vatTitle")}</h2>
          <div className="mt-3">
            <RangeControl range={vatRange} onChange={setVatRange} />
          </div>
          {vat.data ? (
            <dl className="mt-4 space-y-3 text-[13.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className={MUTED}>{t("vatOutput")}</dt>
                <dd className={cn("font-semibold", AMOUNT)}>{money(vat.data.output)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={MUTED}>{t("vatInput")}</dt>
                <dd className={cn("font-semibold", AMOUNT)}>{money(vat.data.input)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[#e4e9f2] pt-3">
                <dt className="font-bold">{vat.data.due >= 0 ? t("vatDue") : t("vatRefund")}</dt>
                <dd className={cn("text-[17px] font-extrabold", HEADING, AMOUNT)}>
                  {money(Math.abs(vat.data.due))}
                </dd>
              </div>
            </dl>
          ) : vat.failed ? (
            <p className={cn("mt-4 text-[13px]", MUTED)}>{t("vatFailed")}</p>
          ) : (
            <Loading />
          )}
          <p className={cn("mt-4 text-[12px] leading-5", MUTED)}>{t("vatNote")}</p>
        </div>
      </div>
    </AccountingPage>
  )
}
