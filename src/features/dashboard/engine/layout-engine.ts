import { DASHBOARD_SLOT_ORDER } from "../constants"
import { mapResponsiveBehaviorToClassName } from "../mappers"
import type { DashboardPackage, ResolvedDashboardLayoutItem } from "../types"

export function generateDashboardLayout(
  dashboardPackage: DashboardPackage
): ResolvedDashboardLayoutItem[] {
  return [...dashboardPackage.layout]
    .sort((left, right) => {
      const slotDelta = DASHBOARD_SLOT_ORDER[left.zone] - DASHBOARD_SLOT_ORDER[right.zone]
      if (slotDelta !== 0) {
        return slotDelta
      }

      return left.order - right.order
    })
    .map((item) => ({
      ...item,
      className: mapResponsiveBehaviorToClassName(item.responsive),
    }))
}
