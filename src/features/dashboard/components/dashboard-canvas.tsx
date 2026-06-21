"use client"

import { AppError, AppLoading } from "@/components/app"

import { useDashboard } from "../hooks"
import { WidgetRenderer } from "./widget-renderer"

export function DashboardCanvas() {
  const { dashboardPackage, isLoading, layout, manifests } = useDashboard()

  if (isLoading) {
    return <AppLoading variant="page" />
  }

  if (!dashboardPackage) {
    return (
      <AppError
        title="Dashboard unavailable"
        description="The dashboard package could not be resolved."
      />
    )
  }

  return (
    <div className="dashboard-analytics">
      <div className="grid grid-cols-12 gap-6" dir="ltr">
        {layout.map((item) => {
          const manifest = manifests[item.widgetId]

          if (!manifest) {
            return (
              <div key={item.widgetId} className={item.className}>
                <AppError
                  title="Missing manifest"
                  description={`No manifest was found for widget ${item.widgetId}.`}
                />
              </div>
            )
          }

          return (
            <div key={item.widgetId} className={item.className}>
              <WidgetRenderer manifest={manifest} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
