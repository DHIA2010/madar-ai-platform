"use client"

import { useEffect, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { AppEmpty, AppLoading } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useAuth } from "../hooks"

interface ProtectedRouteProps {
  children: React.ReactNode
  redirectTo?: string
  requireWorkspace?: boolean
  // Madar Admin console gate (see src/app/(madar-admin)/layout.tsx) -- unrelated to any
  // organization's own permission taxonomy, so it doesn't fit <RouteAccessGuard>/<Can>.
  requirePlatformAdmin?: boolean
}

export function ProtectedRoute({
  children,
  redirectTo = ROUTES.login,
  requireWorkspace = false,
  requirePlatformAdmin = false,
}: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { authStatus, currentUser } = useAuth()
  const { currentWorkspace, workspaceStatus } = useWorkspace()

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      // Carry the page the visitor was actually trying to reach through login as ?next= --
      // without this, a bounce to login silently drops whatever brought them here (query params
      // included), which is exactly what turned a Zid OAuth error into an unexplained blank
      // login page: the error redirect landed here first, then this replace wiped it.
      const query = searchParams.toString()
      const current = `${pathname}${query ? `?${query}` : ""}`
      const separator = redirectTo.includes("?") ? "&" : "?"
      router.replace(`${redirectTo}${separator}next=${encodeURIComponent(current)}`)
    }
  }, [authStatus, redirectTo, router, pathname, searchParams])

  useEffect(() => {
    if (
      authStatus === "authenticated" &&
      requireWorkspace &&
      workspaceStatus !== "loading" &&
      workspaceStatus !== "switching" &&
      !currentWorkspace
    ) {
      router.replace(ROUTES.workspaceSelect)
    }
  }, [authStatus, currentWorkspace, requireWorkspace, router, workspaceStatus])

  useEffect(() => {
    if (authStatus === "authenticated" && requirePlatformAdmin && !currentUser?.isPlatformAdmin) {
      router.replace(ROUTES.dashboard)
    }
  }, [authStatus, currentUser?.isPlatformAdmin, requirePlatformAdmin, router])

  // Pre-compute all conditional states
  const isLoading = useMemo(() => authStatus === "idle" || authStatus === "loading", [authStatus])

  const isUnauthenticated = useMemo(() => authStatus === "unauthenticated", [authStatus])

  const isWorkspaceLoading = useMemo(
    () => requireWorkspace && (workspaceStatus === "idle" || workspaceStatus === "loading"),
    [requireWorkspace, workspaceStatus]
  )

  const isWorkspaceMissing = useMemo(
    () => requireWorkspace && !currentWorkspace,
    [requireWorkspace, currentWorkspace]
  )

  const hasNoUser = useMemo(() => !currentUser, [currentUser])

  // True the whole time a non-staff visitor is authenticated-but-not-platform-admin -- keeps
  // showLoading covering this case too, so children never flash before the redirect effect above
  // fires (there's nothing to "wait for" the way workspace loading has a real pending state, but
  // the shape is the same: don't render children on the way out).
  const isForbiddenPlatformAdmin = useMemo(
    () => requirePlatformAdmin && authStatus === "authenticated" && !currentUser?.isPlatformAdmin,
    [authStatus, currentUser?.isPlatformAdmin, requirePlatformAdmin]
  )

  // Determine what to show - always evaluate ALL conditions
  const showLoading = useMemo(
    () => isLoading || isWorkspaceLoading || isWorkspaceMissing || isForbiddenPlatformAdmin,
    [isForbiddenPlatformAdmin, isLoading, isWorkspaceLoading, isWorkspaceMissing]
  )

  const showError = useMemo(
    () => hasNoUser && !isLoading && !isUnauthenticated && !isWorkspaceLoading,
    [hasNoUser, isLoading, isUnauthenticated, isWorkspaceLoading]
  )

  const showContent = useMemo(
    () => !showLoading && !showError && !isUnauthenticated,
    [showLoading, showError, isUnauthenticated]
  )

  // ALWAYS render the same component tree - only conditionally show content
  // This ensures React's hook count never changes
  return (
    <>
      {showLoading && <AppLoading variant="page" />}
      {showError && (
        <AppEmpty title="No active user" description="Sign in again to access this section." />
      )}
      {showContent && <>{children}</>}
    </>
  )
}
