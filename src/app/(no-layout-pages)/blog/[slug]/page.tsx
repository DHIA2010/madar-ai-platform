import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadBlogPosts } from "@/features/marketing-site/blog/blog-data"
import { BlogPostPage } from "@/features/marketing-site/blog/blog-post-page"
import { BLOG_POSTS, findBlogPost } from "@/features/marketing-site/blog/posts"

// The articles in the code are built ahead; ones published from Madar Admin are built on their
// first visit and refreshed every few minutes. Any other link is a 404.
export const dynamicParams = true
export const revalidate = 300

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const post = findBlogPost(await loadBlogPosts(), (await params).slug)
  if (!post) return {}
  const url = `https://www.madar.my/blog/${post.slug}/`
  const title = post.seoTitle || post.title
  const description = post.seoDescription || post.excerpt
  return {
    title: { absolute: `${title} | مدونة مدار` },
    description,
    keywords: post.keywords?.length ? post.keywords : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "مدار",
      locale: "ar_SA",
      publishedTime: post.publishedAt,
      images: [{ url: "/images/madar-logo.png", width: 778, height: 325, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const posts = await loadBlogPosts()
  const post = findBlogPost(posts, (await params).slug)
  if (!post) notFound()
  return <BlogPostPage post={post} allPosts={posts} />
}
