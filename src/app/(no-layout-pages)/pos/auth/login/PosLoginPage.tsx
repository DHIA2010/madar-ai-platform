"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Lock, Mail, Store } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"
import { posAuthService } from "@/features/pos/services/pos-auth.service"

import { AppButton, AppForm, AppInput, AppPasswordInput } from "@/components/app"
import { Badge } from "@/components/ui/badge"

const posLoginSchema = z.object({
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
  password: z.string().min(1, "يرجى إدخال كلمة المرور."),
})

type PosLoginFormValues = z.infer<typeof posLoginSchema>

export default function PosLoginPage() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<PosLoginFormValues>({
    resolver: zodResolver(posLoginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await posAuthService.login(values)
      router.push(ROUTES.posPortal)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "تعذّر تسجيل الدخول.")
    }
  })

  return (
    <div
      dir="rtl"
      className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-teal-500/10 via-background to-teal-500/5 p-6"
    >
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src={ASSETS.logo}
            alt="مدار MADAR"
            width={778}
            height={325}
            priority
            className="h-10 w-auto"
          />
          <Badge className="gap-1.5 border-transparent bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-600/80">
            <Store className="size-3.5" />
            نقطة البيع
          </Badge>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-foreground">تسجيل الدخول إلى نقطة البيع</h1>
            <p className="text-sm text-muted-foreground">
              سجّل الدخول ببريدك الإلكتروني وكلمة المرور الخاصة بحسابك.
            </p>
          </div>
        </div>

        <AppForm onSubmit={onSubmit} className="space-y-5">
          <AppInput
            type="email"
            label="البريد الإلكتروني"
            placeholder="you@example.com"
            autoComplete="email"
            startIcon={<Mail className="size-4" />}
            errorText={form.formState.errors.email?.message}
            required
            {...form.register("email")}
          />

          <AppPasswordInput
            label="كلمة المرور"
            placeholder="••••••••"
            autoComplete="current-password"
            startIcon={<Lock className="size-4" />}
            errorText={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <AppButton
            type="submit"
            fullWidth
            loading={form.formState.isSubmitting}
            className="h-11 bg-teal-600 text-base font-semibold text-white hover:bg-teal-600/90"
          >
            تسجيل الدخول
          </AppButton>
        </AppForm>

        <p className="text-center text-sm text-muted-foreground">
          ليس لديك متجر بعد؟{" "}
          <Link
            href={ROUTES.posAuth.register}
            className="font-semibold text-teal-600 underline-offset-4 hover:underline"
          >
            إنشاء حساب جديد
          </Link>
        </p>
      </div>
    </div>
  )
}
