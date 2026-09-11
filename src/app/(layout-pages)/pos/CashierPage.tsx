"use client"

// الكاشير -- replaces the old standalone POS portal (its own login, its own employee accounts,
// its own /pos/terminal/* mini-app). The cashier screen now lives inside madar.app itself: same
// session, same users (Administration → Users), same product/customer data as the rest of the
// app -- no separate sign-in and no separate roster.
//
// This is a placeholder until the actual cashier screen design is provided; it deliberately does
// not invent a checkout UI ahead of that.

import { ShoppingCart } from "lucide-react"

export default function CashierPage() {
  return (
    <div
      dir="rtl"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
        <ShoppingCart className="size-7" />
      </span>
      <h1 className="text-xl font-bold text-[#0d1b3e]">الكاشير</h1>
      <p className="max-w-sm text-sm text-[#8098b4]">
        شاشة الكاشير قيد الإنشاء داخل مدار مباشرة، وستعمل بنفس حسابك ومنتجات متجرك دون تسجيل دخول
        منفصل.
      </p>
    </div>
  )
}
