import { Flag } from "lucide-react"

import { MadarAdminComingSoon } from "@/features/madar-admin"

export default function Page() {
  return (
    <MadarAdminComingSoon
      icon={Flag}
      title="Feature Flags"
      description="التحكم بميزات المنصة قيد التجربة قريباً."
    />
  )
}
