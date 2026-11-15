"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { zodResolver } from "@hookform/resolvers/zod"
import { Building2, Lock, Mail, Phone, User } from "lucide-react"
import { type Resolver, useForm } from "react-hook-form"
import { toast } from "sonner"

import { pushDataLayerEvent } from "@/lib/data-layer"
import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppForm, AppInput, AppPasswordInput } from "@/components/app"

import { useAuth } from "../hooks"
import { safeNextPath } from "../utils/safe-next-path"
import {
  normalizePhone,
  type SignupFormValues,
  signupInvitationSchema,
  signupSchema,
} from "../validators"
import { GoogleSignInButton } from "./google-sign-in-button"

import { useApplicationServices } from "@/application"

// A phone number reads left to right even on the Arabic page, with its icon staying where the
// other fields have theirs.
const PHONE_INPUT_CLASSNAME = "rtl:[direction:ltr] rtl:!pr-9 rtl:!pl-3 rtl:text-right"

export function SignupForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const { register } = useAuth()
  const { authenticationApplicationService } = useApplicationServices()
  const router = useRouter()
  const searchParams = useSearchParams()
  const invitationToken = searchParams.get("invitation")
  const invitationEmail = searchParams.get("email") ?? ""
  // A suggested name the inviting admin typed in -- pre-filled but never locked (unlike email,
  // there's no security reason to stop the invitee from correcting or replacing it).
  const invitationFullName = searchParams.get("fullName") ?? ""
  const isInvitationMode = Boolean(invitationToken)
  // Deliberately independent of isInvitationMode -- a marketplace-install visitor isn't
  // joining an existing org, they need one created for them same as any normal signup
  // (company name and all), just with a claim call appended on success.
  const zidInstallToken = searchParams.get("zidInstall")
  const nextPath = safeNextPath(searchParams.get("next"))
  // The email only arrives pre-filled when the invite link itself carried it (the normal
  // case). If someone reaches this page via a token-only link (e.g. from the login
  // page's "create account" link), there's no known email to lock in — let them type it;
  // the server still rejects it if it doesn't match the invitation.
  const isEmailLocked = isInvitationMode && Boolean(invitationEmail)

  const [formError, setFormError] = useState<string | null>(null)
  const t = useTranslations("auth.register")
  const locale = useLocale()

  const resolver = useMemo(
    () =>
      zodResolver(
        isInvitationMode ? signupInvitationSchema : signupSchema
      ) as unknown as Resolver<SignupFormValues>,
    [isInvitationMode]
  )

  const form = useForm<SignupFormValues>({
    resolver,
    defaultValues: {
      fullName: invitationFullName,
      email: invitationEmail,
      password: "",
      confirmPassword: "",
      companyName: "",
      phone: "",
    },
  })

  const onSubmit = form.handleSubmit(async (formValues) => {
    setFormError(null)
    try {
      await register({
        fullName: formValues.fullName,
        email: formValues.email,
        password: formValues.password,
        organizationName: isInvitationMode ? undefined : formValues.companyName?.trim(),
        phone: isInvitationMode || !formValues.phone ? undefined : normalizePhone(formValues.phone),
        invitationToken: invitationToken ?? undefined,
      })
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
      if (isInvitationMode && code.toLowerCase().includes("email_exists")) {
        setFormError(t("invitationAccountExists"))
        return
      }
      if (code === "SIGNUPS_CLOSED" || code === "PLATFORM_MAINTENANCE") {
        setFormError(t(code === "SIGNUPS_CLOSED" ? "signupsClosed" : "maintenanceMode"))
        return
      }
      setFormError(error instanceof Error ? error.message : t("genericError"))
      return
    }

    // A new Madar account, for the ad platforms (see lib/data-layer.ts). Joining someone else's
    // organization through an invitation is not one.
    if (!isInvitationMode) pushDataLayerEvent("sign_up", { method: "email" })

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
      // page ProtectedRoute originally bounced them from.
      router.push(nextPath)
      return
    }

    if (isInvitationMode) {
      // Joining an existing organization via a team invite isn't "your account has been
      // created, welcome to Madar" the way a fresh signup is -- GuestRoute's own default
      // redirect only backs off for ?zidInstall/?next, not this case, so send them to the
      // dashboard explicitly rather than relying on it.
      router.push(ROUTES.dashboard)
      return
    }

    // Plain signup (new organization, no Zid install, no bounced-from-a-protected-page
    // redirect): GuestRoute skips its own default redirect for the register page specifically
    // (see guest-route.tsx's isRegisterPage), so this page owns sending a freshly-registered --
    // and, per register()'s own chain, already-authenticated -- user to the Welcome screen
    // instead of straight to the dashboard.
    router.push(ROUTES.welcome)
  })

  const signInHref = invitationToken
    ? `${ROUTES.login}?invitation=${encodeURIComponent(invitationToken)}`
    : zidInstallToken
      ? `${ROUTES.login}?zidInstall=${encodeURIComponent(zidInstallToken)}`
      : ROUTES.login
  const errors = form.formState.errors

  return (
    <div className={cn("flex w-full max-w-[34rem] flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          src={ASSETS.logo}
          alt="مدار MADAR"
          width={778}
          height={325}
          priority
          className="h-11 w-auto"
        />
        <div className="space-y-1.5">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight text-slate-900">
            {t("heading")}
          </h1>
          <p className="text-[15px] text-slate-500">{t("subheading")}</p>
        </div>
      </div>

      {isInvitationMode ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {t("invitationBanner")}
        </div>
      ) : null}

      {zidInstallToken ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {t("zidInstallBanner")}
        </div>
      ) : null}

      {isInvitationMode ? null : (
        <div className="flex flex-col gap-4 [&_a]:h-12 [&_a]:rounded-xl [&_a]:text-[15px]">
          <GoogleSignInButton />
          <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            {t("orWithEmail")}
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>
      )}

      <AppForm
        onSubmit={onSubmit}
        noValidate
        className="space-y-4 [&_input]:h-12 [&_input]:rounded-xl [&_input]:bg-white [&_input]:text-[15px]"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AppInput
            label={t("fullNameLabel")}
            placeholder={t("fullNamePlaceholder")}
            autoComplete="name"
            startIcon={<User className="size-4" />}
            errorText={errors.fullName?.message}
            required
            {...form.register("fullName")}
          />

          {isInvitationMode ? null : (
            <AppInput
              label={t("companyNameLabel")}
              placeholder={t("companyNamePlaceholder")}
              autoComplete="organization"
              startIcon={<Building2 className="size-4" />}
              errorText={errors.companyName?.message}
              required
              {...form.register("companyName")}
            />
          )}

          {isInvitationMode ? null : (
            <AppInput
              type="tel"
              inputMode="tel"
              label={t("phoneLabel")}
              placeholder={t("phonePlaceholder")}
              autoComplete="tel"
              startIcon={<Phone className="size-4" />}
              errorText={errors.phone?.message}
              className={PHONE_INPUT_CLASSNAME}
              required
              {...form.register("phone")}
            />
          )}

          <AppInput
            type="email"
            label={t("emailLabel")}
            placeholder={t("emailPlaceholder")}
            helperText={isEmailLocked ? t("invitationEmailLocked") : undefined}
            autoComplete="email"
            startIcon={<Mail className="size-4" />}
            errorText={errors.email?.message}
            readOnly={isEmailLocked}
            required
            {...form.register("email")}
          />

          <AppPasswordInput
            label={t("passwordLabel")}
            placeholder={t("passwordPlaceholder")}
            autoComplete="new-password"
            startIcon={<Lock className="size-4" />}
            errorText={errors.password?.message}
            helperText={t("passwordHelper")}
            required
            {...form.register("password")}
          />

          <AppPasswordInput
            label={t("confirmPasswordLabel")}
            placeholder={t("confirmPasswordPlaceholder")}
            autoComplete="new-password"
            startIcon={<Lock className="size-4" />}
            errorText={errors.confirmPassword?.message}
            required
            {...form.register("confirmPassword")}
          />
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {formError}{" "}
            {isInvitationMode ? (
              <Link href={signInHref} className="font-semibold underline underline-offset-4">
                {t("signIn")}
              </Link>
            ) : null}
          </p>
        ) : null}

        <AppButton
          type="submit"
          fullWidth
          loading={form.formState.isSubmitting}
          className="h-12 rounded-xl bg-gradient-to-l from-blue-600 to-sky-500 text-base font-semibold shadow-lg shadow-blue-600/25 hover:from-blue-500 hover:to-sky-400"
        >
          {t("submit")}
        </AppButton>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          {t("consentPrefix")}{" "}
          <Link
            href={locale === "en" ? ROUTES.termsEnglish : ROUTES.terms}
            className="font-medium text-slate-700 underline-offset-4 hover:underline"
          >
            {t("termsAndConditions")}
          </Link>{" "}
          {t("and")}{" "}
          <Link
            href={ROUTES.privacy}
            className="font-medium text-slate-700 underline-offset-4 hover:underline"
          >
            {t("privacyPolicy")}
          </Link>
        </p>
      </AppForm>

      <p className="border-t border-slate-200 pt-5 text-center text-[15px] text-slate-600">
        {t("alreadyHaveAccount")}{" "}
        <Link
          href={signInHref}
          className="font-semibold text-blue-600 underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  )
}
