import { create } from "zustand"

import type { AuthStatus, Session, User } from "../types"

interface AuthStoreState {
  user: User | null
  session: Session | null
  status: AuthStatus
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setStatus: (status: AuthStatus) => void
  authenticate: (user: User, session: Session) => void
  clear: () => void
}

const initialState = {
  user: null,
  session: null,
  status: "idle" as AuthStatus,
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  ...initialState,

  setUser: (user) => {
    set({ user })
  },

  setSession: (session) => {
    set({ session })
  },

  setStatus: (status) => {
    set({ status })
  },

  authenticate: (user, session) => {
    set({ user, session, status: "authenticated" })
  },

  clear: () => {
    set({ user: null, session: null, status: "unauthenticated" })
  },
}))
