import { describe, expect, it } from "vitest"

import { ApplicationError, ReadModelNotFoundError } from "../errors"

describe("application errors", () => {
  it("creates typed application errors", () => {
    const error = new ApplicationError("example", "Example error")
    expect(error.code).toBe("example")
  })

  it("creates read model not found errors", () => {
    const error = new ReadModelNotFoundError("widget:missing")
    expect(error.message).toContain("widget:missing")
  })
})
