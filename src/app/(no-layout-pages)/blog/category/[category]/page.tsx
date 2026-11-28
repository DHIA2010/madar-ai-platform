import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BlogCategoryPage } from "@/features/marketing-site/blog/blog-category-page"
import { loadBlogPosts } from "@/features/marketing-site/blog/blog-data"
import { BLOG_CATEGORIES, findBlogCategory } from "@/features/marketing-site/blog/posts"

// Only the sections in posts.ts exist; any other one is a 404.
export const dynamicParams = false
// Articles published from Madar Admin show up within a few minutes.
export const revalidate = 300

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((category) => ({ category: category.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const category = findBlogCategory((await params).category)
  if (!category) return {}
  return {
    title: { absolute: `${category.label} | مدونة مدار` },
    description: category.description,
    alternates: { canonical: `https://www.madar.my/blog/category/${category.slug}/` },
  }
}

export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const category = findBlogCategory((await params).category)
  if (!category) notFound()
  return <BlogCategoryPage category={category} allPosts={await loadBlogPosts()} />
}
