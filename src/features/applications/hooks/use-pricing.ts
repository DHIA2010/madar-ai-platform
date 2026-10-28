"use client"

import { useEffect, useState } from "react"

import {
  type ApplicationPricing,
  pricingService,
  type PublicPlatformSettings,
} from "../services/pricing.service"

// Pricing and the trial length change only when Madar staff edit them -- one fetch per page load,
// shared by every marketplace component that asks.
let catalogRequest: Promise<ApplicationPricing[]> | null = null
let settingsRequest: Promise<PublicPlatformSettings> | null = null

export function usePricingCatalog(): ApplicationPricing[] | null {
  const [catalog, setCatalog] = useState<ApplicationPricing[] | null>(null)
  useEffect(() => {
    catalogRequest ??= pricingService.getCatalog().catch((error: unknown) => {
      catalogRequest = null
      throw error
    })
    let cancelled = false
    catalogRequest
      .then((next) => {
        if (!cancelled) setCatalog(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return catalog
}

export function usePublicPlatformSettings(): PublicPlatformSettings | null {
  const [settings, setSettings] = useState<PublicPlatformSettings | null>(null)
  useEffect(() => {
    settingsRequest ??= pricingService.getPublicSettings().catch((error: unknown) => {
      settingsRequest = null
      throw error
    })
    let cancelled = false
    settingsRequest
      .then((next) => {
        if (!cancelled) setSettings(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return settings
}
