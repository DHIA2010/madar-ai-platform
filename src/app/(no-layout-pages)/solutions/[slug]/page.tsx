import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ROUTES } from "@/constants/routes"
import { loadBlogPosts } from "@/features/marketing-site/blog/blog-data"
import { MARKETING_SITE_URL } from "@/features/marketing-site/marketing-constants"
import { SolutionPageView } from "@/features/marketing-site/solutions/solution-page"
import {
  findSolutionPage,
  SOLUTION_PAGES,
} from "@/features/marketing-site/solutions/solution-pages"

// The keyword pages, built ahead; refreshed every few minutes so new related articles show up.
export const dynamicParams = false
export const revalidate = 300

export function generateStaticParams() {
  return SOLUTION_PAGES.map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const page = findSolutionPage((await params).slug)
  if (!page) return {}
  const url = `${MARKETING_SITE_URL}${ROUTES.solution(page.slug)}`
  return {
    title: { absolute: page.seoTitle },
    description: page.seoDescription,
    keywords: [page.keyword, ...page.related],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: page.seoTitle,
      description: page.seoDescription,
      siteName: "مدار",
      locale: "ar_SA",
      images: [{ url: "/images/madar-logo.png", width: 778, height: 325, alt: page.keyword }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.seoTitle,
      description: page.seoDescription,
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const page = findSolutionPage((await params).slug)
  if (!page) notFound()
  return <SolutionPageView page={page} posts={await loadBlogPosts()} />
}
