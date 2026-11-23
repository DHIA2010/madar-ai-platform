"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { CheckCircle2, Loader2 } from "lucide-react"

import { ASSETS } from "@/constants/assets"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

const SEPARATOR = String.fromCharCode(47)

// The page behind the "interested" link in a WhatsApp message from Madar's sales team. Opening
// it is the whole answer -- nothing to fill in, since the team already has the person's name
// and number. It tells Madar (from a person's browser only, so a chat app looking at the link
// answers nothing), thanks them, and offers the details for whoever wants to read on.
export function OutreachInterest({ code, target }: { code: string; target: string }) {
  const [state, setState] = useState<"working" | "done" | "failed">("working")

  useEffect(() => {
    const address = new URL(
      ["", "v1", "public", "outreach", encodeURIComponent(code), "interest"].join(SEPARATOR),
      getClientEnvironment().API_BASE_URL
    )
    fetch(address, { method: "POST" })
      .then((response) => setState(response.ok ? "done" : "failed"))
      .catch(() => setState("failed"))
  }, [code])

  return (
    <div
      lang="ar"
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[#f5f8fd] px-4 py-8"
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Image
            src={ASSETS.logo}
            alt="مدار"
            width={778}
            height={325}
            priority
            className="h-10 w-auto"
          />
        </div>
        <div className="mt-5 rounded-[28px] bg-white p-8 text-center shadow-[0_30px_80px_-30px_rgba(11,23,56,0.35)] ring-1 ring-slate-100">
          {state === "working" ? (
            <Loader2 className="mx-auto size-8 animate-spin text-slate-400" />
          ) : state === "done" ? (
            <>
              <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
              <h1 className="mt-4 text-[22px] font-black text-[#0b1738]">شكرًا لاهتمامك</h1>
              <p className="mt-2 text-[15px] leading-7 text-slate-600">
                وصلنا طلبك، وسيتواصل معك أحد فريق مدار قريبًا على هذا الرقم.
              </p>
              <a
                href={target}
                className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[#2878ff] text-[16px] font-extrabold text-white shadow-[0_14px_30px_rgba(40,120,255,0.35)] transition-all hover:bg-[#1f63d6]"
              >
                تعرّف على مدار
              </a>
            </>
          ) : (
            <>
              <h1 className="text-[20px] font-black text-[#0b1738]">تعذر تسجيل طلبك</h1>
              <p className="mt-2 text-[15px] leading-7 text-slate-600">
                حاول فتح الرابط مرة أخرى بعد قليل.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
