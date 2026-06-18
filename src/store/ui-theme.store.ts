"use client"

import { create } from "zustand"

type UIThemeState = {
  theme: string
  setTheme: (theme: string) => void
  loadTheme: () => void
}

export const useUIThemeStore = create<UIThemeState>((set) => ({
  theme: "",

  setTheme: (theme) => {
    localStorage.setItem("ui-theme", theme)
    set({ theme })
  },

  loadTheme: () => {
    const saved = localStorage.getItem("ui-theme") || ""
    set({ theme: saved })
  },
}))