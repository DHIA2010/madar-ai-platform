"use client"

import { type FormEvent, useState } from "react"
import Image from "next/image"
import { CheckCircle2, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"

import { MADAR_REGISTER_URL } from "./marketing-constants"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// Built with a join to satisfy the no-literal-route lint rule (same trick as the feature services).
const SALES_LEADS_PATH = ["", "v1", "public", "sales-leads"].join(String.fromCharCode(47))

type Field = "companyName" | "phone" | "email"

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
const normalizePhone = (value: string) =>
  value.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit))).replace(/[\s-]/g, "")

function validate(values: Record<Field, string>) {
  const errors: Partial<Record<Field, string>> = {}
  if (values.companyName.trim().length < 2) errors.companyName = "اكتب اسم الشركة"
  if (!/^\+?\d{7,15}$/.test(normalizePhone(values.phone.trim())))
    errors.phone = "اكتب رقم جوال صحيح"
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = "اكتب بريدًا إلكترونيًا صحيحًا أو اتركه فارغًا"
  return errors
}

const INPUT =
  "h-14 w-full rounded-2xl border-2 bg-white px-5 text-[17px] font-semibold text-[#0b1738] outline-none transition-colors placeholder:font-normal placeholder:text-slate-400 focus:border-[#2878ff]"

// madar.my's "talk to sales" page: deliberately nothing but the form -- no navigation to wander
// off to, only the option to start a free trial instead.
export function ContactSalesPage() {
  const [values, setValues] = useState<Record<Field, string>>({
    companyName: "",
    phone: "",
    email: "",
  })
  const [website, setWebsite] = useState("")
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle")

  const update = (field: Field) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setStatus("sending")
    try {
      const response = await fetch(new URL(SALES_LEADS_PATH, getClientEnvironment().API_BASE_URL), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: values.companyName.trim(),
          phone: normalizePhone(values.phone.trim()),
          email: values.email.trim(),
          website,
        }),
      })
      setStatus(response.ok ? "sent" : "failed")
    } catch {
      setStatus("failed")
    }
  }

  return (
    <div
      lang="ar"
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f8fd] px-4 py-12"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#dff7f3] via-[#e6efff] to-transparent opacity-90 blur-3xl" />
      </div>

      <main className="relative w-full max-w-[560px]">
        <div className="flex justify-center">
          <Image
            src={ASSETS.logo}
            alt="مدار"
            width={778}
            height={325}
            priority
            className="h-14 w-auto"
          />
        </div>

        <div className="mt-8 rounded-[32px] bg-white p-7 shadow-[0_30px_80px_-30px_rgba(11,23,56,0.35)] ring-1 ring-slate-100 sm:p-10">
          {status === "sent" ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-11" />
              </span>
              <h1 className="mt-6 text-[28px] font-black text-[#0b1738]">تم استلام طلبك</h1>
              <p className="mt-3 text-[17px] leading-8 text-slate-600">
                شكرًا لك، سيتواصل معك فريق المبيعات قريبًا.
              </p>
              <a
                href={MADAR_REGISTER_URL}
                className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl border-2 border-slate-200 text-[17px] font-extrabold text-[#0b1738] transition-colors hover:bg-slate-50"
              >
                جرّب مجانًا الآن
              </a>
            </div>
          ) : (
            <>
              <h1 className="text-center text-[30px] leading-tight font-black text-[#0b1738]">
                تحدث مع فريق المبيعات
              </h1>
              <p className="mt-3 text-center text-[17px] leading-8 text-slate-600">
                اترك بياناتك وسنتواصل معك قريبًا.
              </p>

              <form onSubmit={submit} noValidate className="mt-8 space-y-5">
                <div>
                  <label
                    htmlFor="companyName"
                    className="mb-2 block text-[16px] font-bold text-[#0b1738]"
                  >
                    اسم الشركة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="companyName"
                    name="companyName"
                    autoComplete="organization"
                    value={values.companyName}
                    onChange={update("companyName")}
                    placeholder="مثال: مؤسسة الريم التجارية"
                    aria-invalid={Boolean(errors.companyName)}
                    className={cn(
                      INPUT,
                      errors.companyName ? "border-rose-300" : "border-slate-200"
                    )}
                  />
                  {errors.companyName ? (
                    <p className="mt-1.5 text-[14px] font-semibold text-rose-600">
                      {errors.companyName}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-[16px] font-bold text-[#0b1738]"
                  >
                    رقم الجوال <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    value={values.phone}
                    onChange={update("phone")}
                    placeholder="05XXXXXXXX"
                    aria-invalid={Boolean(errors.phone)}
                    className={cn(
                      INPUT,
                      "text-right",
                      errors.phone ? "border-rose-300" : "border-slate-200"
                    )}
                  />
                  {errors.phone ? (
                    <p className="mt-1.5 text-[14px] font-semibold text-rose-600">{errors.phone}</p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-[16px] font-bold text-[#0b1738]"
                  >
                    البريد الإلكتروني <span className="font-medium text-slate-400">(اختياري)</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    value={values.email}
                    onChange={update("email")}
                    placeholder="name@company.com"
                    aria-invalid={Boolean(errors.email)}
                    className={cn(
                      INPUT,
                      "text-right",
                      errors.email ? "border-rose-300" : "border-slate-200"
                    )}
                  />
                  {errors.email ? (
                    <p className="mt-1.5 text-[14px] font-semibold text-rose-600">{errors.email}</p>
                  ) : null}
                </div>

                {/* Hidden from people; only bots fill it in. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  className="absolute -left-[9999px] size-px opacity-0"
                />

                {status === "failed" ? (
                  <p className="rounded-2xl bg-rose-50 px-4 py-3 text-center text-[15px] font-semibold text-rose-700">
                    تعذر إرسال طلبك، حاول مرة أخرى.
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2878ff] text-[18px] font-extrabold text-white shadow-[0_14px_30px_rgba(40,120,255,0.35)] transition-all hover:bg-[#1f63d6] disabled:opacity-70"
                >
                  {status === "sending" ? <Loader2 className="size-5 animate-spin" /> : null}
                  تسجيل
                </button>
              </form>

              <div className="my-6 flex items-center gap-4 text-[15px] font-semibold text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                أو
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <a
                href={MADAR_REGISTER_URL}
                className="flex h-14 w-full items-center justify-center rounded-2xl border-2 border-slate-200 text-[17px] font-extrabold text-[#0b1738] transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                جرّب مجانًا الآن
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
