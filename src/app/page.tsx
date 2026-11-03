import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { ROUTES } from "@/constants/routes"
import { MarketingHomePage } from "@/features/marketing-site/marketing-home-page"
import { isMarketingHostname } from "@/features/marketing-site/marketing-constants"

async function isMarketingHost() {
  const headersList = await headers()
  return isMarketingHostname(headersList.get("host") ?? "")
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isMarketingHost())) {
    return {}
  }

  const title = "مدار | كل تجارتك في مدار واحد — كاشير ومتاجر وإعلانات ومخزون"
  const description =
    "مدار منصة سعودية تجمع الكاشير المتوافق مع الفوترة الإلكترونية، وتحليلات متاجر سلة وزد وشوبيفاي، والحملات الإعلانية، والمشتريات، والمخزون، والتقارير، ومساعدًا ذكيًا في نظام واحد."

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "https://madar.my/" },
    openGraph: {
      type: "website",
      url: "https://madar.my/",
      siteName: "مدار",
      locale: "ar_SA",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function Home() {
  if (await isMarketingHost()) {
    return <MarketingHomePage />
  }

  redirect(ROUTES.dashboard)
}
