import { ShoppingBag } from "lucide-react"

import { MadarAdminComingSoon } from "@/features/madar-admin"

export default function Page() {
  return (
    <MadarAdminComingSoon
      icon={ShoppingBag}
      title="المتاجر"
      description="عرض وإدارة جميع متاجر عملاء مدار قريباً."
    />
  )
}
