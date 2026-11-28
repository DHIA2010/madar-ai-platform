import type { Metadata } from "next"

import { loadBlogPosts } from "@/features/marketing-site/blog/blog-data"
import { BlogIndexPage } from "@/features/marketing-site/blog/blog-index-page"

// Articles published from Madar Admin show up within a few minutes.
export const revalidate = 300

export const metadata: Metadata = {
  title: { absolute: "مدونة مدار | نصائح في البيع والتسويق والمخزون" },
  description:
    "مقالات عملية للتاجر السعودي في الكاشير والفوترة الإلكترونية والتسويق والإعلانات وإدارة المخزون.",
  alternates: { canonical: "https://www.madar.my/blog/" },
}

export default async function Page() {
  return <BlogIndexPage allPosts={await loadBlogPosts()} />
}
