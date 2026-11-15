"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard } from "@/components/app"

import { useAuthRecovery } from "../hooks"

type VerifyState = "verifying" | "success" | "error" | "missing-token"

export function VerifyEmailPanel({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const recovery = useAuthRecovery()
  const [state, setState] = useState<VerifyState>(token ? "verifying" : "missing-token")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    void (async () => {
      const result = await recovery.verifyEmail({ token })
      if (result.success) {
        setState("success")
        return
      }
      setErrorMessage(result.error.message)
      setState("error")
    })()
  }, [token, recovery])

  if (state === "verifying") {
    return (
      <div dir="rtl" className={cn("flex flex-col gap-6", className)} {...props}>
        <AppCard title="جارٍ تأكيد بريدك الإلكتروني" subtitle="لحظات ونتحقق من الرابط.">
          <div className="flex justify-center py-4">
            <Loader2 className="size-8 animate-spin text-violet-600" />
          </div>
        </AppCard>
      </div>
    )
  }

  if (state === "success") {
    return (
      <div dir="rtl" className={cn("flex flex-col gap-6", className)} {...props}>
        <AppCard
          title="تم تأكيد بريدك الإلكتروني"
          subtitle="يمكنك الآن تسجيل الدخول إلى حسابك."
          icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
        >
          <AppButton fullWidth asChild>
            <Link href={ROUTES.login}>متابعة إلى تسجيل الدخول</Link>
          </AppButton>
        </AppCard>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div dir="rtl" className={cn("flex flex-col gap-6", className)} {...props}>
        <AppCard
          title="تعذّر التحقق من هذا الرابط"
          subtitle={errorMessage ?? "رابط التأكيد غير صحيح أو انتهت صلاحيته."}
          icon={<XCircle className="h-6 w-6 text-destructive" />}
        >
          <p className="text-center text-sm text-muted-foreground">
            إذا كان حسابك يعمل، فربما تم تأكيده من قبل. جرّب تسجيل الدخول.
          </p>
          <AppButton fullWidth asChild>
            <Link href={ROUTES.login}>العودة إلى تسجيل الدخول</Link>
          </AppButton>
        </AppCard>
      </div>
    )
  }

  return (
    <div dir="rtl" className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="أكّد بريدك الإلكتروني" subtitle="أرسلنا رابط التأكيد إلى بريدك.">
        <p className="text-center text-sm">
          <Link className="underline underline-offset-4" href={ROUTES.login}>
            العودة إلى تسجيل الدخول
          </Link>
        </p>
      </AppCard>
    </div>
  )
}
