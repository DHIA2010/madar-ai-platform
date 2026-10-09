import type { LucideIcon } from "lucide-react"
import { ClipboardList, Clock, RotateCcw, ShoppingBag, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

import type { SupportedOrgCurrency } from "../services"
import { HEADING, MUTED, PANEL } from "./purchase-field"

const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  emerald: "bg-emerald-50 text-emerald-600",
} as const

function Card({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
}) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-[12.5px] font-semibold", MUTED)}>{label}</p>
        <span
          className={cn("flex size-9 items-center justify-center rounded-[10px]", KPI_TONE[tone])}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("mt-3 text-[22px] font-extrabold", HEADING)}>{value}</p>
    </div>
  )
}

// totalPurchases/returnedAmount arrive already converted into the org's default currency (every
// purchase can carry a different supplier currency -- see currency-conversion.service.ts), so this
// just formats in that one currency rather than attempting cross-currency arithmetic itself.
function formatCurrency(value: number, currency: SupportedOrgCurrency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${new Intl.NumberFormat("en-US").format(Math.round(value))} ${currency}`
  }
}

// Total Revenue mirrors the reference's own KPI (a separate "Returned Items" row covers the
// returns side) -- it's total purchase value net of this module's own returns, not a real
// revenue/sales figure, since no sales ledger exists for this frontend-only module to draw from.
export function PurchasesKpiCards({
  totalPurchases,
  totalOrders,
  pendingOrders,
  returnedItems,
  returnedAmount,
  currency,
}: {
  totalPurchases: number
  totalOrders: number
  pendingOrders: number
  returnedItems: number
  returnedAmount: number
  currency: SupportedOrgCurrency
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card
        label="إجمالي المشتريات"
        value={formatCurrency(totalPurchases, currency)}
        icon={ShoppingBag}
        tone="blue"
      />
      <Card label="إجمالي الطلبات" value={String(totalOrders)} icon={ClipboardList} tone="violet" />
      <Card label="طلبات معلّقة" value={String(pendingOrders)} icon={Clock} tone="amber" />
      <Card label="عناصر مرتجعة" value={String(returnedItems)} icon={RotateCcw} tone="rose" />
      <Card
        label="إجمالي صافي المشتريات"
        value={formatCurrency(totalPurchases - returnedAmount, currency)}
        icon={Wallet}
        tone="emerald"
      />
    </div>
  )
}
