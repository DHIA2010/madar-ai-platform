"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AppError } from "@/lib/app-errors"

import { AppEmpty, AppLoading } from "@/components/app"

import { AuthContext } from "../state/auth.context"
import { useAuthStore } from "../state/auth.store"
import type { LoginRequest } from "../types"

import { useApplicationServices } from "@/application"

function getConfigurationErrorMessage(error: unknown): string | null {
  if (!(error instanceof AppError)) {
    return null
  }

  if (error.code !== "configuration_error" && error.code !== "repository_configuration_error") {
    return null
  }

  return error.message || "Runtime configuration is invalid."
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { authenticationApplicationService } = useApplicationServices()
  const [configurationError, setConfigurationError] = useState<string | null>(null)

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

        setConfigurationError(null)
        setSession(restoredSession.session)
        authenticate(restoredSession.user, restoredSession.session)
      })
      .catch((error) => {
        if (!cancelled) {
          const message = getConfigurationErrorMessage(error)
          if (message) {
            setConfigurationError(message)
            setStatus("unauthenticated")
            return
          }

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
      setConfigurationError(null)

      try {
        const result = await authenticationApplicationService.login(payload)
        authenticate(result.user, result.session)
      } catch (error) {
        const message = getConfigurationErrorMessage(error)
        if (message) {
          setConfigurationError(message)
        }
        setStatus("unauthenticated")
        throw error
      }
    },
    [authenticate, authenticationApplicationService, setStatus]
  )

  const logout = useCallback(async () => {
    try {
      await authenticationApplicationService.logout(session)
    } finally {
      clear()
      setStatus("unauthenticated")
    }
  }, [authenticationApplicationService, clear, session, setStatus])

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

  if (configurationError) {
    return <AppEmpty title="Configuration error" description={configurationError} />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
