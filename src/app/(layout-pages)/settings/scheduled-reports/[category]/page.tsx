import { notFound } from "next/navigation"

import { isReportCategory } from "../catalog"
import { ScheduledReportsCategory } from "../scheduled-reports-category"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!isReportCategory(category)) notFound()
  return <ScheduledReportsCategory category={category} />
}
