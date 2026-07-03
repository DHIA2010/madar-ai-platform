"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { AppLoading } from "@/components/app"

import { useAuth } from "../hooks"

interface GuestRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export function GuestRoute({ children, redirectTo = ROUTES.dashboard }: GuestRouteProps) {
  const router = useRouter()
  const { authStatus } = useAuth()

  useEffect(() => {
    if (authStatus === "authenticated") {
      router.replace(redirectTo)
    }
  }, [authStatus, redirectTo, router])

  // Pre-compute conditional states
  const isLoading = useMemo(() => authStatus === "idle" || authStatus === "loading", [authStatus])

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
