"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
import { safeNextPath } from "../utils/safe-next-path"
import { type LoginFormValues, loginSchema } from "../validators"
import { GoogleSignInButton } from "./google-sign-in-button"

import { useApplicationServices } from "@/application"

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const { login, authStatus } = useAuth()
  const { authenticationApplicationService } = useApplicationServices()
  const [formError, setFormError] = useState<string | null>(null)
  const t = useTranslations("auth.login")
  const router = useRouter()
  const searchParams = useSearchParams()
  const invitationToken = searchParams.get("invitation")
  const zidInstallToken = searchParams.get("zidInstall")
  const nextPath = safeNextPath(searchParams.get("next"))
  const tGoogle = useTranslations("auth.google")
  // "Continue with Google" comes back here with ?error=google_<reason> when it can't sign in.
  const googleError = searchParams.get("error")
  const googleErrorReason = googleError?.startsWith("google_")
    ? googleError.slice("google_".length)
    : null
  const googleErrorMessage = googleErrorReason
    ? ["unverified_email", "no_membership", "unavailable"].includes(googleErrorReason)
      ? tGoogle(`errors.${googleErrorReason}`)
      : tGoogle("errors.failed")
    : null

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
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
      setFormError(
        code === "PLATFORM_MAINTENANCE"
          ? t("maintenanceMode")
          : error instanceof Error
            ? error.message
            : t("genericError")
      )
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
      // GuestRoute skips its own post-auth redirect whenever ?zidInstall is present (see
      // guest-route.tsx) specifically so this call can finish and send the merchant straight to
      // "service ready" instead of a generic dashboard -- required by Zid's app-activation
      // policy. A failed claim still needs an explicit destination since that default redirect
      // is disabled for this case.
      try {
        const result =
          await authenticationApplicationService.claimZidMarketplaceInstall(zidInstallToken)
        toast.success(t("zidInstallClaimed"))
        router.push(result.redirectUrl)
      } catch {
        toast.error(t("zidInstallClaimError"))
        router.push(ROUTES.dashboard)
      }
      return
    }

    if (nextPath) {
      // GuestRoute skips its own post-auth redirect whenever ?next is present (same reasoning
      // as ?zidInstall above), so this page owns sending the visitor back to whatever protected
      // page ProtectedRoute originally bounced them from -- otherwise the reason they landed on
      // login (e.g. a Zid OAuth error) is lost the moment the default dashboard redirect fires.
      router.push(nextPath)
    }
  })

  return (
    <div className={cn("flex w-full max-w-lg flex-col gap-4", className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <Image
          src={ASSETS.logo}
          alt="مدار MADAR"
          width={778}
          height={325}
          priority
          className="h-9 w-auto"
        />
        <div className="space-y-0.5">
          <h1 className="text-lg font-bold text-slate-900">{t("heading")}</h1>
          <p className="text-[12.5px] text-slate-500">{t("subheading")}</p>
        </div>
      </div>

      {invitationToken ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[13px] text-blue-700">
          {t("invitationBanner")}
        </div>
      ) : null}

      {zidInstallToken ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[13px] text-blue-700">
          {t("zidInstallBanner")}
        </div>
      ) : null}

      {googleErrorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700"
        >
          {googleErrorMessage}
        </div>
      ) : null}

      <AppForm
        onSubmit={onSubmit}
        className="space-y-3 [&_input]:h-11 [&_input]:bg-white [&_input]:text-[15px]"
      >
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
            className="font-medium text-blue-600 underline-offset-4 hover:underline"
          >
            {t("forgotPassword")}
          </Link>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <AppButton
          type="submit"
          fullWidth
          loading={form.formState.isSubmitting || authStatus === "loading"}
          className="h-11 bg-gradient-to-l from-blue-600 to-sky-500 text-[15px] font-semibold shadow-md shadow-blue-600/20 hover:from-blue-500 hover:to-sky-400"
        >
          {t("submit")}
        </AppButton>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          {t("orContinueWith")}
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <GoogleSignInButton />

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
            className="font-semibold text-blue-600 underline-offset-4 hover:underline"
          >
            {t("createAccount")}
          </Link>
        </p>
      </AppForm>
    </div>
  )
}
