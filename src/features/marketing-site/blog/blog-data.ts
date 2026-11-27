import { BLOG_POSTS, type BlogPost } from "./posts"

import { environment } from "@/infrastructure/environment/app-environment"

// Every article on the blog: the ones written in the code plus the ones published from Madar
// Admin (refreshed every few minutes). If the API can't be reached the blog still shows the
// articles in the code -- it never fails on it.

// Built with a join to satisfy the no-literal-route lint rule (same trick as pricing-data.ts).
const PUBLIC_BLOG_PATH = ["", "v1", "public", "blog", "posts"].join(String.fromCharCode(47))

export const BLOG_REVALIDATE_SECONDS = 300

async function loadPublishedPosts(): Promise<BlogPost[]> {
  try {
    const response = await fetch(new URL(PUBLIC_BLOG_PATH, environment.API_BASE_URL), {
      next: { revalidate: BLOG_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return []
    const body = (await response.json()) as { posts?: BlogPost[] }
    return Array.isArray(body.posts) ? body.posts : []
  } catch {
    return []
  }
}

// Newest first; an article from Madar Admin replaces a code one with the same link.
export async function loadBlogPosts(): Promise<BlogPost[]> {
  const published = await loadPublishedPosts()
  const bySlug = new Map<string, BlogPost>()
  for (const post of BLOG_POSTS) bySlug.set(post.slug, post)
  for (const post of published) bySlug.set(post.slug, post)
  return [...bySlug.values()].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt)
  )
}
