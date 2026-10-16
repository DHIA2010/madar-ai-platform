import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { AppStatusBadge } from "@/components/app"

import type { PurchasePaymentStatus } from "../types"

// status="neutral" below resolves to the "ghost" badge variant, which bakes in its own
// hover:bg-muted -- harmless for a plain static badge, but visible now that this badge sits
// inside a clickable dropdown trigger. The hover:bg-*/hover:text-* pair here just repeats each
// status's own resting colors so hovering never visibly darkens it.
const STATUS_CLASS: Record<PurchasePaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600",
  partial: "bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600",
  pending: "bg-amber-50 text-amber-600 hover:bg-amber-50 hover:text-amber-600",
  overdue: "bg-rose-50 text-rose-600 hover:bg-rose-50 hover:text-rose-600",
}

export function PurchasePaymentStatusBadge({ status }: { status: PurchasePaymentStatus }) {
  const t = useTranslations("purchases.paymentStatus")
  return <AppStatusBadge status="neutral" label={t(status)} className={cn(STATUS_CLASS[status])} />
}
