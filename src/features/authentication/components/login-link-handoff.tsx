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

// The workspace store persists the last selected organization/workspace ("workspace-context") --
// left in place, a browser that was signed in to another account restores *that* account's
// workspace for this one, and every workspace-scoped request fails. The fresh page load then
// resolves this account's own workspace.
function forgetPreviousWorkspace() {
  try {
    window.localStorage.removeItem("workspace-context")
  } catch {
    // Storage unavailable (private mode) -- nothing persisted to forget.
  }
}

interface LoginLinkHandoffProps {
  token: string
}

// Opened from an e-mailed one-click sign-in link (e.g. the Salla App Store welcome): signs in the
// account the link belongs to -- replacing whichever account this browser was signed in to -- then
// hard-navigates on, so AuthProvider restores the new session on a fresh page load (same as
// ZidAutoLoginHandoff).
export function LoginLinkHandoff({ token }: LoginLinkHandoffProps) {
  const t = useTranslations("auth.loginLink")
  const { authenticationApplicationService } = useApplicationServices()
  const [failed, setFailed] = useState(false)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    async function run() {
      try {
        const result = await authenticationApplicationService.consumeLoginLink(token)
        forgetPreviousWorkspace()
        window.location.href = result.redirectUrl
      } catch {
        setFailed(true)
      }
    }

    void run()
  }, [authenticationApplicationService, token])

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
