import type { Metadata } from "next"

import { ROUTES } from "@/constants/routes"
import { MARKETING_SITE_URL } from "@/features/marketing-site/marketing-constants"
import { SolutionsIndexView } from "@/features/marketing-site/solutions/solution-page"

export const metadata: Metadata = {
  title: { absolute: "حلول مدار: كاشير وفواتير ومحاسبة ومخزون وحجوزات | مدار" },
  description:
    "حلول مدار للمنشآت في السعودية: برنامج كاشير، فاتورة إلكترونية، برنامج محاسبة، مخزون، حجوزات، ولاء، ربط سلة وزد، وتحليل الحملات الإعلانية في نظام واحد.",
  alternates: { canonical: `${MARKETING_SITE_URL}${ROUTES.solutions}/` },
}

export default function Page() {
  return <SolutionsIndexView />
}
