"use client"

import { useEffect } from "react"

import { AppButton } from "@/components/app"

// Something on this page failed while rendering. The rest of the app (sidebar, session) is fine,
// so say so plainly and let the person try again instead of leaving a blank screen.
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("page.render_failed", error)
  }, [error])

  return (
    <div
      dir="rtl"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-foreground">حدث خطأ غير متوقع</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          تعذّر عرض هذه الصفحة. بياناتك لم تتأثر، جرّب إعادة المحاولة.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <AppButton onClick={reset}>إعادة المحاولة</AppButton>
        <AppButton variant="outline" onClick={() => window.location.reload()}>
          تحديث الصفحة
        </AppButton>
      </div>
    </div>
  )
}
