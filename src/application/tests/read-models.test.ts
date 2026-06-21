import { describe, expect, it } from "vitest"

import { createReadModel } from "../read-models"

describe("read model infrastructure", () => {
  it("creates immutable read models", () => {
    const readModel = createReadModel({
      id: "dashboard:test",
      owner: "dashboard",
      sourceDomains: ["dashboard"],
      payload: { value: 1 },
    })

    expect(Object.isFrozen(readModel)).toBe(true)
    expect(Object.isFrozen(readModel.payload)).toBe(true)
  })
})
