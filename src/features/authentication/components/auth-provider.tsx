"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AppError, ValidationError } from "@/lib/app-errors"
import { fileToBase64 } from "@/lib/file-to-base64"

import { AppEmpty, AppLoading } from "@/components/app"

import { AuthContext } from "../state/auth.context"
import { useAuthStore } from "../state/auth.store"
import type { LoginRequest, RegisterRequest, UpdateProfileRequest } from "../types"

import { useApplicationServices } from "@/application"

const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const MAX_AVATAR_BYTES = 3 * 1024 * 1024

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
  // Tracks only the one-time initial session check on app boot -- distinct from authStatus,
  // which also flips to "loading" on every later login()/register() call. Gating the
  // full-page loading screen on authStatus alone (as this used to) meant every login/register
  // attempt unmounted the entire app (including the form's own local error state) while the
  // request was in flight, silently discarding whatever error message a failed attempt set
  // right before the remount. hasRestoredOnce keeps that full-page gate scoped to app boot only.
  const [hasRestoredOnce, setHasRestoredOnce] = useState(false)

  const user = useAuthStore((state) => state.user)
  const session = useAuthStore((state) => state.session)
  const authStatus = useAuthStore((state) => state.status)
  const setSession = useAuthStore((state) => state.setSession)
  const setStatus = useAuthStore((state) => state.setStatus)
  const setUser = useAuthStore((state) => state.setUser)
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
      .finally(() => {
        if (!cancelled) {
          setHasRestoredOnce(true)
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

  const register = useCallback(
    async (payload: RegisterRequest) => {
      setStatus("loading")
      setConfigurationError(null)

      try {
        const result = await authenticationApplicationService.register(payload)
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

  const updateProfile = useCallback(
    async (payload: UpdateProfileRequest) => {
      const updated = await authenticationApplicationService.updateProfile(payload)
      if (user) {
        setUser({ ...user, fullName: updated.fullName })
      }
    },
    [authenticationApplicationService, setUser, user]
  )

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
        throw new ValidationError({
          code: "avatar_invalid_type",
          message: "Please choose a PNG, JPEG, WEBP, or GIF image.",
        })
      }
      if (file.size > MAX_AVATAR_BYTES) {
        throw new ValidationError({
          code: "avatar_too_large",
          message: "Images must be 3MB or smaller.",
        })
      }

      const dataBase64 = await fileToBase64(file)
      const updated = await authenticationApplicationService.uploadAvatar({
        contentType: file.type,
        dataBase64,
      })
      if (user) {
        setUser({ ...user, avatarUrl: updated.avatarUrl })
      }
    },
    [authenticationApplicationService, setUser, user]
  )

  const removeAvatar = useCallback(async () => {
    const updated = await authenticationApplicationService.removeAvatar()
    if (user) {
      setUser({ ...user, avatarUrl: updated.avatarUrl })
    }
  }, [authenticationApplicationService, setUser, user])

  // The backend revokes every other active session on a successful change (see
  // identity-platform's changePassword command handler) and there's no exclusion of the
  // current one -- callers should treat a successful call as "the current session may now be
  // stale" and redirect to login themselves, this just performs the change.
  const changePassword = useCallback(
    async (payload: { currentPassword: string; newPassword: string }) => {
      await authenticationApplicationService.changePassword(payload)
    },
    [authenticationApplicationService]
  )

  const value = useMemo(
    () => ({
      currentUser: user,
      authStatus,
      login,
      register,
      logout,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      changePassword,
    }),
    [
      authStatus,
      login,
      register,
      logout,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      changePassword,
      user,
    ]
  )

  if (!hasRestoredOnce) {
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
