"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { CheckCircle2, Link2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard } from "@/components/app"

import { useAuth } from "../hooks"

import { useApplicationServices } from "@/application"

interface ZidMarketplaceInstallClaimProps {
  claimToken: string
}

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; storeName: string; alreadyClaimed: boolean }

export function ZidMarketplaceInstallClaim({ claimToken }: ZidMarketplaceInstallClaimProps) {
  const t = useTranslations("auth.zidClaim")
  const { authenticationApplicationService } = useApplicationServices()
  const { authStatus } = useAuth()

  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<{ storeName: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      setLoad({ status: "loading" })
      try {
        const summary =
          await authenticationApplicationService.getZidMarketplaceInstallSummary(claimToken)
        if (cancelled) return
        setLoad({
          status: "ready",
          storeName: summary.storeName,
          alreadyClaimed: summary.status !== "unclaimed",
        })
      } catch {
        if (cancelled) return
        setLoad({ status: "not-found" })
      }
    }

    void loadSummary()

    return () => {
      cancelled = true
    }
  }, [claimToken, authenticationApplicationService])

  async function handleConfirm() {
    setIsConfirming(true)
    setConfirmError(null)
    try {
      await authenticationApplicationService.claimZidMarketplaceInstall(claimToken)
      if (load.status === "ready") {
        setClaimed({ storeName: load.storeName })
      }
    } catch {
      setConfirmError(t("errorDescription"))
    } finally {
      setIsConfirming(false)
    }
  }

  const isAuthenticated = authStatus === "authenticated"

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
            {load.status === "loading" ? (
              <AppCard state="loading" title={t("loading")} />
            ) : load.status === "not-found" ? (
              <AppCard
                title={t("notFoundHeading")}
                subtitle={t("notFoundDescription")}
                icon={<Link2 className="h-6 w-6" />}
              />
            ) : claimed ? (
              <AppCard
                title={t("successHeading")}
                subtitle={t("successDescription", { storeName: claimed.storeName })}
                icon={<CheckCircle2 className="h-6 w-6" />}
              >
                <AppButton fullWidth asChild>
                  <Link href={ROUTES.integrations}>{t("goToIntegrations")}</Link>
                </AppButton>
              </AppCard>
            ) : load.alreadyClaimed ? (
              <AppCard
                title={t("alreadyClaimedHeading")}
                subtitle={t("alreadyClaimedDescription")}
                icon={<CheckCircle2 className="h-6 w-6" />}
              >
                <AppButton fullWidth asChild>
                  <Link href={ROUTES.integrations}>{t("goToIntegrations")}</Link>
                </AppButton>
              </AppCard>
            ) : (
              <AppCard
                title={t("connectHeading")}
                subtitle={t("connectDescription", { storeName: load.storeName })}
                icon={<Link2 className="h-6 w-6" />}
              >
                <div className={cn("grid gap-3")}>
                  {isAuthenticated ? (
                    <>
                      {confirmError ? (
                        <p className="text-center text-sm text-destructive">{confirmError}</p>
                      ) : null}
                      <AppButton
                        fullWidth
                        loading={isConfirming}
                        onClick={() => void handleConfirm()}
                      >
                        {isConfirming ? t("confirming") : t("confirmCta")}
                      </AppButton>
                    </>
                  ) : (
                    <>
                      <AppButton fullWidth asChild>
                        <Link href={`${ROUTES.login}?zidInstall=${encodeURIComponent(claimToken)}`}>
                          {t("loginCta")}
                        </Link>
                      </AppButton>
                      <AppButton fullWidth variant="outline" asChild>
                        <Link
                          href={`${ROUTES.register}?zidInstall=${encodeURIComponent(claimToken)}`}
                        >
                          {t("registerCta")}
                        </Link>
                      </AppButton>
                    </>
                  )}
                </div>
              </AppCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
