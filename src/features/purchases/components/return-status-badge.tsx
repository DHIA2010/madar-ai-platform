import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { AppStatusBadge } from "@/components/app"

import type { ReturnStatus } from "../types"

// status="neutral" below resolves to the "ghost" badge variant, which bakes in its own
// hover:bg-muted -- harmless for a plain static badge, but kept consistent in case this badge
// ever sits inside a hoverable container again. The hover:bg-*/hover:text-* pair here just
// repeats each status's own resting colors so hovering never visibly darkens it.
const STATUS_CLASS: Record<ReturnStatus, string> = {
  full: "bg-emerald-50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600",
  partial: "bg-amber-50 text-amber-600 hover:bg-amber-50 hover:text-amber-600",
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const t = useTranslations("purchases.returnStatus")
  return <AppStatusBadge status="neutral" label={t(status)} className={cn(STATUS_CLASS[status])} />
}
