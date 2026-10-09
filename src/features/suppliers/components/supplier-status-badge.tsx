import { cn } from "@/lib/utils"

import { AppStatusBadge } from "@/components/app"

import type { SupplierStatus } from "../types"

const STATUS_META: Record<SupplierStatus, { label: string; className: string }> = {
  active: { label: "نشط", className: "bg-emerald-50 text-emerald-600" },
  inactive: { label: "غير نشط", className: "bg-rose-50 text-rose-600" },
}

export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  const meta = STATUS_META[status]
  return <AppStatusBadge status="neutral" label={meta.label} className={cn(meta.className)} />
}
