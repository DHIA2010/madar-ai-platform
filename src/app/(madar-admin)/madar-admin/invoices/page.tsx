import { FileText } from "lucide-react"

import { MadarAdminComingSoon } from "@/features/madar-admin"

export default function Page() {
  return (
    <MadarAdminComingSoon
      icon={FileText}
      title="الفواتير"
      description="فواتير جميع عملاء مدار قريباً."
    />
  )
}
