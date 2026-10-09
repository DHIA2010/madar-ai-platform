import type { LucideIcon } from "lucide-react"
import { Layers, PackageMinus, RotateCcw, SplitSquareHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

import { DEFAULT_PURCHASE_CURRENCY, type PurchaseReturn } from "../types"
import { HEADING, MUTED, PANEL } from "./purchase-field"

const KPI_TONE = {
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
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

// These cards sum across every return, which can carry different suppliers' purchase currencies
// -- with no real exchange-rate/conversion backend, the aggregate is shown in the default
// currency (SAR) rather than attempting cross-currency arithmetic, same convention as
// PurchasesKpiCards.
function formatCurrency(value: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: DEFAULT_PURCHASE_CURRENCY,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${new Intl.NumberFormat("en-US").format(Math.round(value))} ${DEFAULT_PURCHASE_CURRENCY}`
  }
}

// Computed from the currently filtered rows (search/status/supplier/warehouse/date range), not
// the full unfiltered list -- so narrowing the filters updates these totals too, matching how the
// table below it already behaves.
export function ReturnsKpiCards({ returns }: { returns: PurchaseReturn[] }) {
  const totalAmount = returns.reduce((sum, entry) => sum + entry.returnAmount, 0)
  const totalItems = returns.reduce((sum, entry) => sum + entry.returnQty, 0)
  const partialCount = returns.filter((entry) => entry.status === "partial").length

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label="إجمالي مبلغ المرتجعات"
        value={formatCurrency(totalAmount)}
        icon={RotateCcw}
        tone="rose"
      />
      <Card label="عدد المرتجعات" value={String(returns.length)} icon={Layers} tone="violet" />
      <Card label="عناصر مرتجعة" value={String(totalItems)} icon={PackageMinus} tone="blue" />
      <Card
        label="مرتجعات جزئية"
        value={String(partialCount)}
        icon={SplitSquareHorizontal}
        tone="amber"
      />
    </div>
  )
}
