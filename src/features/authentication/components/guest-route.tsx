"use client"

import { useEffect } from "react"
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

  if (authStatus === "idle" || authStatus === "loading") {
    return <AppLoading variant="page" />
  }

  if (authStatus === "authenticated") {
    return <AppLoading variant="page" />
  }

  return <>{children}</>
}
