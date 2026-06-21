import { describe, expect, it } from "vitest"

import { workspaceSelectionSchema, workspaceSettingsSchema } from "./workspace.validators"

describe("workspace validators", () => {
  it("accepts a valid workspace selection payload", () => {
    const parsed = workspaceSelectionSchema.safeParse({
      organizationId: "org_northstar",
      workspaceId: "ws_northstar_marketing",
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects an incomplete workspace selection payload", () => {
    const parsed = workspaceSelectionSchema.safeParse({
      organizationId: "",
      workspaceId: "",
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts valid workspace settings", () => {
    const parsed = workspaceSettingsSchema.safeParse({
      locale: "ar-SA",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      dateFormat: "dd/MM/yyyy",
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects invalid workspace settings", () => {
    const parsed = workspaceSettingsSchema.safeParse({
      locale: "",
      timezone: "",
      currency: "",
      dateFormat: "",
    })

    expect(parsed.success).toBe(false)
  })
})
