"use client"

import { useState } from "react"
import { Check, Loader2, Megaphone, PenLine, ShoppingBag, Store } from "lucide-react"

import { cn } from "@/lib/utils"

const OPTIONS = [
  {
    id: "advertising",
    label: "الحملات الإعلانية",
    text: "إعلانات جوجل وميتا وسناب وتيك توك",
    icon: Megaphone,
  },
  {
    id: "ecommerce",
    label: "المتاجر الإلكترونية",
    text: "سلة وزد وإدارة الطلبات",
    icon: ShoppingBag,
  },
  { id: "pos", label: "نقطة البيع", text: "كاشير ومخزون وفواتير", icon: Store },
  { id: "other", label: "أخرى", text: "اكتب ما تحتاجه", icon: PenLine },
] as const

type OptionId = (typeof OPTIONS)[number]["id"]

// The talk-to-sales flow's last step: what the lead is interested in, so the sales team comes to
// the meeting or call prepared. Several can be picked; "أخرى" opens a box to write in.
export function InterestPicker({
  sending,
  failed,
  onSubmit,
  onSkip,
}: {
  sending: boolean
  failed: boolean
  onSubmit: (input: { interests: string[]; other: string | null }) => void
  onSkip: () => void
}) {
  const [picked, setPicked] = useState<OptionId[]>([])
  const [other, setOther] = useState("")
  const wantsOther = picked.includes("other")
  const ready = picked.some((id) => id !== "other") || (wantsOther && other.trim().length > 1)

  function toggle(id: OptionId) {
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    )
  }

  return (
    <div>
      <h2 className="text-center text-[24px] leading-tight font-black text-[#0b1738]">
        ما الذي يهمك في مدار؟
      </h2>
      <p className="mt-2 text-center text-[15px] text-slate-500">
        اختر كل ما يناسبك ليستعد فريقنا قبل التواصل معك.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {OPTIONS.map((option) => {
          const on = picked.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option.id)}
              className={cn(
                "relative flex flex-col items-start rounded-3xl border-2 p-4 text-start transition-all",
                on
                  ? "border-[#2878ff] bg-[#2878ff]/5 shadow-[0_14px_30px_-18px_rgba(40,120,255,0.6)]"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300"
              )}
            >
              <span
                className={cn(
                  "absolute end-3 top-3 flex size-6 items-center justify-center rounded-full border-2 transition-colors",
                  on ? "border-[#2878ff] bg-[#2878ff] text-white" : "border-slate-200"
                )}
              >
                {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-2xl transition-colors",
                  on ? "bg-[#2878ff] text-white" : "bg-[#2878ff]/10 text-[#2878ff]"
                )}
              >
                <option.icon className="size-5" />
              </span>
              <span className="mt-3 text-[16px] font-extrabold text-[#0b1738]">{option.label}</span>
              <span className="mt-0.5 text-[12.5px] leading-5 text-slate-500">{option.text}</span>
            </button>
          )
        })}
      </div>

      {wantsOther ? (
        <textarea
          autoFocus
          value={other}
          maxLength={200}
          rows={2}
          onChange={(event) => setOther(event.target.value)}
          placeholder="مثال: ربط مع نظام المحاسبة، تقارير مخصصة..."
          className="mt-3 w-full resize-none rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-[15px] font-semibold text-[#0b1738] outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-[#2878ff]"
        />
      ) : null}

      {failed ? (
        <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-center text-[14px] font-semibold text-rose-700">
          تعذر الحفظ، حاول مرة أخرى.
        </p>
      ) : null}

      <button
        type="button"
        disabled={!ready || sending}
        onClick={() =>
          onSubmit({
            interests: picked.filter((id) => id !== "other"),
            other: wantsOther && other.trim() ? other.trim() : null,
          })
        }
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#2878ff] text-[18px] font-extrabold text-white shadow-[0_14px_30px_rgba(40,120,255,0.35)] transition-all hover:bg-[#1f63d6] disabled:opacity-50 disabled:shadow-none"
      >
        {sending ? <Loader2 className="size-5 animate-spin" /> : null}
        إرسال
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="mt-2 h-11 w-full rounded-2xl text-[15px] font-bold text-slate-500 hover:text-[#0b1738]"
      >
        تخطي
      </button>
    </div>
  )
}
