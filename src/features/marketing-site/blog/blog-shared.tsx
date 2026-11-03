import Link from "next/link"
import { Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { MarketingFooter } from "../components/marketing-footer"
import { MarketingHeader } from "../components/marketing-header"
import { BlogCover, CATEGORY_ICON } from "./blog-cover"
import {
  BLOG_CATEGORIES,
  BLOG_CATEGORY_LABEL,
  type BlogCategory,
  type BlogPost,
  coverVariant,
  formatBlogDate,
  readingLabel,
} from "./posts"

export function BlogShell({ children }: { children: React.ReactNode }) {
  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-white text-[#0b1738] antialiased">
      <MarketingHeader />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}

export function PostMeta({ post }: { post: BlogPost }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-semibold text-slate-500">
      <span>{formatBlogDate(post.publishedAt)}</span>
      <span className="size-1 rounded-full bg-slate-300" />
      <span className="flex items-center gap-1">
        <Clock className="size-3.5" />
        {readingLabel(post)}
      </span>
    </div>
  )
}

export function PostCard({
  post,
  showCategory = false,
}: {
  post: BlogPost
  showCategory?: boolean
}) {
  return (
    <Link
      href={ROUTES.blogPost(post.slug)}
      className="group flex flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white transition-all hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgba(11,23,56,0.35)]"
    >
      <BlogCover category={post.category} variant={coverVariant(post)} className="aspect-[2/1]" />
      <div className="flex flex-1 flex-col gap-3.5 p-7">
        {showCategory ? (
          <span className="w-fit rounded-full bg-[#eef4ff] px-3 py-1 text-[12.5px] font-extrabold text-[#2878ff]">
            {BLOG_CATEGORY_LABEL[post.category]}
          </span>
        ) : null}
        <h3 className="text-[20px] leading-snug font-extrabold transition-colors group-hover:text-[#2878ff]">
          {post.title}
        </h3>
        <p className="line-clamp-3 flex-1 text-[15px] leading-7 text-slate-600">{post.excerpt}</p>
        <PostMeta post={post} />
      </div>
    </Link>
  )
}

// One tab per section, plus "all"; the current one is highlighted.
export function CategoryTabs({ active }: { active: BlogCategory | "all" }) {
  const tab = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[14.5px] font-bold whitespace-nowrap transition-colors",
      isActive
        ? "border-[#0b1738] bg-[#0b1738] text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-[#0b1738]"
    )
  return (
    <nav aria-label="أقسام المدونة" className="flex flex-wrap justify-center gap-2">
      <Link href={ROUTES.blog} className={tab(active === "all")}>
        كل المقالات
      </Link>
      {BLOG_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICON[category.slug]
        return (
          <Link
            key={category.slug}
            href={ROUTES.blogCategory(category.slug)}
            className={tab(active === category.slug)}
          >
            <Icon className="size-4" />
            {category.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function BlogHero({
  eyebrow,
  title,
  description,
  active,
}: {
  eyebrow: string
  title: string
  description: string
  active: BlogCategory | "all"
}) {
  return (
    <section className="relative overflow-hidden border-b border-slate-100 bg-[#f7f9fc] pt-16 pb-12 sm:pt-20">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#dff7f3] via-[#e8f0ff] to-transparent opacity-80 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
        <p className="text-sm font-extrabold text-[#2878ff]">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
        <div className="mt-10">
          <CategoryTabs active={active} />
        </div>
      </div>
    </section>
  )
}
