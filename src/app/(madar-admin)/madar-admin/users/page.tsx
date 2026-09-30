import { UserCog } from "lucide-react"

import { MadarAdminComingSoon } from "@/features/madar-admin"

export default function Page() {
  return (
    <MadarAdminComingSoon
      icon={UserCog}
      title="المستخدمون"
      description="إدارة مستخدمي فريق مدار الداخلي قريباً."
    />
  )
}
