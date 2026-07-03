"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"

import { ROUTES } from "@/constants/routes"

import { AppEmpty, AppLoading } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useAuth } from "../hooks"

interface ProtectedRouteProps {
  children: React.ReactNode
  redirectTo?: string
  requireWorkspace?: boolean
}

export function ProtectedRoute({
  children,
  redirectTo = ROUTES.login,
  requireWorkspace = false,
}: ProtectedRouteProps) {
  const router = useRouter()
  const { authStatus, currentUser } = useAuth()
  const { currentWorkspace, workspaceStatus } = useWorkspace()

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace(redirectTo)
    }
  }, [authStatus, redirectTo, router])

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

  // Determine what to show - always evaluate ALL conditions
  const showLoading = useMemo(
    () => isLoading || isUnauthenticated || isWorkspaceLoading || isWorkspaceMissing,
    [isLoading, isUnauthenticated, isWorkspaceLoading, isWorkspaceMissing]
  )

  const showError = useMemo(
    () => hasNoUser && !isLoading && !isUnauthenticated && !isWorkspaceLoading,
    [hasNoUser, isLoading, isUnauthenticated, isWorkspaceLoading]
  )

  const showContent = useMemo(() => !showLoading && !showError, [showLoading, showError])

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
