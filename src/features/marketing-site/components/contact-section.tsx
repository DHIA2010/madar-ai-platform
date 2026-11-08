import { ArrowLeft, Mail } from "lucide-react"

import { MADAR_CONTACT_EMAIL, MADAR_REGISTER_URL } from "../marketing-constants"

export function ContactSection() {
  return (
    <section id="contact" className="scroll-mt-20 bg-white py-24 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[36px] bg-[#0b1738] px-6 py-16 text-center text-white sm:px-16 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-gradient-to-l from-[#12b5a6]/40 to-[#2563eb]/40 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:28px_28px]" />
          </div>
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl leading-tight font-black sm:text-[44px]">
              جاهز تجمع تجارتك في مدار واحد؟
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              أنشئ حسابك الآن وجرّب التطبيقات المدفوعة مجانًا ١٤ يوماً.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={MADAR_REGISTER_URL}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-extrabold text-[#0b1738] transition-transform hover:-translate-y-0.5 sm:w-auto"
              >
                ابدأ تجربتك المجانية
                <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
              </a>
              <a
                href={`mailto:${MADAR_CONTACT_EMAIL}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 px-8 py-4 text-base font-bold text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                <Mail className="size-5" />
                تواصل معنا
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
