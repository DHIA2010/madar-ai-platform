import type { Metadata } from "next"

import { ContactSalesPage } from "@/features/marketing-site/contact-sales-page"

export const metadata: Metadata = {
  title: { absolute: "تحدث مع المبيعات | مدار" },
  description: "اترك بياناتك وسيتواصل معك فريق مبيعات مدار.",
  alternates: { canonical: "https://madar.my/contact-sales" },
}

export default function Page() {
  return <ContactSalesPage />
}
