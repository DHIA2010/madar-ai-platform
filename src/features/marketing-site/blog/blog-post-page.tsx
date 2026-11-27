import { Fragment } from "react"
import Link from "next/link"
import { ArrowLeft, Clock, Info, Lightbulb } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { MarketingFooter } from "../components/marketing-footer"
import { MarketingHeader } from "../components/marketing-header"
import { MADAR_REGISTER_URL } from "../marketing-constants"
import { BlogCover } from "./blog-cover"
import { BlogCtaLink, BlogLeadForm, BlogTracker } from "./blog-engagement"
import {
  BLOG_CATEGORY_LABEL,
  type BlogBlock,
  type BlogCategory,
  type BlogCtaApp,
  type BlogPost,
  coverVariant,
  formatBlogDate,
  readingLabel,
} from "./posts"

// What each article's buttons say, by the Madar app the article leads to.
const CTA_COPY: Record<BlogCtaApp, { title: string; text: string; button: string }> = {
  pos: {
    title: "جرّب كاشير مدار مجاناً",
    text: "كاشير متوافق مع متطلبات الفوترة الإلكترونية، يطبع ويرسل الفاتورة على واتساب ويشتغل حتى بدون إنترنت.",
    button: "جرّب الكاشير مجاناً",
  },
  ecommerce: {
    title: "اعرف وش يصير في متجرك الحين",
    text: "اربط متجرك على سلة أو زد أو شوبيفاي، وشاهد الزوار المباشرين ومصدر كل طلب في مكان واحد.",
    button: "اربط متجرك مجاناً",
  },
  campaigns: {
    title: "اعرف أي إعلان يجيب لك مبيعات فعلاً",
    text: "جوجل وميتا وسناب شات وتيك توك في لوحة واحدة، مع فحص الحملات وتنبيهات الأخطاء.",
    button: "حلّل إعلاناتك مجاناً",
  },
  invoicing: {
    title: "فواتيرك الضريبية بدون تعب",
    text: "عروض أسعار وفواتير ضريبية متوافقة مع متطلبات الفوترة الإلكترونية، ترسلها لعميلك على واتساب.",
    button: "ابدأ تجربتك المجانية",
  },
  inventory: {
    title: "مخزون كل فرع واضح أمامك",
    text: "مخزون لكل فرع، وتحويل بين الفروع، وجرد بالباركود تظهر فروقاته فوراً.",
    button: "جرّب مدار مجاناً",
  },
  booking: {
    title: "صفحة حجز لمنشأتك اليوم",
    text: "عملاؤك يحجزون الموعد بأنفسهم، ويصلهم تذكير على واتساب، مع بطاقات ولاء وهدايا.",
    button: "جرّب الحجوزات مجاناً",
  },
  loyalty: {
    title: "خلّ عميلك يرجع لك",
    text: "بطاقة ولاء في جوال عميلك تجمع النقاط من الكاشير، وتوصله عروضك بإشعار.",
    button: "جرّب الولاء مجاناً",
  },
  accounting: {
    title: "حساباتك تُسجَّل تلقائياً",
    text: "القيود المحاسبية تُسجَّل من مبيعاتك ومشترياتك ومصروفاتك، والقوائم المالية جاهزة.",
    button: "ابدأ تجربتك المجانية",
  },
  complete: {
    title: "كل تجارتك في مدار واحد",
    text: "الكاشير والمتاجر والإعلانات والحجوزات والمخزون والمحاسبة في نظام واحد.",
    button: "ابدأ تجربتك المجانية",
  },
}

const CATEGORY_APP: Record<BlogCategory, BlogCtaApp> = {
  campaigns: "campaigns",
  invoicing: "invoicing",
  ecommerce: "ecommerce",
  inventory: "inventory",
  pos: "pos",
  booking: "booking",
}

// The sign-up link, tagged so the CRM knows which article (and which button) brought it.
function registerUrl(slug: string, spot: string) {
  const params = new URLSearchParams({
    utm_source: "blog",
    utm_medium: "article",
    utm_campaign: slug,
    utm_content: spot,
  })
  return `${MADAR_REGISTER_URL}?${params.toString()}`
}

// A slim button between paragraphs (top and middle of the article).
function InlineCta({ slug, spot, app }: { slug: string; spot: string; app: BlogCtaApp }) {
  const copy = CTA_COPY[app]
  return (
    <aside className="flex flex-col gap-4 rounded-3xl border border-[#cfe0ff] bg-gradient-to-l from-[#f3f7ff] to-[#effbf9] p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[17.5px] font-extrabold">{copy.title}</p>
        <p className="mt-1 text-[15px] leading-7 text-slate-600">ابدأ بتجربة مجانية.</p>
      </div>
      <BlogCtaLink
        slug={slug}
        spot={spot}
        href={registerUrl(slug, spot)}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#2878ff] px-6 py-3 text-[15.5px] font-extrabold text-white transition-transform hover:-translate-y-0.5"
      >
        {copy.button}
        <ArrowLeft className="size-4" />
      </BlogCtaLink>
    </aside>
  )
}

// The h2 nearest the middle of the article (not the first one): the middle button goes before it.
function middleHeadingIndex(body: BlogBlock[]) {
  const headings = body
    .map((block, index) => (block.type === "h2" ? index : -1))
    .filter((index) => index > 0)
  if (headings.length < 2) return -1
  const middle = body.length / 2
  return headings
    .slice(1)
    .reduce((best, index) => (Math.abs(index - middle) < Math.abs(best - middle) ? index : best))
}

// What Google reads about the article: an Article, and its FAQ when it has one.
function structuredData(post: BlogPost) {
  const url = `https://madar.my/blog/${post.slug}`
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    inLanguage: "ar",
    mainEntityOfPage: url,
    url,
    image: "https://madar.my/images/madar-logo.png",
    keywords: post.keywords?.join("، ") || undefined,
    author: { "@type": "Organization", name: "فريق مدار", url: "https://madar.my" },
    publisher: {
      "@type": "Organization",
      name: "مدار للحلول التجارية",
      logo: { "@type": "ImageObject", url: "https://madar.my/images/madar-logo.png" },
    },
  }
  const faq = post.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }
    : null
  return faq ? [article, faq] : [article]
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "p":
      return <p className="text-[18px] leading-[2.05] text-slate-700">{block.text}</p>
    case "h2":
      return (
        <h2 id={block.id} className="scroll-mt-28 pt-6 text-[27px] leading-snug font-black">
          {block.text}
        </h2>
      )
    case "h3":
      return <h3 className="pt-2 text-[21px] font-extrabold">{block.text}</h3>
    case "ul":
    case "ol": {
      const List = block.type === "ul" ? "ul" : "ol"
      return (
        <List className="space-y-3">
          {block.items.map((item, index) => (
            <li key={item} className="flex gap-3 text-[18px] leading-[1.95] text-slate-700">
              <span
                className={cn(
                  "mt-1.5 flex shrink-0 items-center justify-center font-black",
                  block.type === "ol"
                    ? "size-7 rounded-full bg-[#eef4ff] text-[13px] text-[#2878ff]"
                    : "size-7"
                )}
              >
                {block.type === "ol" ? (
                  index + 1
                ) : (
                  <span className="size-2 rounded-full bg-[#12b5a6]" />
                )}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </List>
      )
    }
    case "callout": {
      const tip = block.tone === "tip"
      const Icon = tip ? Lightbulb : Info
      return (
        <aside
          className={cn(
            "flex gap-4 rounded-3xl border p-6",
            tip ? "border-amber-200 bg-amber-50/70" : "border-[#cfe0ff] bg-[#f3f7ff]"
          )}
        >
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl",
              tip ? "bg-amber-100 text-amber-700" : "bg-[#dbe7ff] text-[#2878ff]"
            )}
          >
            <Icon className="size-5" />
          </span>
          <div>
            <p className="text-[17px] font-extrabold">{block.title}</p>
            <p className="mt-1.5 text-[16.5px] leading-[1.95] text-slate-700">{block.text}</p>
          </div>
        </aside>
      )
    }
    case "formula":
      return (
        <div className="overflow-hidden rounded-3xl bg-[#0b1738] text-white">
          <p className="px-6 pt-5 text-[13px] font-extrabold text-[#5eead4]">{block.label}</p>
          <p className="px-6 pt-2 pb-5 text-[20px] leading-9 font-black">{block.formula}</p>
          <p className="border-t border-white/10 bg-white/5 px-6 py-4 text-[16px] leading-8 text-slate-200">
            {block.example}
          </p>
        </div>
      )
  }
}

export function BlogPostPage({ post, allPosts }: { post: BlogPost; allPosts: BlogPost[] }) {
  const headings = post.body.filter(
    (block): block is Extract<BlogBlock, { type: "h2" }> => block.type === "h2"
  )
  const app = post.ctaApp ?? CATEGORY_APP[post.category]
  const copy = CTA_COPY[app]
  const middle = middleHeadingIndex(post.body)
  // The top button goes after the opening paragraphs.
  const top = Math.min(2, post.body.length - 1)
  // Same section first, then the newest of the rest.
  const related = [...allPosts]
    .filter((other) => other.slug !== post.slug)
    .sort(
      (left, right) =>
        Number(right.category === post.category) - Number(left.category === post.category) ||
        right.publishedAt.localeCompare(left.publishedAt)
    )
    .slice(0, 2)

  return (
    <div lang="ar" dir="rtl" className="min-h-screen bg-white text-[#0b1738] antialiased">
      <script
        type="application/ld+json"
        // Built from the article's own fields; no user input.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(post)).replace(/</g, "\\u003c"),
        }}
      />
      <BlogTracker slug={post.slug} />
      <MarketingHeader />
      <main>
        <header className="bg-[#f7f9fc] pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <nav
              aria-label="مسار التنقل"
              className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold text-slate-500"
            >
              <Link href={ROUTES.blog} className="transition-colors hover:text-[#0b1738]">
                المدونة
              </Link>
              <ArrowLeft className="size-3.5" />
              <Link
                href={ROUTES.blogCategory(post.category)}
                className="text-[#2878ff] transition-colors hover:text-[#1f63d6]"
              >
                {BLOG_CATEGORY_LABEL[post.category]}
              </Link>
            </nav>

            <h1 className="mt-6 text-[32px] leading-[1.35] font-black sm:text-[44px]">
              {post.title}
            </h1>
            <p className="mt-5 text-[18px] leading-9 text-slate-600">{post.excerpt}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14.5px] font-semibold text-slate-500">
              <span className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#12b5a6] to-[#2563eb] text-[12px] font-black text-white">
                  م
                </span>
                فريق مدار
              </span>
              <span className="size-1 rounded-full bg-slate-300" />
              <span>{formatBlogDate(post.publishedAt)}</span>
              <span className="size-1 rounded-full bg-slate-300" />
              <span className="flex items-center gap-1">
                <Clock className="size-4" />
                {readingLabel(post)}
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <BlogCover
            category={post.category}
            variant={coverVariant(allPosts, post)}
            size="hero"
            className="-mt-2 rounded-[32px]"
          />

          <div className="grid gap-12 py-14 lg:grid-cols-[1fr_260px]">
            <article data-blog-article className="mx-auto w-full max-w-[720px] space-y-6">
              {post.body.map((block, index) => (
                <Fragment key={index}>
                  {index === middle ? <InlineCta slug={post.slug} spot="middle" app={app} /> : null}
                  <Block block={block} />
                  {index === top ? <InlineCta slug={post.slug} spot="top" app={app} /> : null}
                </Fragment>
              ))}

              {post.faq?.length ? (
                <section className="!mt-12">
                  <h2 id="faq" className="scroll-mt-28 text-[27px] leading-snug font-black">
                    أسئلة شائعة
                  </h2>
                  <div className="mt-5 divide-y divide-slate-200 rounded-3xl border border-slate-200">
                    {post.faq.map((item) => (
                      <details key={item.question} className="group p-6">
                        <summary className="cursor-pointer list-none text-[17.5px] font-extrabold marker:hidden">
                          {item.question}
                        </summary>
                        <p className="mt-3 text-[16.5px] leading-8 text-slate-700">{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="!mt-14 overflow-hidden rounded-[32px] bg-gradient-to-l from-[#0f766e] via-[#1d4ed8] to-[#0b1738] p-8 text-white sm:p-10">
                <p className="text-[24px] leading-snug font-black">{copy.title}</p>
                <p className="mt-3 text-[16.5px] leading-8 text-slate-200">{copy.text}</p>
                <BlogCtaLink
                  slug={post.slug}
                  spot="end"
                  href={registerUrl(post.slug, "end")}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[16px] font-extrabold text-[#0b1738] transition-transform hover:-translate-y-0.5"
                >
                  {copy.button}
                  <ArrowLeft className="size-4" />
                </BlogCtaLink>
              </div>

              <BlogLeadForm slug={post.slug} title={post.title} />
            </article>

            {headings.length > 0 ? (
              <aside className="hidden lg:block">
                <nav className="sticky top-28 rounded-3xl border border-slate-200/80 p-6">
                  <p className="text-[14px] font-extrabold text-slate-500">في هذا المقال</p>
                  <ol className="mt-4 space-y-3">
                    {headings.map((heading) => (
                      <li key={heading.id}>
                        <a
                          href={`#${heading.id}`}
                          className="block text-[15px] leading-7 font-semibold text-slate-600 transition-colors hover:text-[#2878ff]"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                  <BlogCtaLink
                    slug={post.slug}
                    spot="sidebar"
                    href={registerUrl(post.slug, "sidebar")}
                    className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-[#2878ff] px-4 py-3 text-[14.5px] font-extrabold text-white transition-colors hover:bg-[#1f63d6]"
                  >
                    {copy.button}
                  </BlogCtaLink>
                </nav>
              </aside>
            ) : null}
          </div>
        </div>

        {related.length > 0 ? (
          <section className="border-t border-slate-100 bg-[#f7f9fc] py-16">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <h2 className="text-[26px] font-black">مقالات ذات صلة</h2>
              <div className="mt-8 grid gap-8 md:grid-cols-2">
                {related.map((other) => (
                  <Link
                    key={other.slug}
                    href={ROUTES.blogPost(other.slug)}
                    className="group flex flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white transition-all hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgba(11,23,56,0.35)] sm:flex-row"
                  >
                    <BlogCover
                      category={other.category}
                      variant={coverVariant(allPosts, other)}
                      className="sm:w-56 sm:shrink-0"
                    />
                    <div className="flex flex-col justify-center gap-3 p-6">
                      <span className="text-[12.5px] font-extrabold text-[#2878ff]">
                        {BLOG_CATEGORY_LABEL[other.category]}
                      </span>
                      <h3 className="text-[18px] leading-snug font-extrabold">{other.title}</h3>
                      <span className="text-[13.5px] font-semibold text-slate-500">
                        {formatBlogDate(other.publishedAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <MarketingFooter />
    </div>
  )
}
