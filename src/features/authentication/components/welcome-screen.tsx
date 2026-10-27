"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { useAuth } from "../hooks"

import { type Locale, localeDirection } from "@/i18n/locales"

// Shown once, right after a fresh (non-invitation) registration -- see signup-form.tsx's
// onSubmit. By the time this renders the user is already fully authenticated (register() chains
// verify+login internally, see authentication-api.adapter.ts), so "Continue to Madar" is a plain
// navigation, not another login step.
export function WelcomeScreen() {
  const t = useTranslations("auth.register.success")
  const router = useRouter()
  const { currentUser } = useAuth()
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const ArrowIcon = dir === "rtl" ? ArrowLeft : ArrowRight

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-sky-50 to-white p-6 md:p-10">
      {/* Decorative background: large soft blurred blobs + a scatter of small accent dots,
          matching auth-showcase-panel.tsx's own background treatment for visual consistency with
          the rest of the auth flow. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -start-24 size-96 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -end-24 size-96 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute end-[12%] top-[14%] size-2.5 rounded-full bg-sky-300/60" />
        <div className="absolute start-[10%] top-[30%] size-2 rounded-full bg-blue-300/50" />
        <div className="absolute end-[18%] bottom-[20%] size-3 rounded-full bg-sky-300/40" />
        <div className="absolute start-[16%] bottom-[16%] size-2 rounded-full bg-blue-300/60" />
      </div>

      <div className="relative flex w-full max-w-lg flex-col items-center gap-6">
        <Image
          src={ASSETS.logo}
          alt="مدار MADAR"
          width={778}
          height={325}
          priority
          className="h-20 w-auto"
        />

        <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/90 p-8 text-center shadow-xl backdrop-blur">
          {/* Success badge with a loose "radar ping" dot accent on either side, echoing the
              reference design's decorative arcs without needing hand-authored SVG paths. */}
          <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
            <span className="absolute start-[-14px] top-1 size-1.5 rounded-full bg-blue-300/70" />
            <span className="absolute start-[-6px] top-9 size-1 rounded-full bg-blue-300/50" />
            <span className="absolute end-[-14px] top-1 size-1.5 rounded-full bg-blue-300/70" />
            <span className="absolute end-[-6px] top-9 size-1 rounded-full bg-blue-300/50" />
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-7 w-7 text-emerald-600" strokeWidth={3} />
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900">
            {t("greeting", { name: currentUser?.fullName ?? "" })}
          </h1>
          <p className="mt-3 text-sm leading-[1.6] text-slate-600">
            {t("descriptionLine1")}
            <br />
            {t("descriptionLine2")}
          </p>

          <AppButton
            fullWidth
            size="lg"
            icon={<ArrowIcon className="size-4" />}
            iconPosition="end"
            className="mt-6 h-12 bg-gradient-to-r from-blue-600 to-blue-500 text-[15px] hover:from-blue-700 hover:to-blue-600"
            onClick={() => router.push(ROUTES.dashboard)}
          >
            {t("continueButton")}
          </AppButton>
        </div>
      </div>
    </div>
  )
}
