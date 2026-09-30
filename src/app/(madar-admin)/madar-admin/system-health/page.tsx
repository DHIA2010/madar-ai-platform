import { HeartPulse } from "lucide-react"

import { MadarAdminComingSoon } from "@/features/madar-admin"

export default function Page() {
  return (
    <MadarAdminComingSoon
      icon={HeartPulse}
      title="System Health"
      description="حالة أنظمة مدار وخدماتها قريباً."
    />
  )
}
