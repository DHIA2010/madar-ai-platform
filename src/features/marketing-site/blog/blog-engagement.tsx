"use client"

import { type FormEvent, useEffect, useState } from "react"
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"

import { readAttribution } from "@/lib/attribution"
import { pushDataLayerEvent } from "@/lib/data-layer"
import { cn } from "@/lib/utils"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// What readers do on an article -- views, how far they read, which buttons they tap -- sent to
// Madar's own blog stats (Madar Admin → المدونة → الأداء), plus the article's lead form.

const EVENTS_PATH = ["", "v1", "public", "blog", "events"].join(String.fromCharCode(47))
const SALES_LEADS_PATH = ["", "v1", "public", "sales-leads"].join(String.fromCharCode(47))
const VISITOR_KEY = "madar_blog_visitor"

function visitorId(): string | null {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
      window.localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

// Where this visit came from, in a few words the stats can group by.
function trafficSource(): string {
  const tagged = new URLSearchParams(window.location.search).get("utm_source")
  if (tagged) return tagged.toLowerCase().slice(0, 32)
  let host = ""
  try {
    host = document.referrer ? new URL(document.referrer).hostname : ""
  } catch {
    host = ""
  }
  if (!host || host.endsWith("madar.my")) return "direct"
  const known: Array<[RegExp, string]> = [
    [/google\./, "google"],
    [/bing\.com/, "bing"],
    [/snapchat\.com/, "snapchat"],
    [/instagram\.com/, "instagram"],
    [/facebook\.com|fb\.com/, "facebook"],
    [/tiktok\.com/, "tiktok"],
    [/(^|\.)(x|twitter)\.com|t\.co$/, "x"],
    [/whatsapp|wa\.me|l\.wl\.co/, "whatsapp"],
    [/linkedin\.com|lnkd\.in/, "linkedin"],
  ]
  return known.find(([pattern]) => pattern.test(host))?.[1] ?? "other"
}

function send(slug: string, event: string, extra: Record<string, unknown> = {}) {
  try {
    void fetch(new URL(EVENTS_PATH, getClientEnvironment().API_BASE_URL), {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        event,
        visitorId: visitorId(),
        source: trafficSource(),
        device: window.innerWidth < 768 ? "mobile" : "desktop",
        ...extra,
      }),
    }).catch(() => undefined)
  } catch {
    // Stats are best effort; the article never breaks on them.
  }
}

// Counts the view and how far the article was read (25/50/75/100%), once each.
export function BlogTracker({ slug }: { slug: string }) {
  useEffect(() => {
    send(slug, "view")
    const reached = new Set<number>()
    const article = document.querySelector<HTMLElement>("[data-blog-article]")
    const onScroll = () => {
      if (!article) return
      const box = article.getBoundingClientRect()
      const read = (window.innerHeight - box.top) / Math.max(1, box.height)
      for (const mark of [25, 50, 75, 100]) {
        if (read * 100 >= mark && !reached.has(mark)) {
          reached.add(mark)
          send(slug, `read_${mark}`)
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [slug])
  return null
}

// A sign-up button that says which article and which spot it was tapped in -- in the stats and
// in the sign-up's UTM tags (utm_source=blog, utm_campaign=<article>, utm_content=<spot>).
export function BlogCtaLink({
  slug,
  spot,
  href,
  className,
  children,
}: {
  slug: string
  spot: string
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        send(slug, "cta_click", { cta: spot })
        pushDataLayerEvent("blog_cta_click", { article: slug, spot })
      }}
    >
      {children}
    </a>
  )
}

function normalizePhone(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s-]/g, "")
}

// "We'll call you": name and phone, saved as a CRM lead (with a WhatsApp alert to the team), its
// source set to this article.
export function BlogLeadForm({ slug, title }: { slug: string; title: string }) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [website, setWebsite] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed" | "invalid">("idle")

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cleanPhone = normalizePhone(phone.trim())
    if (name.trim().length < 2 || !/^\+?\d{9,15}$/.test(cleanPhone)) {
      setStatus("invalid")
      return
    }
    setStatus("sending")
    const saved = readAttribution()
    const touch = {
      source: "blog",
      medium: "article",
      campaign: slug,
      content: "lead_form",
      term: null,
      clickId: null,
      clickIdType: null,
      referrer: null,
      landingPage: window.location.pathname.slice(0, 300),
      at: new Date().toISOString(),
    }
    try {
      const response = await fetch(new URL(SALES_LEADS_PATH, getClientEnvironment().API_BASE_URL), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: name.trim(),
          phone: cleanPhone,
          email: "",
          website,
          attribution: { first: saved?.first ?? touch, last: touch },
        }),
      })
      if (!response.ok) {
        setStatus("failed")
        return
      }
      setStatus("sent")
      send(slug, "lead")
      pushDataLayerEvent("generate_lead", { form_name: "blog_article", article: slug })
    } catch {
      setStatus("failed")
    }
  }

  if (status === "sent") {
    return (
      <div className="flex items-start gap-4 rounded-[28px] border border-emerald-200 bg-emerald-50 p-7">
        <CheckCircle2 className="mt-1 size-7 shrink-0 text-emerald-600" />
        <div>
          <p className="text-[19px] font-extrabold text-emerald-900">وصلنا طلبك، شكراً لك</p>
          <p className="mt-1.5 text-[16px] leading-8 text-emerald-800">
            سيتواصل معك فريق مدار قريباً على رقمك.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[28px] border border-slate-200 bg-[#f7f9fc] p-7 sm:p-8"
      aria-label={`طلب تواصل: ${title}`}
    >
      <p className="text-[21px] leading-snug font-black">
        تبي أحد يشرح لك كيف تطبّق هذا في منشأتك؟
      </p>
      <p className="mt-2 text-[16px] leading-8 text-slate-600">
        اترك اسمك ورقمك، ويتواصل معك فريق مدار خلال وقت قصير. بدون أي التزام.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="اسمك أو اسم منشأتك"
          autoComplete="organization"
          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] outline-none focus:border-[#2878ff]"
        />
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="رقم الجوال (05xxxxxxxx)"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-right text-[16px] outline-none focus:border-[#2878ff]"
        />
        {/* Honeypot: people never see it, bots fill it. */}
        <input
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="hidden"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0b1738] px-6 text-[16px] font-extrabold text-white transition-colors hover:bg-[#16244f]",
            status === "sending" && "opacity-70"
          )}
        >
          {status === "sending" ? <Loader2 className="size-4 animate-spin" /> : null}
          تواصلوا معي
          <ArrowLeft className="size-4" />
        </button>
      </div>
      {status === "invalid" ? (
        <p className="mt-3 text-[14.5px] font-semibold text-rose-600">اكتب اسمك ورقم جوال صحيح.</p>
      ) : null}
      {status === "failed" ? (
        <p className="mt-3 text-[14.5px] font-semibold text-rose-600">
          تعذر الإرسال، حاول مرة أخرى.
        </p>
      ) : null}
    </form>
  )
}
