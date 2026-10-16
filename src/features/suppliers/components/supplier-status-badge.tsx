import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { AppStatusBadge } from "@/components/app"

import type { SupplierStatus } from "../types"

const STATUS_CLASS: Record<SupplierStatus, string> = {
  active: "bg-emerald-50 text-emerald-600",
  inactive: "bg-rose-50 text-rose-600",
}

export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  const t = useTranslations("suppliers.status")
  return <AppStatusBadge status="neutral" label={t(status)} className={cn(STATUS_CLASS[status])} />
}
