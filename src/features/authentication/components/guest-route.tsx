"use client"

import { useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { AppLoading } from "@/components/app"

import { useAuth } from "../hooks"

interface GuestRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export function GuestRoute({ children, redirectTo = ROUTES.dashboard }: GuestRouteProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { authStatus } = useAuth()
  // A Zid marketplace-install claim in progress (?zidInstall=...) owns its own post-auth
  // navigation once claimZidMarketplaceInstall() resolves (login-form.tsx/signup-form.tsx) --
  // this default redirect would otherwise race that in-flight call and briefly land the merchant
  // on the generic dashboard before being sent to the real destination, which is exactly the
  // "generic homepage" landing Zid's app-activation policy rejects.
  const hasZidInstall = Boolean(searchParams.get("zidInstall"))
  // Same race, general case: ProtectedRoute attaches ?next= when it bounces an unauthenticated
  // visitor here, and login-form/signup-form push to it once auth resolves -- this default
  // redirect must not beat that push to the dashboard.
  const hasNext = Boolean(searchParams.get("next"))

  useEffect(() => {
    if (authStatus === "authenticated" && !hasZidInstall && !hasNext) {
      router.replace(redirectTo)
    }
  }, [authStatus, hasZidInstall, hasNext, redirectTo, router])

  // "loading" also covers an in-flight login()/register() call from this same page, not just
  // the initial session check (AuthProvider already blocks rendering until that first check
  // resolves, so authStatus can never actually be "idle" here) -- treating it as page-loading
  // would unmount the login/register form (and whatever error it just set) the moment a submit
  // starts, so only "idle" gates this loading screen.
  const isLoading = useMemo(() => authStatus === "idle", [authStatus])

  const isAuthenticated = useMemo(() => authStatus === "authenticated", [authStatus])

  // Determine what to show - always evaluate ALL conditions
  const showLoading = useMemo(() => isLoading || isAuthenticated, [isLoading, isAuthenticated])

  const showContent = useMemo(() => !showLoading, [showLoading])

  // ALWAYS render the same component tree - only conditionally show content
  // This ensures React's hook count never changes
  return (
    <>
      {showLoading && <AppLoading variant="page" />}
      {showContent && <>{children}</>}
    </>
  )
}
