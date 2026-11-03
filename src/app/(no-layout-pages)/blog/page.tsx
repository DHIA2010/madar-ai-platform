import type { Metadata } from "next"

import { BlogIndexPage } from "@/features/marketing-site/blog/blog-index-page"

export const metadata: Metadata = {
  title: { absolute: "مدونة مدار | نصائح في البيع والتسويق والمخزون" },
  description:
    "مقالات عملية للتاجر السعودي في الكاشير والفوترة الإلكترونية والتسويق والإعلانات وإدارة المخزون.",
  alternates: { canonical: "https://madar.my/blog" },
}

export default function Page() {
  return <BlogIndexPage />
}
