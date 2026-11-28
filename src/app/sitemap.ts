import type { MetadataRoute } from "next"

import { loadBlogPosts } from "@/features/marketing-site/blog/blog-data"
import { BLOG_CATEGORIES } from "@/features/marketing-site/blog/posts"
import { SOLUTION_PAGES } from "@/features/marketing-site/solutions/solution-pages"

// Refreshed every few minutes, so a newly published article is listed for Google right away.
export const revalidate = 300

// The site serves every page with a trailing slash; list the final addresses (no redirects).
const withSlash = (url: string) => (url.endsWith("/") ? url : `${url}/`)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()
  const posts = await loadBlogPosts()

  const entries: MetadataRoute.Sitemap = [
    {
      url: "https://www.madar.my/",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.madar.my/solutions",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...SOLUTION_PAGES.map((page) => ({
      url: `https://www.madar.my/solutions/${page.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    {
      url: "https://www.madar.my/blog",
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...BLOG_CATEGORIES.map((category) => ({
      url: `https://www.madar.my/blog/category/${category.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...posts.map((post) => ({
      url: `https://www.madar.my/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: "https://www.madar.my/contact-sales",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://www.madar.my/privacy",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://www.madar.my/terms",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://www.madar.my/privacy/en",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: "https://www.madar.my/terms/en",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ]
  return entries.map((entry) => ({ ...entry, url: withSlash(entry.url) }))
}
