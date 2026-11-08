import Link from "next/link"
import { ArrowLeft, BadgeCheck, CheckCircle2, Sparkles } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { MADAR_REGISTER_URL, MARKETING_INTEGRATIONS } from "../marketing-constants"
import { DashboardMockup, ReceiptCard } from "./mockups"

const HIGHLIGHTS = [
  "تجربة مجانية ١٤ يوماً",
  "متوافق مع الفوترة الإلكترونية",
  "يدعم العربية والإنجليزية",
]

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pt-14 pb-20 sm:pt-20 lg:pb-28">
      {/* Soft brand glows and a faint grid behind the headline. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#dff7f3] via-[#e8f0ff] to-transparent opacity-80 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#eef2f7_1px,transparent_1px),linear-gradient(to_bottom,#eef2f7_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] bg-[size:48px_48px]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe0ff] bg-white/80 px-4 py-1.5 text-[13px] font-bold text-[#1d4ed8] shadow-sm">
            <Sparkles className="size-4" />
            منصة سعودية متكاملة لإدارة التجارة
          </span>
          <h1 className="mt-6 text-4xl leading-[1.25] font-black tracking-tight text-[#0b1738] sm:text-6xl sm:leading-[1.2]">
            كل تجارتك في{" "}
            <span className="bg-gradient-to-l from-[#12b5a6] via-[#2563eb] to-[#1e3a8a] bg-clip-text text-transparent">
              مدار واحد
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
            الكاشير، ومتجرك الإلكتروني، وحملاتك الإعلانية، والمشتريات، والمخزون، والتقارير — مع
            مساعد ذكي يجيبك بالعربي. نظام واحد بدل خمسة، مصمم للتاجر السعودي.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={MADAR_REGISTER_URL}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2878ff] px-8 py-4 text-base font-bold text-white shadow-[0_14px_34px_rgba(40,120,255,0.38)] transition-all hover:-translate-y-0.5 hover:bg-[#1f63d6] sm:w-auto"
            >
              ابدأ تجربتك المجانية
              <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
            </a>
            <Link
              href={ROUTES.contactSales}
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-bold text-[#0b1738] transition-colors hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
            >
              تحدث مع المبيعات
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[#12b5a6]" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <div
            aria-hidden
            className="absolute -inset-x-10 -inset-y-6 -z-10 rounded-[40px] bg-gradient-to-tr from-[#12b5a6]/15 via-[#2563eb]/10 to-transparent blur-2xl"
          />
          <DashboardMockup />
          <ReceiptCard className="absolute -bottom-10 -start-4 hidden rotate-[-4deg] md:block lg:-start-12" />
          <div className="absolute -top-6 -end-4 hidden items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_20px_50px_-12px_rgba(11,23,56,0.3)] ring-1 ring-slate-100 md:flex lg:-end-10">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <BadgeCheck className="size-5" />
            </span>
            <div className="text-start">
              <p className="text-[13px] font-extrabold text-[#0b1738]">طلب جديد من سلة</p>
              <p className="text-[11px] text-slate-500">المصدر: إعلان سناب شات</p>
            </div>
          </div>
        </div>

        <div className="mt-24 text-center">
          <p className="text-sm font-bold text-slate-500">يتكامل مع المنصات التي تعمل عليها</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {MARKETING_INTEGRATIONS.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center gap-2 opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={integration.logo}
                  alt={integration.name}
                  className="h-8 w-8 rounded-lg object-contain"
                />
                <span className="text-[15px] font-bold text-[#0b1738]">{integration.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
