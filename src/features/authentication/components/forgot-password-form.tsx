"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { zodResolver } from "@hookform/resolvers/zod"
import { Mail } from "lucide-react"
import { useForm } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppForm, AppInput } from "@/components/app"

import { useAuthRecovery } from "../hooks"
import { type ForgotPasswordFormValues, forgotPasswordSchema } from "../validators"

const RESEND_COOLDOWN_SECONDS = 60

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const recovery = useAuthRecovery()
  const t = useTranslations("auth.forgotPassword")
  const [formError, setFormError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return current - 1
      })
    }, 1000)
  }

  const sendResetLink = async (email: string) => {
    setFormError(null)

    try {
      const result = await recovery.forgotPassword({ email })
      if (!result.success) {
        throw result.error
      }
      setSubmittedEmail(email)
      startCooldown()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("genericError"))
    }
  }

  const onSubmit = form.handleSubmit((values) => sendResetLink(values.email))

  const handleResend = () => {
    if (cooldown > 0 || !submittedEmail) return
    void sendResetLink(submittedEmail)
  }

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
            {submittedEmail
              ? t("submittedDescription", { email: submittedEmail })
              : t("description")}
          </p>
        </div>
      </div>

      {submittedEmail ? (
        <div className="space-y-5">
          <AppButton
            type="button"
            variant="outline"
            fullWidth
            disabled={cooldown > 0}
            onClick={handleResend}
            className="h-11 text-base font-semibold"
          >
            {cooldown > 0 ? t("resendCountdown", { seconds: cooldown }) : t("resend")}
          </AppButton>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            {t("or")}
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <p className="text-center text-sm text-slate-600">
            <Link
              href={ROUTES.login}
              className="font-semibold text-violet-600 underline-offset-4 hover:underline"
            >
              {t("backToLogin")}
            </Link>
          </p>
        </div>
      ) : (
        <AppForm onSubmit={onSubmit} className="space-y-5">
          <AppInput
            type="email"
            label={t("emailLabel")}
            placeholder={t("emailPlaceholder")}
            autoComplete="email"
            startIcon={<Mail className="size-4" />}
            errorText={form.formState.errors.email?.message}
            required
            {...form.register("email")}
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
