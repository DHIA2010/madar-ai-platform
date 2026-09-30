import { Wallet } from "lucide-react"

import { MadarAdminComingSoon } from "@/features/madar-admin"

export default function Page() {
  return (
    <MadarAdminComingSoon
      icon={Wallet}
      title="المدفوعات"
      description="سجل مدفوعات جميع عملاء مدار قريباً."
    />
  )
}
