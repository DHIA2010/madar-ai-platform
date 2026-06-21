"use client"

import { useEffect } from "react"
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

  if (authStatus === "idle" || authStatus === "loading") {
    return <AppLoading variant="page" />
  }

  if (authStatus === "unauthenticated") {
    return <AppLoading variant="page" />
  }

  if (requireWorkspace && (workspaceStatus === "idle" || workspaceStatus === "loading")) {
    return <AppLoading variant="page" />
  }

  if (requireWorkspace && !currentWorkspace) {
    return <AppLoading variant="page" />
  }

  if (!currentUser) {
    return <AppEmpty title="No active user" description="Sign in again to access this section." />
  }

  return <>{children}</>
}
