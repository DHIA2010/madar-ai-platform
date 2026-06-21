import { describe, expect, it } from "vitest"

import { createRefreshVersion, shouldRefreshWidget } from "../engine"

describe("refresh coordinator", () => {
  it("refreshes widgets when the trigger is supported", () => {
    expect(
      shouldRefreshWidget(
        {
          strategy: "event-driven",
          triggers: ["manual", "workspace-change"],
        },
        "workspace-change"
      )
    ).toBe(true)
  })

  it("increments refresh version deterministically", () => {
    expect(createRefreshVersion(2)).toBe(3)
  })
})
