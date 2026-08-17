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

  const title = "MADAR | AI-Powered Marketing Intelligence for E-commerce"
  const description =
    "MADAR helps e-commerce businesses connect marketing data, analyze advertising performance, monitor key KPIs, and turn data into actionable insights."

  return {
    title,
    description,
    alternates: { canonical: "https://madar.my/" },
    openGraph: {
      type: "website",
      url: "https://madar.my/",
      siteName: "MADAR",
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
