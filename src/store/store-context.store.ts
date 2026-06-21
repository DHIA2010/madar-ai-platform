"use client"

import { create } from "zustand"

import { getLocalStorageAdapter } from "@/lib/browser-storage"

export type ActiveStoreContext = {
  id: string
  name: string
  platform: string
  url: string
  country: string
  currency: string
}

type StoreContextState = {
  activeStore: ActiveStoreContext | null
  setActiveStore: (store: ActiveStoreContext) => void
  clearActiveStore: () => void
  loadActiveStore: () => void
}

const STORAGE_KEY = "madar-active-store-context"

export const useStoreContextStore = create<StoreContextState>((set) => ({
  activeStore: null,

  setActiveStore: (store) => {
    getLocalStorageAdapter().setItem(STORAGE_KEY, JSON.stringify(store))
    set({ activeStore: store })
  },

  clearActiveStore: () => {
    getLocalStorageAdapter().removeItem(STORAGE_KEY)
    set({ activeStore: null })
  },

  loadActiveStore: () => {
    const raw = getLocalStorageAdapter().getItem(STORAGE_KEY)
    if (!raw) {
      set({ activeStore: null })
      return
    }

    try {
      const parsed = JSON.parse(raw) as ActiveStoreContext
      if (parsed && parsed.id && parsed.name) {
        set({ activeStore: parsed })
        return
      }
    } catch {
      // Ignore invalid stored values and clear context.
    }

    getLocalStorageAdapter().removeItem(STORAGE_KEY)
    set({ activeStore: null })
  },
}))
