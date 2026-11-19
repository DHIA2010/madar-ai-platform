import type { Metadata } from "next"

import { ContactSalesPage } from "@/features/marketing-site/contact-sales-page"

export const metadata: Metadata = {
  title: { absolute: "تحدث مع المبيعات | مدار" },
  description: "اترك بياناتك وسيتواصل معك فريق مبيعات مدار.",
  alternates: { canonical: "https://madar.my/contact-sales" },
}

// ?lp= names the ad the visitor came from; the page opens with that ad's headline.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lp?: string | string[] }>
}) {
  const { lp } = await searchParams
  return <ContactSalesPage topic={typeof lp === "string" ? lp : null} />
}
