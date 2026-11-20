import { notFound } from "next/navigation"

import AdsReportSettings from "../../ads-report-settings"
import DailyReportSettings from "../../daily-report-settings"

export const dynamic = "force-dynamic"

// Each report template's own screen.
export default async function Page({
  params,
}: {
  params: Promise<{ category: string; template: string }>
}) {
  const { category, template } = await params
  if (category === "pos" && template === "daily-report") return <DailyReportSettings />
  if (category === "advertising" && template === "ads-report") return <AdsReportSettings />
  notFound()
}
