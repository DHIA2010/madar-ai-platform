import { notFound } from "next/navigation"

import DailyReportSettings from "../../daily-report-settings"

export const dynamic = "force-dynamic"

// Each report template's own screen -- POS's daily report is the only one so far.
export default async function Page({
  params,
}: {
  params: Promise<{ category: string; template: string }>
}) {
  const { category, template } = await params
  if (category === "pos" && template === "daily-report") return <DailyReportSettings />
  notFound()
}
