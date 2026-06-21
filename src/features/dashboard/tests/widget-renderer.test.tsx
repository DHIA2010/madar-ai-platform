import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WidgetRenderer } from "../components"
import { welcomeBannerManifest } from "../manifests"
import { dashboardWidgetRegistry } from "../registry"
import { DashboardContext } from "../state"

describe("WidgetRenderer", () => {
  it("renders an error for unknown widgets", () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardContext.Provider
          value={{
            dashboardPackage: null,
            layout: [],
            widgetStates: {},
            widgetReadModels: {},
            widgetReadModelViewModels: {},
            registry: {},
            manifests: {},
            isLoading: false,
            refreshVersion: 0,
            lastRefreshReason: null,
            requestRefresh: async () => {},
          }}
        >
          <WidgetRenderer manifest={welcomeBannerManifest} />
        </DashboardContext.Provider>
      </QueryClientProvider>
    )

    expect(screen.getByText("Unknown widget")).toBeTruthy()
  })

  it("renders suspense fallback for registered widgets", () => {
    const queryClient = new QueryClient()

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardContext.Provider
          value={{
            dashboardPackage: null,
            layout: [
              {
                widgetId: "welcome-banner",
                zone: "hero",
                order: 0,
                responsive: { mobile: 12, desktop: 6 },
                className: "col-span-12 xl:col-span-6",
              },
            ],
            widgetStates: {
              "welcome-banner": {
                widgetId: "welcome-banner",
                status: "ready",
              },
            },
            widgetReadModels: {
              "welcome-banner": {
                id: "welcome-banner:read-model",
                version: "1.0.0",
                owner: "dashboard",
                generatedAt: new Date().toISOString(),
                freshness: "fresh",
                sourceDomains: ["dashboard"],
                payload: {
                  widgetId: "welcome-banner",
                  title: "Executive Dashboard",
                  summary: "Mock summary",
                },
              },
            },
            widgetReadModelViewModels: {
              "welcome-banner": {
                id: "welcome-banner:read-model",
                freshness: "fresh",
                payload: {
                  widgetId: "welcome-banner",
                  title: "Executive Dashboard",
                  summary: "Mock summary",
                },
              },
            },
            registry: dashboardWidgetRegistry,
            manifests: {
              "welcome-banner": welcomeBannerManifest,
            },
            isLoading: false,
            refreshVersion: 0,
            lastRefreshReason: null,
            requestRefresh: async () => {},
          }}
        >
          <WidgetRenderer manifest={welcomeBannerManifest} />
        </DashboardContext.Provider>
      </QueryClientProvider>
    )

    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })
})
