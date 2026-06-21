import { describe, expect, it } from "vitest"

import { mapDashboardWidgetDtoToReadModel, mapReadModelToViewModel } from "../mappers"

describe("application mappers", () => {
  it("maps dashboard dto payloads to read models and view models", () => {
    const readModel = mapDashboardWidgetDtoToReadModel("welcome-banner", {
      widgetId: "welcome-banner",
      title: "Executive Dashboard",
      summary: "Mock summary",
    })
    const viewModel = mapReadModelToViewModel(readModel)

    expect(readModel.id).toBe("welcome-banner:read-model")
    expect(viewModel.payload.title).toBe("Executive Dashboard")
  })
})
