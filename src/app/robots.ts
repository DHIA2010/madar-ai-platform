import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/settings",
        "/administration",
        "/campaigns",
        "/customers",
        "/integrations",
        "/reports",
        "/stores",
        "/products",
        "/channels",
        "/ai",
        "/account",
        "/workspace",
      ],
    },
    sitemap: "https://madar.my/sitemap.xml",
  }
}
