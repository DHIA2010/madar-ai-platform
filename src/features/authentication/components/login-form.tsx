"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { zodResolver } from "@hookform/resolvers/zod"
import { Lock, Mail } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCheckbox, AppForm, AppInput, AppPasswordInput } from "@/components/app"

import { useAuth } from "../hooks"
import { type LoginFormValues, loginSchema } from "../validators"

import { useApplicationServices } from "@/application"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4">
      <path
        d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.67h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.25Z"
        fill="#4285F4"
      />
      <path
        d="M10 20c2.7 0 4.96-.89 6.61-2.42l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.07v2.59A9.99 9.99 0 0 0 10 20Z"
        fill="#34A853"
      />
      <path
        d="M4.41 11.92a6.02 6.02 0 0 1 0-3.84V5.49H1.07a10 10 0 0 0 0 9.02l3.34-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C14.95.99 12.7 0 10 0A9.99 9.99 0 0 0 1.07 5.49l3.34 2.59C5.2 5.72 7.4 3.96 10 3.96Z"
        fill="#EA4335"
      />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4">
      <rect x="1" y="1" width="8.5" height="8.5" fill="#F25022" />
      <rect x="10.5" y="1" width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="1" y="10.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="10.5" y="10.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  )
}

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const { login, authStatus } = useAuth()
  const { authenticationApplicationService } = useApplicationServices()
  const [formError, setFormError] = useState<string | null>(null)
  const t = useTranslations("auth.login")
  const searchParams = useSearchParams()
  const invitationToken = searchParams.get("invitation")
  const zidInstallToken = searchParams.get("zidInstall")

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)

    try {
      await login(values)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("genericError"))
      return
    }

    if (invitationToken) {
      try {
        await authenticationApplicationService.acceptInvitation(invitationToken)
        toast.success(t("invitationAccepted"))
      } catch {
        toast.error(t("invitationError"))
      }
    }

    if (zidInstallToken) {
      try {
        await authenticationApplicationService.claimZidMarketplaceInstall(zidInstallToken)
        toast.success(t("zidInstallClaimed"))
      } catch {
        toast.error(t("zidInstallClaimError"))
      }
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
          <p className="text-sm text-slate-500">{t("subheading")}</p>
        </div>
      </div>

      {invitationToken ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
          {t("invitationBanner")}
        </div>
      ) : null}

      {zidInstallToken ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
          {t("zidInstallBanner")}
        </div>
      ) : null}

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

        <AppPasswordInput
          label={t("passwordLabel")}
          placeholder={t("passwordPlaceholder")}
          autoComplete="current-password"
          startIcon={<Lock className="size-4" />}
          errorText={form.formState.errors.password?.message}
          required
          {...form.register("password")}
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <Controller
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <AppCheckbox checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            {t("rememberMe")}
          </label>
          <Link
            href={ROUTES.forgotPassword}
            className="font-medium text-violet-600 underline-offset-4 hover:underline"
          >
            {t("forgotPassword")}
          </Link>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <AppButton
          type="submit"
          fullWidth
          loading={form.formState.isSubmitting || authStatus === "loading"}
          className="h-11 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
        >
          {t("submit")}
        </AppButton>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          {t("orContinueWith")}
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            title={t("comingSoon")}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <GoogleIcon />
            Google
          </button>
          <button
            type="button"
            title={t("comingSoon")}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <MicrosoftIcon />
            Microsoft
          </button>
        </div>

        <p className="text-center text-sm text-slate-600">
          {t("noAccount")}{" "}
          <Link
            href={
              invitationToken
                ? `${ROUTES.register}?invitation=${encodeURIComponent(invitationToken)}`
                : zidInstallToken
                  ? `${ROUTES.register}?zidInstall=${encodeURIComponent(zidInstallToken)}`
                  : ROUTES.register
            }
            className="font-semibold text-violet-600 underline-offset-4 hover:underline"
          >
            {t("createAccount")}
          </Link>
        </p>
      </AppForm>
    </div>
  )
}
