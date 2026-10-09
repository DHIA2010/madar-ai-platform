import type { LucideIcon } from "lucide-react"
import { ShoppingBag, UserCheck, Users, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

import type { Supplier } from "../types"
import { HEADING, MUTED, PANEL } from "./supplier-field"

const KPI_TONE = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
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

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value)}`
}

// Computed from the currently filtered rows (search/status), not the full unfiltered list -- so
// narrowing the filters updates these totals too, matching how the table below it already
// behaves. totalPurchases/totalBalance are summed from the same per-supplier Maps the page already
// builds (see suppliers-list-page.tsx), not recomputed here.
export function SuppliersKpiCards({
  suppliers,
  totalPurchases,
  totalBalance,
}: {
  suppliers: Supplier[]
  totalPurchases: number
  totalBalance: number
}) {
  const activeCount = suppliers.filter((supplier) => supplier.status === "active").length

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="عدد الموردين" value={String(suppliers.length)} icon={Users} tone="blue" />
      <Card label="موردون نشطون" value={String(activeCount)} icon={UserCheck} tone="emerald" />
      <Card
        label="إجمالي المشتريات"
        value={formatCurrency(totalPurchases)}
        icon={ShoppingBag}
        tone="violet"
      />
      <Card
        label="إجمالي الأرصدة"
        value={formatCurrency(totalBalance)}
        icon={Wallet}
        tone="amber"
      />
    </div>
  )
}
