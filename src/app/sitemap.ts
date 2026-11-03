import type { MetadataRoute } from "next"

import { BLOG_CATEGORIES, BLOG_POSTS } from "@/features/marketing-site/blog/posts"

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    {
      url: "https://madar.my/",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://madar.my/blog",
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...BLOG_CATEGORIES.map((category) => ({
      url: `https://madar.my/blog/category/${category.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...BLOG_POSTS.map((post) => ({
      url: `https://madar.my/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    {
      url: "https://madar.my/contact-sales",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: "https://madar.my/privacy",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://madar.my/terms",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://madar.my/privacy/en",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: "https://madar.my/terms/en",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ]
}
