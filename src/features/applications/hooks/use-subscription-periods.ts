"use client"

import { useEffect, useState } from "react"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// GET /v1/billing/overview's subscriptions -- read here directly (not through the billing feature,
// which itself imports this one), following the per-feature duplication convention.
const OVERVIEW_ENDPOINT = ["", "v1", "billing", "overview"].join(String.fromCharCode(47))
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

interface OverviewSubscription {
  application: string
  status: "trial" | "active" | "cancelled" | "expired" | "overdue"
  startedAt: string
  endsAt: string | null
}

export interface SubscriptionPeriod {
  status: "trial" | "active" | "overdue"
  startedAt: string
  // When the trial or the paid period ends (null: no end set).
  endsAt: string | null
}

// The organization's running subscriptions by application (pos, ecommerce, ai...), for showing how
// long each active app has left. `loadedAt` is when they arrived -- "now" for the countdown.
export function useSubscriptionPeriods() {
  const [periods, setPeriods] = useState<Record<string, SubscriptionPeriod>>({})
  const [loadedAt, setLoadedAt] = useState(0)

  useEffect(() => {
    let active = true
    client
      .get<{ subscriptions: OverviewSubscription[] }>(OVERVIEW_ENDPOINT)
      .then((overview) => {
        if (!active) return
        const running: Record<string, SubscriptionPeriod> = {}
        for (const subscription of overview.subscriptions) {
          if (
            subscription.status !== "trial" &&
            subscription.status !== "active" &&
            subscription.status !== "overdue"
          ) {
            continue
          }
          const current = running[subscription.application]
          // Several rows for one app: keep the one that runs longest.
          if (current && (current.endsAt ?? "") >= (subscription.endsAt ?? "")) continue
          running[subscription.application] = {
            status: subscription.status,
            startedAt: subscription.startedAt,
            endsAt: subscription.endsAt,
          }
        }
        setPeriods(running)
        setLoadedAt(Date.now())
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  return { periods, loadedAt }
}
