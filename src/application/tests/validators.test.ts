import { describe, expect, it } from "vitest"

import {
  dashboardPackageQueryDtoSchema,
  loginRequestDtoSchema,
  workspaceSelectionDtoSchema,
} from "../validators"

describe("application validators", () => {
  it("validates login dto payloads", () => {
    expect(
      loginRequestDtoSchema.safeParse({
        email: "demo@madar.ai",
        password: "password123",
      }).success
    ).toBe(true)
  })

  it("validates workspace selection commands", () => {
    expect(
      workspaceSelectionDtoSchema.safeParse({
        organizationId: "org_northstar",
        workspaceId: "ws_northstar_marketing",
      }).success
    ).toBe(true)
  })

  it("validates dashboard package queries", () => {
    expect(
      dashboardPackageQueryDtoSchema.safeParse({
        workspaceId: "ws_northstar_marketing",
        permissions: ["dashboard:view"],
        featureFlags: {},
        role: "Admin",
      }).success
    ).toBe(true)
  })
})
