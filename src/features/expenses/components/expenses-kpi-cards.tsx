import type { LucideIcon } from "lucide-react"
import { ArrowDown, ArrowUp, Receipt, Tags, TrendingUp, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

import { HEADING, MUTED, PANEL } from "./expense-field"

const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
} as const

function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} ر.س`
}

function Card({
  label,
  value,
  icon: Icon,
  tone,
  trailing,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: keyof typeof KPI_TONE
  trailing?: React.ReactNode
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
      <div className="mt-3 flex items-baseline gap-2">
        <p className={cn("text-[22px] font-extrabold", HEADING)}>{value}</p>
        {trailing}
      </div>
    </div>
  )
}

export function ExpensesKpiCards({
  totalAmount,
  expenseCount,
  monthOverMonthDelta,
  categoryCount,
}: {
  totalAmount: number
  expenseCount: number
  monthOverMonthDelta: number | null
  categoryCount: number
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label="إجمالي المصروفات"
        value={formatCurrency(totalAmount)}
        icon={Wallet}
        tone="blue"
        trailing={
          monthOverMonthDelta !== null ? (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[11.5px] font-bold",
                monthOverMonthDelta >= 0 ? "text-[#dc2626]" : "text-[#16a34a]"
              )}
            >
              {monthOverMonthDelta >= 0 ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )}
              {Math.abs(Math.round(monthOverMonthDelta))}%
            </span>
          ) : null
        }
      />
      <Card label="عدد المصروفات" value={String(expenseCount)} icon={Receipt} tone="violet" />
      <Card label="عدد الفئات" value={String(categoryCount)} icon={Tags} tone="amber" />
      <Card
        label="متوسط المصروف"
        value={formatCurrency(expenseCount > 0 ? totalAmount / expenseCount : 0)}
        icon={TrendingUp}
        tone="emerald"
      />
    </div>
  )
}
