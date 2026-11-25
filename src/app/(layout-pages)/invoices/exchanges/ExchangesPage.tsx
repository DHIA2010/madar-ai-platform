"use client"

// الاستبدالات -- every cashier exchange (PosInvoicesService.createExchange) and what it means for
// the business: how many, what came back and went out, the money that actually changed hands,
// why customers exchange, which products and sizes they swap, and who made them. Each exchange
// is a credit note plus a new invoice, so sales, VAT and stock are already right everywhere
// else; this page explains them for the owner.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { useLocale } from "next-intl"
import { ArrowLeft, ArrowLeftRight, Info, Loader2 } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import { useWorkspace } from "@/features/workspace"
import {
  type Exchange,
  type ExchangeSettlement,
  posInvoicesService,
  type ReturnReason,
} from "@/features/pos/services/pos-invoices.service"
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"

import {
  AppDateRangeFilter,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS = "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e]"

const REASON_LABEL: Record<ReturnReason, { ar: string; en: string }> = {
  size: { ar: "المقاس", en: "Size" },
  color: { ar: "اللون", en: "Color" },
  defect: { ar: "عيب في المنتج", en: "Defect" },
  other: { ar: "سبب آخر", en: "Other" },
}
const SETTLEMENT_LABEL: Record<ExchangeSettlement, { ar: string; en: string }> = {
  even: { ar: "نفس السعر", en: "Same price" },
  collected: { ar: "دفع العميل الفرق", en: "Customer paid more" },
  refunded: { ar: "أُرجع الفرق للعميل", en: "Refunded the rest" },
  balance: { ar: "أُضيف لرصيد العميل", en: "Kept on balance" },
}

function defaultRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from, to }
}

export default function ExchangesPage() {
  const locale = useLocale() as Locale
  const ar = locale === "ar"
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const { availableWorkspaces } = useWorkspace()
  const money = (value: number) => {
    const amount = new Intl.NumberFormat(ar ? "ar-SA-u-nu-latn" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    return ar ? `${amount} ر.س` : `SAR ${amount}`
  }
  const count = (value: number) => value.toLocaleString(ar ? "ar-SA-u-nu-latn" : "en-US")

  const [exchanges, setExchanges] = useState<Exchange[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [workspaceFilter, setWorkspaceFilter] = useState("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange)
  const [methodNames, setMethodNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    void posPaymentMethodsService
      .list()
      .then((methods) => setMethodNames(new Map(methods.map((m) => [m.code, m.name]))))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    setExchanges(null)
    setFailed(false)
    posInvoicesService
      .listExchanges({
        workspaceId: workspaceFilter === "all" ? undefined : workspaceFilter,
        from: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
        to: dateRange?.to ? `${format(dateRange.to, "yyyy-MM-dd")}T23:59:59` : undefined,
      })
      .then((items) => {
        if (active) setExchanges(items)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [workspaceFilter, dateRange])

  const insights = useMemo(() => {
    const list = exchanges ?? []
    const sum = (pick: (exchange: Exchange) => number) =>
      Math.round(list.reduce((total, exchange) => total + pick(exchange), 0) * 100) / 100
    const collected = sum((e) => (e.settlement === "collected" ? e.differenceAmount : 0))
    const refunded = sum((e) => (e.settlement === "refunded" ? -e.differenceAmount : 0))
    const balance = sum((e) => (e.settlement === "balance" ? -e.differenceAmount : 0))

    const reasons = new Map<ReturnReason, number>()
    const settlements = new Map<ExchangeSettlement, number>()
    const returned = new Map<string, number>()
    const swaps = new Map<string, number>()
    const cashiers = new Map<string, { count: number; value: number }>()
    let damagedUnits = 0
    for (const exchange of list) {
      reasons.set(exchange.reason, (reasons.get(exchange.reason) ?? 0) + 1)
      settlements.set(exchange.settlement, (settlements.get(exchange.settlement) ?? 0) + 1)
      for (const line of exchange.returnedItems) {
        returned.set(line.productName, (returned.get(line.productName) ?? 0) + line.quantity)
        if (line.restocked === false) damagedUnits += line.quantity
        for (const next of exchange.newItems) {
          const key = `${line.productName}\u0000${next.productName}`
          swaps.set(key, (swaps.get(key) ?? 0) + 1)
        }
      }
      const who = exchange.cashierName ?? tx("غير معروف", "Unknown")
      const entry = cashiers.get(who) ?? { count: 0, value: 0 }
      cashiers.set(who, { count: entry.count + 1, value: entry.value + exchange.returnedAmount })
    }
    const top = <T,>(map: Map<T, number>, limit = 6) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    return {
      total: list.length,
      returnedValue: sum((e) => e.returnedAmount),
      newValue: sum((e) => e.newAmount),
      net: sum((e) => e.differenceAmount),
      collected,
      refunded,
      balance,
      damagedUnits,
      reasons: top(reasons, 4),
      settlements: top(settlements, 4),
      returned: top(returned),
      swaps: top(swaps),
      cashiers: [...cashiers.entries()].sort((a, b) => b[1].count - a[1].count),
    }
    // tx only switches on the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchanges, ar])

  const Bar = ({ label, value, of }: { label: string; value: number; of: number }) => (
    <div>
      <div className="mb-1 flex justify-between text-[12.5px]">
        <span className={HEADING}>{label}</span>
        <span className={MUTED}>
          {count(value)} · {of > 0 ? Math.round((value / of) * 100) : 0}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[#f1f4f9]">
        <div
          className="h-1.5 rounded-full bg-[#2563eb]"
          style={{ width: `${of > 0 ? Math.max(4, (value / of) * 100) : 0}%` }}
        />
      </div>
    </div>
  )

  const tiles: Array<{ label: string; value: string; hint: string; tone?: string }> = [
    {
      label: tx("عدد الاستبدالات", "Exchanges"),
      value: count(insights.total),
      hint: tx("في الفترة المختارة", "In the selected period"),
    },
    {
      label: tx("قيمة ما رجع", "Value brought back"),
      value: money(insights.returnedValue),
      hint: tx("بالسعر الذي دفعه العميل", "At the price paid"),
    },
    {
      label: tx("قيمة ما خرج", "Value of new items"),
      value: money(insights.newValue),
      hint: tx("المنتجات الجديدة", "The new items"),
    },
    {
      label: tx("صافي أثر الاستبدال على المبيعات", "Net effect on sales"),
      value: money(insights.net),
      hint: tx("الجديد ناقص المرتجع", "New minus returned"),
      tone: insights.net >= 0 ? "text-[#16a34a]" : "text-[#dc2626]",
    },
    {
      label: tx("حصّلت من العملاء", "Collected from customers"),
      value: money(insights.collected),
      hint: tx("فرق دفعه العملاء", "Differences customers paid"),
    },
    {
      label: tx("أرجعت للعملاء", "Given back"),
      value: money(insights.refunded),
      hint: tx("نقدًا أو بطاقة", "Cash or card"),
    },
    {
      label: tx("أُضيف لرصيد العملاء", "Kept on customer balances"),
      value: money(insights.balance),
      hint: tx("يُستخدم في شراء لاحق", "For a later purchase"),
    },
    {
      label: tx("قطع تالفة", "Damaged units"),
      value: count(insights.damagedUnits),
      hint: tx("لم ترجع للمخزون", "Not put back in stock"),
    },
  ]

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={ROUTES.invoices}
            className={cn("mb-1 inline-flex items-center gap-1 text-[12.5px] font-semibold", MUTED)}
          >
            <ArrowLeft className={cn("size-3.5", ar && "rotate-180")} />
            {tx("الفواتير", "Invoices")}
          </Link>
          <h1 className={cn("flex items-center gap-2 text-[22px] font-extrabold", HEADING)}>
            <ArrowLeftRight className="size-5" />
            {tx("الاستبدالات", "Exchanges")}
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            {tx(
              "كل استبدال من الكاشير: ماذا رجع، ماذا خرج، والفرق الذي دفعه العميل أو استرده.",
              "Every exchange at the till: what came back, what went out, and the difference."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
          <div className="w-full sm:w-[170px]">
            <AppSelect value={workspaceFilter} onValueChange={setWorkspaceFilter}>
              <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="all">{tx("كل الفروع", "All branches")}</AppSelectItem>
                {availableWorkspaces.map((workspace) => (
                  <AppSelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>
      </div>

      <div className={cn(PANEL, "flex gap-3 p-4")}>
        <Info className="mt-0.5 size-4 shrink-0 text-[#2563eb]" />
        <div className={cn("text-[12.5px] leading-6", HEADING)}>
          <p className="font-bold">{tx("كيف تُقرأ هذه الأرقام؟", "How to read these numbers")}</p>
          <p className={MUTED}>
            {tx(
              "كل استبدال يُسجَّل كوثيقتين: إشعار دائن للمنتج الراجع (مرتبط بالفاتورة الأصلية) وفاتورة جديدة للمنتج الجديد، وكلاهما يُرسل لهيئة الزكاة. قيمة المرتجع تدفع الفاتورة الجديدة، فلا تتحرك إلا قيمة الفرق: تدخل الدرج إن دفعها العميل، وتخرج منه إن أرجعتها له. لذلك صافي المبيعات والضريبة والمخزون صحيحة في كل التقارير، ولا يُحسب البيع مرتين.",
              "Each exchange is saved as two documents: a credit note for what came back (linked to the original invoice) and a new invoice for what went out, both reported to ZATCA. The returned value pays the new invoice, so only the difference moves: into the drawer when the customer pays it, out when it is given back. Net sales, VAT and stock are therefore right in every report, and nothing is counted twice."
            )}
          </p>
        </div>
      </div>

      {failed ? (
        <p className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
          {tx("تعذر تحميل الاستبدالات.", "Couldn't load exchanges.")}
        </p>
      ) : exchanges === null ? (
        <div className="flex justify-center p-16 text-[#8098b4]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className={cn(PANEL, "p-4")}>
                <p className={cn("text-[12px] font-semibold", MUTED)}>{tile.label}</p>
                <p className={cn("mt-1 text-[19px] font-black", tile.tone ?? HEADING)}>
                  {tile.value}
                </p>
                <p className={cn("mt-0.5 text-[11px]", MUTED)}>{tile.hint}</p>
              </div>
            ))}
          </div>

          {exchanges.length === 0 ? (
            <p className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
              {tx(
                "لا توجد استبدالات في هذه الفترة. يتم الاستبدال من الكاشير: إرجاع ← استبدال بمنتج آخر.",
                "No exchanges in this period. Make one at the till: Return → Exchange for another item."
              )}
            </p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className={cn(PANEL, "p-4")}>
                  <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>
                    {tx("لماذا يستبدل العملاء؟", "Why customers exchange")}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {insights.reasons.map(([reason, value]) => (
                      <Bar
                        key={reason}
                        label={REASON_LABEL[reason][ar ? "ar" : "en"]}
                        value={value}
                        of={insights.total}
                      />
                    ))}
                  </div>
                </div>
                <div className={cn(PANEL, "p-4")}>
                  <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>
                    {tx("كيف سُوّي الفرق؟", "How the difference was settled")}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {insights.settlements.map(([settlement, value]) => (
                      <Bar
                        key={settlement}
                        label={SETTLEMENT_LABEL[settlement][ar ? "ar" : "en"]}
                        value={value}
                        of={insights.total}
                      />
                    ))}
                  </div>
                </div>
                <div className={cn(PANEL, "p-4")}>
                  <h3 className={cn("text-[13.5px] font-bold", HEADING)}>
                    {tx("أكثر المنتجات استبدالًا", "Most exchanged products")}
                  </h3>
                  <p className={cn("mb-3 text-[11.5px]", MUTED)}>
                    {tx(
                      "عدد القطع التي رجعت. منتج يتكرر هنا قد يحتاج مراجعة مقاساته أو وصفه.",
                      "Units brought back. A product that keeps showing up may need its sizing or description checked."
                    )}
                  </p>
                  <div className="flex flex-col gap-3">
                    {insights.returned.map(([name, value]) => (
                      <Bar
                        key={name}
                        label={name}
                        value={value}
                        of={insights.returned[0]?.[1] ?? 0}
                      />
                    ))}
                  </div>
                </div>
                <div className={cn(PANEL, "p-4")}>
                  <h3 className={cn("text-[13.5px] font-bold", HEADING)}>
                    {tx("من ← إلى", "From → to")}
                  </h3>
                  <p className={cn("mb-3 text-[11.5px]", MUTED)}>
                    {tx(
                      "ما الذي يستبدله العملاء بماذا. مفيد للطلب من الموردين (مثلًا: تكرار M ← L يعني اطلب L أكثر).",
                      "What customers swap for what. Useful for buying (e.g. many M → L means order more L)."
                    )}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {insights.swaps.map(([key, value]) => {
                      const [from, to] = key.split("\u0000")
                      return (
                        <li
                          key={key}
                          className="flex items-center justify-between gap-2 rounded-[10px] bg-[#f7f9fd] px-3 py-2 text-[12.5px]"
                        >
                          <span className={cn("min-w-0 truncate", HEADING)}>
                            {from} <span className={MUTED}>←</span> {to}
                          </span>
                          <span className="shrink-0 font-bold text-[#2563eb]">×{count(value)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>

              <div className={cn(PANEL, "p-4")}>
                <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>
                  {tx("حسب الكاشير", "By cashier")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {insights.cashiers.map(([name, entry]) => (
                    <div key={name} className="rounded-[12px] bg-[#f7f9fd] px-3 py-2 text-[12.5px]">
                      <span className={cn("font-bold", HEADING)}>{name}</span>
                      <span className={cn("ms-2", MUTED)}>
                        {count(entry.count)} {tx("استبدال", "exchanges")} · {money(entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={cn(PANEL, "overflow-x-auto")}>
                <table className="w-full min-w-[920px] text-right text-[12.5px]">
                  <thead>
                    <tr className={cn("border-b border-[#eef2f8] text-[11.5px]", MUTED)}>
                      <th className="px-3 py-3 font-semibold">{tx("التاريخ", "Date")}</th>
                      <th className="px-3 py-3 font-semibold">
                        {tx("الفاتورة الأصلية", "Original")}
                      </th>
                      <th className="px-3 py-3 font-semibold">{tx("رجع", "Back")}</th>
                      <th className="px-3 py-3 font-semibold">{tx("خرج", "Out")}</th>
                      <th className="px-3 py-3 font-semibold">{tx("الفرق", "Difference")}</th>
                      <th className="px-3 py-3 font-semibold">{tx("التسوية", "Settled")}</th>
                      <th className="px-3 py-3 font-semibold">{tx("السبب", "Reason")}</th>
                      <th className="px-3 py-3 font-semibold">{tx("الوثائق", "Documents")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchanges.map((exchange) => (
                      <tr key={exchange.id} className="border-b border-[#f3f5f9] align-top">
                        <td className={cn("px-3 py-3 whitespace-nowrap", HEADING)}>
                          {new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(exchange.createdAt))}
                          <div className={cn("text-[11px]", MUTED)}>
                            {exchange.cashierName ?? ""}
                          </div>
                        </td>
                        <td className={cn("px-3 py-3 font-semibold", HEADING)}>
                          {exchange.originalInvoiceNumber}
                        </td>
                        <td className={cn("px-3 py-3", HEADING)}>
                          {exchange.returnedItems.map((line, index) => (
                            <div key={index}>
                              {line.productName} ×{count(line.quantity)}
                              {line.restocked === false ? (
                                <span className="ms-1 text-[10.5px] font-bold text-[#dc2626]">
                                  {tx("تالف", "damaged")}
                                </span>
                              ) : null}
                            </div>
                          ))}
                          <div className={cn("text-[11px]", MUTED)}>
                            {money(exchange.returnedAmount)}
                          </div>
                        </td>
                        <td className={cn("px-3 py-3", HEADING)}>
                          {exchange.newItems.map((line, index) => (
                            <div key={index}>
                              {line.productName} ×{count(line.quantity)}
                            </div>
                          ))}
                          <div className={cn("text-[11px]", MUTED)}>
                            {money(exchange.newAmount)}
                          </div>
                        </td>
                        <td
                          className={cn(
                            "px-3 py-3 font-bold whitespace-nowrap",
                            exchange.differenceAmount > 0
                              ? "text-[#16a34a]"
                              : exchange.differenceAmount < 0
                                ? "text-[#dc2626]"
                                : HEADING
                          )}
                        >
                          {exchange.differenceAmount > 0 ? "+" : ""}
                          {money(exchange.differenceAmount)}
                        </td>
                        <td className={cn("px-3 py-3", HEADING)}>
                          {SETTLEMENT_LABEL[exchange.settlement][ar ? "ar" : "en"]}
                          {exchange.refundPaymentMethodCode ? (
                            <div className={cn("text-[11px]", MUTED)}>
                              {methodNames.get(exchange.refundPaymentMethodCode) ??
                                exchange.refundPaymentMethodCode}
                            </div>
                          ) : null}
                        </td>
                        <td className={cn("px-3 py-3", HEADING)}>
                          {REASON_LABEL[exchange.reason][ar ? "ar" : "en"]}
                        </td>
                        <td className={cn("px-3 py-3 text-[11.5px] whitespace-nowrap", MUTED)}>
                          <div>
                            {tx("إشعار دائن", "Credit note")} {exchange.returnNumber}
                          </div>
                          <div>
                            {tx("فاتورة", "Invoice")} {exchange.newInvoiceNumber}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
