import { type PosEmployeeSession, posEmployeeSessionStorage } from "./pos-employee-session"

import { createApiClient } from "@/infrastructure/http"

const POS_AUTH_LOGIN_ENDPOINT = ["", "v1", "pos", "auth", "login"].join(String.fromCharCode(47))
const POS_AUTH_SESSION_ENDPOINT = ["", "v1", "pos", "auth", "session"].join(String.fromCharCode(47))
const POS_AUTH_LOGOUT_ENDPOINT = ["", "v1", "pos", "auth", "logout"].join(String.fromCharCode(47))

// Its own client (not createHttpDataClient) -- the employee token is a different auth realm
// from the main MADAR session, so it must never be sent alongside a workspace/session header
// meant for the regular app.
const client = createApiClient({
  getAuthHeaders: (): HeadersInit => {
    const session = posEmployeeSessionStorage.get()
    if (!session) {
      return {}
    }
    return { authorization: `Bearer ${session.accessToken}` }
  },
})

export const posAuthService = {
  async login(input: { email: string; password: string }): Promise<PosEmployeeSession> {
    const session = await client.post<typeof input, PosEmployeeSession>(
      POS_AUTH_LOGIN_ENDPOINT,
      input
    )
    posEmployeeSessionStorage.set(session)
    return session
  },

  async logout(): Promise<void> {
    try {
      await client.post<Record<string, never>, { loggedOut: boolean }>(POS_AUTH_LOGOUT_ENDPOINT, {})
    } finally {
      posEmployeeSessionStorage.clear()
    }
  },

  async fetchSession(): Promise<PosEmployeeSession["employee"] | null> {
    const stored = posEmployeeSessionStorage.get()
    if (!stored) return null
    try {
      const response = await client.get<{ employee: PosEmployeeSession["employee"] }>(
        POS_AUTH_SESSION_ENDPOINT
      )
      return response.employee
    } catch {
      posEmployeeSessionStorage.clear()
      return null
    }
  },
}
