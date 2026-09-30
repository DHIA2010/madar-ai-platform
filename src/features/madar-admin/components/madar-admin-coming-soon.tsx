import type { LucideIcon } from "lucide-react"

import { AppCard, AppEmpty } from "@/components/app"

export function MadarAdminComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <AppCard className="rounded-2xl border-border/60 py-16 shadow-sm">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon className="size-6" />
      </div>
      <AppEmpty title={title} description={description} />
    </AppCard>
  )
}
