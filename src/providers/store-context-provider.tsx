"use client"

import { useEffect } from "react"

import { useStoreContextStore } from "@/store/store-context.store"

export default function StoreContextProvider({ children }: { children: React.ReactNode }) {
  const loadActiveStore = useStoreContextStore((state) => state.loadActiveStore)

  useEffect(() => {
    loadActiveStore()
  }, [loadActiveStore])

  return <>{children}</>
}
