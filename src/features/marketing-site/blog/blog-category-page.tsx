import { cn } from "@/lib/utils"

import { BlogHero, BlogShell, PostCard } from "./blog-shared"
import { type BlogCategoryInfo, postsInCategory } from "./posts"

// Every article in one section of the blog.
export function BlogCategoryPage({ category }: { category: BlogCategoryInfo }) {
  const posts = postsInCategory(category.slug)
  return (
    <BlogShell>
      <BlogHero
        eyebrow="المدونة"
        title={category.label}
        description={category.description}
        active={category.slug}
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {posts.length === 0 ? (
          <p className="py-16 text-center text-lg text-slate-500">
            لا توجد مقالات في هذا القسم بعد.
          </p>
        ) : (
          <div className={cn("grid gap-8 md:grid-cols-2", posts.length >= 3 && "lg:grid-cols-3")}>
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </BlogShell>
  )
}
