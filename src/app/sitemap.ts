import type { MetadataRoute } from "next"

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
  ]
}
