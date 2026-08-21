"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Loader2, LogOut, Store } from "lucide-react"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"
import { posAuthService } from "@/features/pos/services/pos-auth.service"
import type { PosEmployeeSession } from "@/features/pos/services/pos-employee-session"

import { AppButton } from "@/components/app"
import { Badge } from "@/components/ui/badge"

export default function PosPortalPage() {
  const router = useRouter()
  const [employee, setEmployee] = useState<PosEmployeeSession["employee"] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      const result = await posAuthService.fetchSession()
      if (cancelled) return
      if (!result) {
        router.replace(ROUTES.posAuth.login)
        return
      }
      setEmployee(result)
      setIsLoading(false)
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [router])

  async function handleLogout() {
    setIsLoggingOut(true)
    await posAuthService.logout()
    router.replace(ROUTES.posAuth.login)
  }

  if (isLoading || !employee) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-teal-500/10 via-background to-teal-500/5 p-6"
    >
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Image
          src={ASSETS.logo}
          alt="مدار MADAR"
          width={778}
          height={325}
          priority
          className="mx-auto h-10 w-auto"
        />

        <Badge className="mx-auto gap-1.5 border-transparent bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-600/80">
          <Store className="size-3.5" />
          نقطة البيع
        </Badge>

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">مرحبًا، {employee.fullName}</h1>
          <p className="text-sm text-muted-foreground">{employee.posRoleName ?? "بدون دور محدد"}</p>
        </div>

        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          تم تسجيل الدخول بنجاح. واجهة البيع الفعلية قيد الإنشاء وستتوفر هنا قريبًا.
        </div>

        <AppButton
          type="button"
          variant="outline"
          icon={<LogOut className="size-4" />}
          loading={isLoggingOut}
          onClick={handleLogout}
          fullWidth
        >
          تسجيل الخروج
        </AppButton>
      </div>
    </div>
  )
}
