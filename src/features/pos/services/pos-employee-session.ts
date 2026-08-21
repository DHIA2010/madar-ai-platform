// POS employees are a separate identity plane from MADAR users (see
// src/identity-platform/pos) -- their token is stored under its own key, never mixed with the
// main app's session storage.
const STORAGE_KEY = "pos-employee-session"

export interface PosEmployeeSession {
  accessToken: string
  accessTokenExpiresAt: string
  employee: {
    id: string
    fullName: string
    email: string
    organizationId: string
    posRoleId: string | null
    posRoleName: string | null
  }
}

export const posEmployeeSessionStorage = {
  get(): PosEmployeeSession | null {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as PosEmployeeSession
    } catch {
      return null
    }
  },

  set(session: PosEmployeeSession) {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  },

  clear() {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(STORAGE_KEY)
  },
}
