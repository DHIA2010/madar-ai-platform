import { cn } from "@/lib/utils"

import { AppStatusBadge } from "@/components/app"

import type { SubscriptionStatus } from "../types"

// Same soft-pastel-pill pattern as HomeDashboard.tsx's CONNECTION_STATUS_META -- AppStatusBadge's
// own 5 generic tones (default/secondary/destructive/outline/ghost) don't give a true
// green/blue/amber/rose palette, so the tone color is supplied via className instead. "none" is a
// customer that has never subscribed to anything.
const STATUS_META: Record<SubscriptionStatus | "none", { label: string; className: string }> = {
  active: { label: "نشط", className: "bg-emerald-50 text-emerald-600" },
  trial: { label: "تجربة مجانية", className: "bg-blue-50 text-blue-600" },
  overdue: { label: "متأخر في الدفع", className: "bg-amber-50 text-amber-600" },
  cancelled: { label: "ملغي", className: "bg-rose-50 text-rose-600" },
  expired: { label: "منتهي", className: "bg-slate-100 text-slate-600" },
  none: { label: "بدون اشتراك", className: "bg-slate-50 text-slate-500" },
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus | "none" }) {
  const meta = STATUS_META[status]
  return <AppStatusBadge status="neutral" label={meta.label} className={cn(meta.className)} />
}
