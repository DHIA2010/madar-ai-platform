"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Lock } from "lucide-react"
import { useForm } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppForm, AppPasswordInput } from "@/components/app"

import { useAuthRecovery } from "../hooks"
import { type ResetPasswordFormValues, resetPasswordSchema } from "../validators"

type ResetPasswordFormProps = React.ComponentPropsWithoutRef<"div">

export function ResetPasswordForm({ className, ...props }: ResetPasswordFormProps) {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const recovery = useAuthRecovery()
  const t = useTranslations("auth.resetPassword")
  const [formError, setFormError] = useState<string | null>(null)
  const [isUpdated, setIsUpdated] = useState(false)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token,
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)

    try {
      const result = await recovery.resetPassword(values)
      if (!result.success) {
        throw result.error
      }
      setIsUpdated(true)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("genericError"))
    }
  })

  return (
    <div className={cn("flex w-full max-w-md flex-col gap-8", className)} {...props}>
      <div className="flex flex-col items-center gap-6 text-center">
        <Image
          src={ASSETS.logo}
          alt="مدار MADAR"
          width={778}
          height={325}
          priority
          className="h-14 w-auto"
        />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
          <p className="text-sm text-slate-500">
            {isUpdated ? t("updatedDescription") : t("description")}
          </p>
        </div>
      </div>

      {!token ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">
          {t("missingToken")}
        </div>
      ) : isUpdated ? (
        <div className="space-y-5">
          <div className="flex justify-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </span>
          </div>
          <AppButton
            fullWidth
            asChild
            className="h-11 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
          >
            <Link href={ROUTES.login}>{t("goToLogin")}</Link>
          </AppButton>
        </div>
      ) : (
        <AppForm onSubmit={onSubmit} className="space-y-5">
          <AppPasswordInput
            label={t("newPasswordLabel")}
            placeholder={t("newPasswordPlaceholder")}
            autoComplete="new-password"
            startIcon={<Lock className="size-4" />}
            helperText={t("passwordHelper")}
            errorText={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />

          <AppPasswordInput
            label={t("confirmPasswordLabel")}
            placeholder={t("confirmPasswordPlaceholder")}
            autoComplete="new-password"
            startIcon={<Lock className="size-4" />}
            errorText={form.formState.errors.confirmPassword?.message}
            required
            {...form.register("confirmPassword")}
          />

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <AppButton
            type="submit"
            fullWidth
            loading={form.formState.isSubmitting}
            className="h-11 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
          >
            {t("submit")}
          </AppButton>

          <p className="text-center text-sm text-slate-600">
            <Link
              href={ROUTES.login}
              className="font-semibold text-violet-600 underline-offset-4 hover:underline"
            >
              {t("backToLogin")}
            </Link>
          </p>
        </AppForm>
      )}
    </div>
  )
}
