"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Link2 } from "lucide-react"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppCard } from "@/components/app"

import { useApplicationServices } from "@/application"

interface ZidAutoLoginHandoffProps {
  handoffToken: string
}

// This page's entire job is "log the merchant in and leave immediately" -- there's no form, no
// button, nothing for a person to do here. On success it hard-navigates (not router.push) to the
// destination: the session was just persisted to storage by consumeZidAutoLogin, and a full page
// load is what makes AuthProvider's own mount-time restore pick it up, exactly as if the merchant
// had just logged in and refreshed -- no separate client-state hydration path to add or maintain.
export function ZidAutoLoginHandoff({ handoffToken }: ZidAutoLoginHandoffProps) {
  const t = useTranslations("auth.zidAutoLogin")
  const { authenticationApplicationService } = useApplicationServices()
  const [failed, setFailed] = useState(false)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    async function run() {
      try {
        const result = await authenticationApplicationService.consumeZidAutoLogin(handoffToken)
        window.location.href = result.redirectUrl
      } catch {
        setFailed(true)
      }
    }

    void run()
  }, [authenticationApplicationService, handoffToken])

  return (
    <div className="bg-muted flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-center gap-2 font-medium">
            <Image
              src={ASSETS.logo}
              alt="مدار MADAR"
              width={778}
              height={325}
              priority
              className="h-14 w-auto"
            />
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
            {failed ? (
              <AppCard
                title={t("errorHeading")}
                subtitle={t("errorDescription")}
                icon={<Link2 className="h-6 w-6" />}
              >
                <Link href={ROUTES.login} className="text-sm font-medium text-violet-600 underline">
                  {t("goToLogin")}
                </Link>
              </AppCard>
            ) : (
              <AppCard state="loading" title={t("loading")} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
