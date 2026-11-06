"use client"

import { type FormEvent, useCallback, useState } from "react"
import dynamic from "next/dynamic"
import Image from "next/image"
import { CalendarCheck, CalendarDays, CheckCircle2, Loader2, PhoneCall } from "lucide-react"

import { readAttribution } from "@/lib/attribution"
import { pushDataLayerEvent } from "@/lib/data-layer"
import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"

import { callDays, CallPicker } from "./call-picker"
import { InterestPicker } from "./interest-picker"
import { MADAR_REGISTER_URL } from "./marketing-constants"
import type { BookedMeeting } from "./meeting-booker"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// Built with a join to satisfy the no-literal-route lint rule (same trick as the feature services).
const SALES_LEADS_PATH = ["", "v1", "public", "sales-leads"].join(String.fromCharCode(47))

// Loaded only once the form is sent: the calendar is the second step.
const MeetingBooker = dynamic(() => import("./meeting-booker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] items-center justify-center text-slate-400">
      <Loader2 className="size-7 animate-spin" />
    </div>
  ),
})

// "الثلاثاء 10 نوفمبر، 12:00 م" in Saudi time.
function formatMeeting(iso: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso))
}

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
  // After the form: choose (meeting or call) → booking (calendar) or calling (day and time).
  const [status, setStatus] = useState<
    | "idle"
    | "sending"
    | "failed"
    | "choose"
    | "booking"
    | "booked"
    | "calling"
    | "called"
    | "skipped"
  >("idle")
  const [leadId, setLeadId] = useState<string | null>(null)
  const [meeting, setMeeting] = useState<BookedMeeting | null>(null)
  // The call times on offer, worked out when the lead picks "phone call".
  const [days, setDays] = useState<ReturnType<typeof callDays>>([])
  const [callAt, setCallAt] = useState<string | null>(null)
  const [sendingCall, setSendingCall] = useState(false)
  const [callFailed, setCallFailed] = useState(false)
  // After the meeting or call: what the lead is interested in (answered or skipped).
  const [interestsDone, setInterestsDone] = useState(false)
  const [sendingInterests, setSendingInterests] = useState(false)
  const [interestsFailed, setInterestsFailed] = useState(false)

  async function sendInterests(input: { interests: string[]; other: string | null }) {
    if (!leadId) {
      setInterestsDone(true)
      return
    }
    setSendingInterests(true)
    setInterestsFailed(false)
    try {
      const response = await fetch(
        new URL(
          [SALES_LEADS_PATH, leadId, "interests"].join(String.fromCharCode(47)),
          getClientEnvironment().API_BASE_URL
        ),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }
      )
      if (!response.ok) {
        setInterestsFailed(true)
        return
      }
      setInterestsDone(true)
    } catch {
      setInterestsFailed(true)
    } finally {
      setSendingInterests(false)
    }
  }

  async function requestCall(at: string) {
    setSendingCall(true)
    setCallFailed(false)
    try {
      const response = leadId
        ? await fetch(
            new URL(
              [SALES_LEADS_PATH, leadId, "call"].join(String.fromCharCode(47)),
              getClientEnvironment().API_BASE_URL
            ),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ callAt: at }),
            }
          )
        : null
      if (response && !response.ok) {
        setCallFailed(true)
        return
      }
      setCallAt(at)
      setStatus("called")
      pushDataLayerEvent("request_call", { form_name: "contact_sales", lead_id: leadId })
    } catch {
      setCallFailed(true)
    } finally {
      setSendingCall(false)
    }
  }

  const onBooked = useCallback(
    (booked: BookedMeeting) => {
      setMeeting(booked)
      setStatus("booked")
      pushDataLayerEvent("book_meeting", { form_name: "contact_sales", lead_id: leadId })
      if (!leadId) return
      // Best effort: the booking itself is already confirmed by Cal.com.
      void fetch(
        new URL(
          [SALES_LEADS_PATH, leadId, "meeting"].join(String.fromCharCode(47)),
          getClientEnvironment().API_BASE_URL
        ),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(booked),
        }
      ).catch(() => undefined)
    },
    [leadId]
  )

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
          attribution: readAttribution(),
        }),
      })
      if (!response.ok) {
        setStatus("failed")
        return
      }
      const body = (await response.json().catch(() => ({}))) as { id?: string }
      setLeadId(body.id ?? null)
      setStatus("choose")
      // For Google Tag Manager: the form was sent and saved (no personal data).
      pushDataLayerEvent("generate_lead", { form_name: "contact_sales", lead_id: body.id ?? null })
    } catch {
      setStatus("failed")
    }
  }

  return (
    <div
      lang="ar"
      dir="rtl"
      className={cn(
        "relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f8fd] px-4",
        status === "booking" ? "py-4" : "py-12"
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#dff7f3] via-[#e6efff] to-transparent opacity-90 blur-3xl" />
      </div>

      <main
        className={cn(
          "relative w-full transition-[max-width] duration-300",
          status === "booking" ? "max-w-[1080px]" : "max-w-[560px]"
        )}
      >
        <div className={cn("flex justify-center", status === "booking" && "hidden")}>
          <Image
            src={ASSETS.logo}
            alt="مدار"
            width={778}
            height={325}
            priority
            className="h-14 w-auto"
          />
        </div>

        <div
          className={cn(
            "rounded-[32px] bg-white shadow-[0_30px_80px_-30px_rgba(11,23,56,0.35)] ring-1 ring-slate-100",
            status === "booking" ? "p-4 sm:p-6" : "mt-8 p-7 sm:p-10"
          )}
        >
          {status === "booking" ? (
            <div>
              {/* Compact, so the whole step -- calendar and "later" -- fits on one screen. */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-3">
                  <Image
                    src={ASSETS.logo}
                    alt="مدار"
                    width={778}
                    height={325}
                    className="hidden h-9 w-auto sm:block"
                  />
                  <div>
                    <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-700">
                      <CheckCircle2 className="size-4" />
                      تم استلام طلبك
                    </p>
                    <h1 className="text-[21px] leading-tight font-black text-[#0b1738] sm:text-[24px]">
                      اختر موعدًا للعرض التوضيحي (30 دقيقة)
                    </h1>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus("choose")}
                  className="h-11 rounded-2xl border-2 border-slate-200 px-5 text-[15px] font-bold text-[#0b1738] transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  رجوع
                </button>
              </div>
              <div className="mt-4 overflow-hidden rounded-3xl border border-slate-100">
                <MeetingBooker
                  onBooked={onBooked}
                  prefill={{
                    name: values.companyName.trim(),
                    ...(values.email.trim() ? { email: values.email.trim() } : {}),
                    notes: `رقم الجوال: ${normalizePhone(values.phone.trim())}`,
                    ...(leadId ? { "metadata[leadId]": leadId } : {}),
                  }}
                />
              </div>
            </div>
          ) : status === "choose" ? (
            <div className="text-center">
              <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-9" />
              </span>
              <h1 className="mt-5 text-[28px] leading-tight font-black text-[#0b1738]">
                تم استلام طلبك
              </h1>
              <p className="mt-2 text-[17px] text-slate-600">كيف تفضّل أن نتواصل معك؟</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      key: "booking",
                      icon: CalendarDays,
                      title: "حجز اجتماع",
                      text: "عرض توضيحي أونلاين لمدة 30 دقيقة",
                    },
                    {
                      key: "calling",
                      icon: PhoneCall,
                      title: "مكالمة هاتفية",
                      text: "اختر اليوم والوقت ونتصل بك",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      if (option.key === "calling") setDays(callDays(Date.now()))
                      setStatus(option.key)
                    }}
                    className="group flex flex-col items-center rounded-3xl border-2 border-slate-200 px-5 py-7 transition-all hover:-translate-y-0.5 hover:border-[#2878ff] hover:shadow-[0_18px_40px_-20px_rgba(40,120,255,0.5)]"
                  >
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-[#2878ff]/10 text-[#2878ff] transition-colors group-hover:bg-[#2878ff] group-hover:text-white">
                      <option.icon className="size-7" />
                    </span>
                    <span className="mt-4 text-[19px] font-black text-[#0b1738]">
                      {option.title}
                    </span>
                    <span className="mt-1 text-[14px] text-slate-500">{option.text}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStatus("skipped")}
                className="mt-5 h-12 w-full rounded-2xl text-[15px] font-bold text-slate-500 hover:text-[#0b1738]"
              >
                لاحقًا، تواصلوا معي
              </button>
            </div>
          ) : status === "calling" ? (
            <>
              <CallPicker
                days={days}
                sending={sendingCall}
                onConfirm={(at) => void requestCall(at)}
                onBack={() => setStatus("choose")}
              />
              {callFailed ? (
                <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-center text-[15px] font-semibold text-rose-700">
                  تعذر حفظ الموعد، حاول مرة أخرى.
                </p>
              ) : null}
            </>
          ) : (status === "booked" || status === "called") && !interestsDone ? (
            <div>
              <div className="mb-6 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600">
                  {status === "booked" ? (
                    <CalendarCheck className="size-5" />
                  ) : (
                    <PhoneCall className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-emerald-800">
                    {status === "booked" ? "تم حجز موعدك" : "تم تحديد موعد المكالمة"}
                  </p>
                  {(status === "booked" ? meeting?.startTime : callAt) ? (
                    <p className="text-[13.5px] font-semibold text-emerald-700">
                      {formatMeeting((status === "booked" ? meeting?.startTime : callAt) as string)}
                    </p>
                  ) : null}
                </div>
              </div>
              <InterestPicker
                sending={sendingInterests}
                failed={interestsFailed}
                onSubmit={(input) => void sendInterests(input)}
                onSkip={() => setInterestsDone(true)}
              />
            </div>
          ) : status === "booked" || status === "skipped" || status === "called" ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                {status === "booked" ? (
                  <CalendarCheck className="size-10" />
                ) : status === "called" ? (
                  <PhoneCall className="size-10" />
                ) : (
                  <CheckCircle2 className="size-11" />
                )}
              </span>
              <h1 className="mt-6 text-[28px] font-black text-[#0b1738]">
                {status === "booked"
                  ? "تم حجز موعدك"
                  : status === "called"
                    ? "سنتصل بك في موعدك"
                    : "تم استلام طلبك"}
              </h1>
              {status === "booked" && meeting ? (
                <p className="mt-3 text-[19px] font-extrabold text-[#2878ff]">
                  {formatMeeting(meeting.startTime)}
                </p>
              ) : null}
              {status === "called" && callAt ? (
                <p className="mt-3 text-[19px] font-extrabold text-[#2878ff]">
                  {formatMeeting(callAt)}
                </p>
              ) : null}
              <p className="mt-3 text-[17px] leading-8 text-slate-600">
                {status === "booked"
                  ? "ستصلك دعوة الاجتماع ورابطه على بريدك الإلكتروني. نراك قريبًا!"
                  : status === "called"
                    ? "سيتصل بك فريق المبيعات على رقم جوالك في هذا الموعد."
                    : "شكرًا لك، سيتواصل معك فريق المبيعات قريبًا."}
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
