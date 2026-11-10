import { redirect } from "next/navigation"

import { ROUTES } from "@/constants/routes"

// The daily report moved under التقارير المجدولة (Scheduled reports) -> POS.
export default function Page() {
  redirect(ROUTES.settingsDailyReport)
}
