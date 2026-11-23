"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

const SEPARATOR = String.fromCharCode(47)

// The page behind the "stop" link in a WhatsApp message from Madar's sales team. Opening it is
// the whole request: it tells Madar (from a person's browser only, so a chat app looking at the
// link does not stop anything) and says so.
export function OutreachStop({ code }: { code: string }) {
  const [state, setState] = useState<"working" | "done" | "failed">("working")

  useEffect(() => {
    const address = new URL(
      ["", "v1", "public", "outreach", encodeURIComponent(code), "stop"].join(SEPARATOR),
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
      className="flex min-h-screen items-center justify-center bg-[#f5f8fd] px-4"
    >
      <div className="w-full max-w-sm rounded-[28px] bg-white p-8 text-center shadow-[0_30px_80px_-30px_rgba(11,23,56,0.35)] ring-1 ring-slate-100">
        {state === "working" ? (
          <Loader2 className="mx-auto size-8 animate-spin text-slate-400" />
        ) : state === "done" ? (
          <>
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <h1 className="mt-4 text-[22px] font-black text-[#0b1738]">تم إيقاف الرسائل</h1>
            <p className="mt-2 text-[15px] leading-7 text-slate-600">
              لن تصلك رسائل أخرى من فريق مدار. نعتذر عن الإزعاج.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[20px] font-black text-[#0b1738]">تعذر تنفيذ الطلب</h1>
            <p className="mt-2 text-[15px] leading-7 text-slate-600">
              حاول فتح الرابط مرة أخرى بعد قليل.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
