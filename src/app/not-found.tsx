import Link from "next/link"

import { ROUTES } from "@/constants/routes"

// An address that doesn't exist: say so in the app's own language and offer the way back.
export default function NotFound() {
  return (
    <div
      dir="rtl"
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#f7f9fd] p-6 text-center"
    >
      <p className="text-6xl font-extrabold text-[#2563eb]">404</p>
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-[#0b1738]">الصفحة غير موجودة</h1>
        <p className="max-w-md text-sm text-[#5b6b85]">
          الرابط الذي فتحته غير صحيح أو أن الصفحة نُقلت.
        </p>
      </div>
      <Link
        href={ROUTES.dashboard}
        className="rounded-[10px] bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
      >
        العودة إلى الرئيسية
      </Link>
    </div>
  )
}
