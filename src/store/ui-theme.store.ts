"use client"

import { create } from "zustand"

type UIThemeState = {
  isCustomizerOpen: boolean
  previewTheme: string | null
  setCustomizerOpen: (open: boolean) => void
  setPreviewTheme: (theme: string | null) => void
}

export const useUIThemeStore = create<UIThemeState>((set) => ({
  isCustomizerOpen: false,
  previewTheme: null,
  setCustomizerOpen: (open) => set({ isCustomizerOpen: open }),
  setPreviewTheme: (theme) => set({ previewTheme: theme }),
}))
