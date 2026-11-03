import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { CATEGORY_ICON } from "./blog-cover"
import { BlogHero, BlogShell, PostCard } from "./blog-shared"
import { BLOG_CATEGORIES, postsInCategory } from "./posts"

// How many posts each section shows on the blog home; the rest are on the category page.
const PER_SECTION = 3

// "مقالان" / "٣ مقالات" -- the right Arabic form for each count.
function articleCount(count: number) {
  if (count === 1) return "مقال واحد"
  if (count === 2) return "مقالان"
  if (count <= 10) return `${count} مقالات`
  return `${count} مقالًا`
}

export function BlogIndexPage() {
  return (
    <BlogShell>
      <BlogHero
        eyebrow="المدونة"
        title="مدونة مدار"
        description="أفكار ونصائح عملية في البيع والتسويق والمخزون والفوترة، مقسّمة حسب ما يهمك."
        active="all"
      />

      <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {BLOG_CATEGORIES.map((category) => {
          const posts = postsInCategory(category.slug)
          if (posts.length === 0) return null
          const Icon = CATEGORY_ICON[category.slug]
          return (
            <section key={category.slug} id={category.slug} className="scroll-mt-28">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 pb-6">
                <div className="flex items-start gap-4">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#12b5a6] to-[#2563eb] text-white shadow-[0_14px_30px_-12px_rgba(37,99,235,0.6)]">
                    <Icon className="size-7" />
                  </span>
                  <div>
                    <h2 className="flex flex-wrap items-center gap-3 text-[26px] font-black sm:text-[30px]">
                      {category.label}
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[13px] font-extrabold text-slate-500">
                        {articleCount(posts.length)}
                      </span>
                    </h2>
                    <p className="mt-1.5 max-w-xl text-[15.5px] leading-7 text-slate-600">
                      {category.description}
                    </p>
                  </div>
                </div>
                <Link
                  href={ROUTES.blogCategory(category.slug)}
                  className="group inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-[14.5px] font-extrabold text-[#0b1738] transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  عرض الكل
                  <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
                </Link>
              </div>

              <div
                className={cn(
                  "mt-8 grid gap-8 md:grid-cols-2",
                  posts.length >= PER_SECTION && "lg:grid-cols-3"
                )}
              >
                {posts.slice(0, PER_SECTION).map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </BlogShell>
  )
}
