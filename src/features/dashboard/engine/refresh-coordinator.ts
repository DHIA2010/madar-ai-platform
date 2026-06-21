import type { DashboardRefreshReason, WidgetRefreshPolicy } from "../types"

export function shouldRefreshWidget(
  policy: WidgetRefreshPolicy,
  reason: DashboardRefreshReason
): boolean {
  return policy.triggers.includes(reason)
}

export function createRefreshVersion(previousVersion: number) {
  return previousVersion + 1
}
