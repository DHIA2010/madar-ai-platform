// @vitest-environment node
//
// The status the campaigns page shows for something that is switched on: each platform's own
// delivery state, in one shared vocabulary (campaigns/delivery-status.ts). The Snapchat and
// TikTok values below are ones the platforms really returned.

import { describe, expect, it } from "vitest"

import {
  googleDisplayStatus,
  metaDisplayStatus,
  snapchatDisplayStatus,
  tiktokDisplayStatus,
} from "../campaigns/delivery-status"

describe("campaign delivery status", () => {
  it("Google: an enabled campaign shows its serving status, a paused one stays paused", () => {
    expect(googleDisplayStatus("ENABLED", "UNDER_REVIEW")).toBe("under_review")
    expect(googleDisplayStatus("ENABLED", "ELIGIBLE")).toBe("ENABLED")
    expect(googleDisplayStatus("ENABLED", null)).toBe("ENABLED")
    expect(googleDisplayStatus("PAUSED", "PAUSED")).toBe("PAUSED")
  })

  it("Meta: reads effective_status when the campaign or ad is switched on", () => {
    expect(metaDisplayStatus({ status: "ACTIVE", effective_status: "ACTIVE" })).toBe("ACTIVE")
    expect(metaDisplayStatus({ status: "ACTIVE", effective_status: "PENDING_REVIEW" })).toBe(
      "under_review"
    )
    expect(metaDisplayStatus({ status: "ACTIVE", effective_status: "DISAPPROVED" })).toBe(
      "rejected"
    )
    expect(metaDisplayStatus({ status: "ACTIVE", effective_status: "CAMPAIGN_PAUSED" })).toBe(
      "not_delivering"
    )
    expect(metaDisplayStatus({ status: "PAUSED", effective_status: "PAUSED" })).toBe("PAUSED")
    // Synced before effective_status was asked for.
    expect(metaDisplayStatus({ status: "ACTIVE" })).toBe("ACTIVE")
  })

  it("TikTok: reads secondary_status when the campaign or ad is enabled", () => {
    const enabled = (secondary_status: string) =>
      tiktokDisplayStatus({ operation_status: "ENABLE", secondary_status })
    expect(enabled("CAMPAIGN_STATUS_ENABLE")).toBe("ENABLE")
    expect(enabled("AD_STATUS_DELIVERY_OK")).toBe("ENABLE")
    expect(enabled("AD_STATUS_AUDIT")).toBe("under_review")
    expect(enabled("AD_STATUS_AUDIT_DENY")).toBe("rejected")
    expect(enabled("CAMPAIGN_STATUS_BUDGET_EXCEED")).toBe("limited")
    expect(enabled("ADGROUP_STATUS_NOT_START")).toBe("pending")
    expect(enabled("ADGROUP_STATUS_TIME_DONE")).toBe("ended")
    expect(enabled("AD_STATUS_CAMPAIGN_DISABLE")).toBe("not_delivering")
    expect(enabled("ADGROUP_STATUS_CAMPAIGN_DISABLE")).toBe("not_delivering")
    expect(
      tiktokDisplayStatus({
        operation_status: "DISABLE",
        secondary_status: "CAMPAIGN_STATUS_DISABLE",
      })
    ).toBe("DISABLE")
    expect(tiktokDisplayStatus({ operation_status: "ENABLE" })).toBe("ENABLE")
  })

  it("Snapchat: reads delivery_status and the ad's review_status when it is active", () => {
    const active = (delivery_status: string[], review_status?: string) =>
      snapchatDisplayStatus({ status: "ACTIVE", delivery_status, review_status })
    expect(active(["VALID"])).toBe("ACTIVE")
    expect(active(["LEARNING_PHASE", "VALID"])).toBe("learning")
    expect(active(["INVALID_EFFECTIVE_INVALID", "INVALID_NOT_EFFECTIVE_ACTIVE"], "APPROVED")).toBe(
      "not_delivering"
    )
    expect(active(["VALID"], "PENDING")).toBe("under_review")
    expect(active(["INVALID_NOT_EFFECTIVE_ACTIVE"], "REJECTED")).toBe("rejected")
    expect(
      snapchatDisplayStatus({
        status: "PAUSED",
        delivery_status: ["INVALID_NOT_ACTIVE", "INVALID_CAMPAIGN_HAS_NO_ACTIVE_AD_SQUAD"],
      })
    ).toBe("PAUSED")
    expect(snapchatDisplayStatus({ status: "ACTIVE" })).toBe("ACTIVE")
  })
})
