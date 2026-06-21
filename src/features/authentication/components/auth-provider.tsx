"use client"

import { useCallback, useEffect, useMemo } from "react"

import { AppEmpty, AppLoading } from "@/components/app"

import { AuthContext } from "../state/auth.context"
import { useAuthStore } from "../state/auth.store"
import type { LoginRequest } from "../types"

import { useApplicationServices } from "@/application"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { authenticationApplicationService } = useApplicationServices()

  const user = useAuthStore((state) => state.user)
  const session = useAuthStore((state) => state.session)
  const authStatus = useAuthStore((state) => state.status)
  const setSession = useAuthStore((state) => state.setSession)
  const setStatus = useAuthStore((state) => state.setStatus)
  const authenticate = useAuthStore((state) => state.authenticate)
  const clear = useAuthStore((state) => state.clear)

  useEffect(() => {
    let cancelled = false

    setStatus("loading")

    void authenticationApplicationService
      .restoreSession()
      .then((restoredSession) => {
        if (cancelled) {
          return
        }

        if (!restoredSession) {
          setStatus("unauthenticated")
          return
        }

        setSession(restoredSession.session)
        authenticate(restoredSession.user, restoredSession.session)
      })
      .catch(() => {
        if (!cancelled) {
          clear()
        }
      })

    return () => {
      cancelled = true
    }
  }, [authenticate, authenticationApplicationService, clear, setSession, setStatus])

  const login = useCallback(
    async (payload: LoginRequest) => {
      setStatus("loading")

      try {
        const result = await authenticationApplicationService.login(payload)
        authenticate(result.user, result.session)
      } catch (error) {
        setStatus("unauthenticated")
        throw error
      }
    },
    [authenticate, authenticationApplicationService, setStatus]
  )

  const logout = useCallback(async () => {
    await authenticationApplicationService.logout(session)
    clear()
  }, [authenticationApplicationService, clear, session])

  const value = useMemo(
    () => ({
      currentUser: user,
      authStatus,
      login,
      logout,
    }),
    [authStatus, login, logout, user]
  )

  if (authStatus === "idle" || authStatus === "loading") {
    return <AppLoading variant="page" />
  }

  if (authStatus === "authenticated" && !user) {
    return (
      <AppEmpty title="Unable to restore session" description="Please sign in again to continue." />
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
