import Link from "next/link"
import { ArrowLeft, CheckCircle2, ChevronDown, Sparkles } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { BlogShell, PostCard } from "../blog/blog-shared"
import { type BlogPost, coverVariant, postsInCategory } from "../blog/posts"
import {
  AdsMockup,
  DashboardMockup,
  InventoryMockup,
  LiveVisitorsMockup,
  PosMockup,
  ReceiptCard,
  WindowFrame,
} from "../components/mockups"
import { MADAR_REGISTER_URL, MARKETING_SITE_URL } from "../marketing-constants"
import { SOLUTION_PAGES, type SolutionPage } from "./solution-pages"

// One keyword page (madar.my/solutions/<slug>): answers the search in the first lines, shows the
// app, its benefits, how to start, a checklist, FAQ (also as FAQ rich results), related articles
// and the other solutions -- with sign-up buttons tagged so leads are credited to the page.

function registerUrl(slug: string, spot: string) {
  const params = new URLSearchParams({
    utm_source: "madar-site",
    utm_medium: "solution-page",
    utm_campaign: slug,
    utm_content: spot,
  })
  return `${MADAR_REGISTER_URL}?${params.toString()}`
}

const PRIMARY_BUTTON =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-[#2878ff] px-8 py-4 text-base font-bold text-white shadow-[0_14px_34px_rgba(40,120,255,0.38)] transition-all hover:-translate-y-0.5 hover:bg-[#1f63d6]"

function CardsVisual({ card }: { card: NonNullable<SolutionPage["visualCard"]> }) {
  return (
    <WindowFrame className="mx-auto max-w-xl">
      <div className="p-5 sm:p-7">
        <p className="text-[15px] font-extrabold text-[#0b1738]">{card.heading}</p>
        <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {card.rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span className="text-[14px] font-semibold text-slate-700">{row.label}</span>
              <span className="shrink-0 rounded-full bg-[#eef4ff] px-3 py-1 text-[12px] font-extrabold text-[#2878ff]">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </WindowFrame>
  )
}

function Visual({ page }: { page: SolutionPage }) {
  switch (page.visual) {
    case "pos":
      return (
        <div className="relative">
          <PosMockup />
          <ReceiptCard className="absolute -bottom-10 -start-4 hidden rotate-[-4deg] md:block" />
        </div>
      )
    case "invoice":
      return (
        <div className="flex justify-center">
          <ReceiptCard className="w-full max-w-sm" />
        </div>
      )
    case "inventory":
      return <InventoryMockup />
    case "dashboard":
      return <DashboardMockup />
    case "visitors":
      return <LiveVisitorsMockup />
    case "ads":
      return <AdsMockup />
    case "cards":
      return page.visualCard ? <CardsVisual card={page.visualCard} /> : null
  }
}

function structuredData(page: SolutionPage) {
  const url = `${MARKETING_SITE_URL}${ROUTES.solution(page.slug)}`
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `مدار — ${page.keyword}`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url,
      description: page.seoDescription,
      inLanguage: "ar",
      publisher: {
        "@type": "Organization",
        name: "Madar Business Solutions",
        url: MARKETING_SITE_URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "مدار", item: `${MARKETING_SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "الحلول",
          item: `${MARKETING_SITE_URL}${ROUTES.solutions}`,
        },
        { "@type": "ListItem", position: 3, name: page.keyword, item: url },
      ],
    },
  ]
}

export function SolutionPageView({ page, posts }: { page: SolutionPage; posts: BlogPost[] }) {
  const articles = postsInCategory(posts, page.blogCategory).slice(0, 3)
  const others = SOLUTION_PAGES.filter((entry) => entry.slug !== page.slug)

  return (
    <BlogShell>
      <script
        type="application/ld+json"
        // Built from the page's own fields; no user input.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(page)).replace(/</g, "\\u003c"),
        }}
      />

      {/* Hero: the search answered in the first lines. */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-16">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#dff7f3] via-[#e8f0ff] to-transparent opacity-80 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="مسار الصفحة" className="text-[13px] font-semibold text-slate-500">
            <Link href={ROUTES.home} className="hover:text-[#0b1738]">
              مدار
            </Link>
            <span className="mx-2">/</span>
            <Link href={ROUTES.solutions} className="hover:text-[#0b1738]">
              الحلول
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[#0b1738]">{page.keyword}</span>
          </nav>

          <div className="mt-8 grid items-center gap-14 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-4 py-1.5 text-[13px] font-bold text-[#1d4ed8] shadow-sm">
                <Sparkles className="size-4" />
                {page.eyebrow}
              </span>
              <h1 className="mt-5 text-4xl leading-[1.25] font-black tracking-tight sm:text-5xl sm:leading-[1.2]">
                {page.title}{" "}
                <span className="bg-gradient-to-l from-[#12b5a6] via-[#2563eb] to-[#1e3a8a] bg-clip-text text-transparent">
                  {page.titleHighlight}
                </span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-600">{page.intro}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href={registerUrl(page.slug, "hero")} className={PRIMARY_BUTTON}>
                  {page.ctaButton}
                  <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
                </a>
                <Link
                  href={ROUTES.contactSales}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-bold transition-colors hover:bg-slate-50"
                >
                  تحدث مع المبيعات
                </Link>
              </div>
              <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                <CheckCircle2 className="size-4 text-[#12b5a6]" />
                تجربة مجانية · متوافق مع الفوترة الإلكترونية · بالعربي
              </p>
            </div>
            <div className="relative">
              <Visual page={page} />
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-[#f7f9fc] py-20">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-black sm:text-4xl">{page.benefitsTitle}</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {page.benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-[24px] border border-slate-200/80 bg-white p-7 shadow-sm"
              >
                <span className="flex size-11 items-center justify-center rounded-2xl bg-[#e8f8f5] text-[#12b5a6]">
                  <CheckCircle2 className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold">{benefit.title}</h3>
                <p className="mt-2 text-[15px] leading-7 text-slate-600">{benefit.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to start + checklist */}
      <section className="py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-3xl font-black sm:text-4xl">{page.stepsTitle}</h2>
            <ol className="mt-10 space-y-6">
              {page.steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#2878ff] text-lg font-black text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold">{step.title}</h3>
                    <p className="mt-1 text-[15px] leading-7 text-slate-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[28px] border border-slate-200/80 bg-[#f7f9fc] p-8">
            <h2 className="text-2xl font-black">{page.checklistTitle}</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {page.checklist.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[15px] font-semibold text-slate-700"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#12b5a6]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#f7f9fc] py-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-black sm:text-4xl">
            أسئلة شائعة عن {page.keyword}
          </h2>
          <div className="mt-10 space-y-3">
            {page.faq.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-slate-200/80 bg-white p-5 open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-extrabold">
                  {item.question}
                  <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[15px] leading-7 text-slate-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Related articles */}
      {articles.length > 0 ? (
        <section className="py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-3xl font-black">مقالات تساعدك</h2>
              <Link
                href={ROUTES.blogCategory(page.blogCategory)}
                className="text-[15px] font-bold text-[#2878ff] hover:underline"
              >
                كل المقالات
              </Link>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {articles.map((post) => (
                <PostCard key={post.slug} post={post} variant={coverVariant(posts, post)} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Final call to action */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[32px] bg-[#0b1738] px-6 py-14 text-center text-white sm:px-12">
          <h2 className="text-3xl font-black sm:text-4xl">{page.ctaTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-300">{page.ctaText}</p>
          <a href={registerUrl(page.slug, "end")} className={`${PRIMARY_BUTTON} mt-8`}>
            {page.ctaButton}
            <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
          </a>
        </div>
      </section>

      {/* The other solutions (links between the pages help Google and readers) */}
      <section className="border-t border-slate-200 py-14">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-black">حلول أخرى من مدار</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {others.map((entry) => (
              <Link
                key={entry.slug}
                href={ROUTES.solution(entry.slug)}
                className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[14.5px] font-bold transition-colors hover:border-[#2878ff] hover:text-[#2878ff]"
              >
                {entry.keyword}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </BlogShell>
  )
}

export function SolutionsIndexView() {
  return (
    <BlogShell>
      <section className="relative overflow-hidden pt-14 pb-20">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#dff7f3] via-[#e8f0ff] to-transparent opacity-80 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-black sm:text-5xl">حلول مدار لتجارتك</h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              كاشير، فواتير إلكترونية، محاسبة، مخزون، حجوزات، ولاء، متاجر إلكترونية وإعلانات — اختر
              ما تحتاجه، وكلها تعمل معاً في نظام واحد.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUTION_PAGES.map((page) => (
              <Link
                key={page.slug}
                href={ROUTES.solution(page.slug)}
                className="group rounded-[24px] border border-slate-200/80 bg-white p-7 transition-all hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgba(11,23,56,0.35)]"
              >
                <span className="text-[13px] font-extrabold text-[#2878ff]">{page.eyebrow}</span>
                <h2 className="mt-2 text-xl font-extrabold group-hover:text-[#2878ff]">
                  {page.keyword}
                </h2>
                <p className="mt-2 line-clamp-3 text-[15px] leading-7 text-slate-600">
                  {page.seoDescription}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </BlogShell>
  )
}
