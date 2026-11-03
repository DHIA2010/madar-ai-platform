import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BlogPostPage } from "@/features/marketing-site/blog/blog-post-page"
import { BLOG_POSTS, findBlogPost } from "@/features/marketing-site/blog/posts"

// Only the posts in posts.ts exist; any other slug is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const post = findBlogPost((await params).slug)
  if (!post) return {}
  const url = `https://madar.my/blog/${post.slug}`
  return {
    title: { absolute: `${post.title} | مدونة مدار` },
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.excerpt,
      siteName: "مدار",
      locale: "ar_SA",
      publishedTime: post.publishedAt,
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const post = findBlogPost((await params).slug)
  if (!post) notFound()
  return <BlogPostPage post={post} />
}
