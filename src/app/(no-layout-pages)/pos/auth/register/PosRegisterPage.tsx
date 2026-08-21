"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { Lock, Mail, Store, User } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppForm, AppInput, AppPasswordInput } from "@/components/app"
import { Badge } from "@/components/ui/badge"

const posRegisterSchema = z
  .object({
    storeName: z.string().min(2, "يجب أن يتكون اسم المتجر من حرفين على الأقل."),
    fullName: z.string().min(2, "يجب أن يتكون الاسم الكامل من حرفين على الأقل."),
    email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
    password: z.string().min(8, "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل."),
    confirmPassword: z.string().min(8, "يرجى تأكيد كلمة المرور."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين.",
  })

type PosRegisterFormValues = z.infer<typeof posRegisterSchema>

export default function PosRegisterPage() {
  const [submitted, setSubmitted] = useState(false)
  const form = useForm<PosRegisterFormValues>({
    resolver: zodResolver(posRegisterSchema),
    defaultValues: { storeName: "", fullName: "", email: "", password: "", confirmPassword: "" },
  })

  const onSubmit = form.handleSubmit(() => {
    setSubmitted(true)
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
            <h1 className="text-xl font-bold text-foreground">إنشاء حساب نقطة بيع جديد</h1>
            <p className="text-sm text-muted-foreground">أنشئ حساب متجرك وابدأ البيع خلال دقائق.</p>
          </div>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
            قيد الإنشاء -- سيتم ربط نظام تسجيل حسابات نقطة البيع الحقيقي في المرحلة القادمة.
          </div>
        ) : null}

        <AppForm onSubmit={onSubmit} className="space-y-5">
          <AppInput
            label="اسم المتجر"
            placeholder="متجر مثال"
            autoComplete="organization"
            startIcon={<Store className="size-4" />}
            errorText={form.formState.errors.storeName?.message}
            required
            {...form.register("storeName")}
          />

          <AppInput
            label="الاسم الكامل"
            placeholder="اسمك الكامل"
            autoComplete="name"
            startIcon={<User className="size-4" />}
            errorText={form.formState.errors.fullName?.message}
            required
            {...form.register("fullName")}
          />

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
            autoComplete="new-password"
            startIcon={<Lock className="size-4" />}
            errorText={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />

          <AppPasswordInput
            label="تأكيد كلمة المرور"
            placeholder="••••••••"
            autoComplete="new-password"
            startIcon={<Lock className="size-4" />}
            errorText={form.formState.errors.confirmPassword?.message}
            required
            {...form.register("confirmPassword")}
          />

          <AppButton
            type="submit"
            fullWidth
            loading={form.formState.isSubmitting}
            className="h-11 bg-teal-600 text-base font-semibold text-white hover:bg-teal-600/90"
          >
            إنشاء حساب
          </AppButton>
        </AppForm>

        <p className="text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <Link
            href={ROUTES.posAuth.login}
            className="font-semibold text-teal-600 underline-offset-4 hover:underline"
          >
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  )
}
