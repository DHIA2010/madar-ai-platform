// @vitest-environment node
//
// The serving status the Google Ads sync stores next to a campaign's or ad's on/off status: what
// Google Ads itself shows (under review, limited, not eligible, ...).

import { describe, expect, it } from "vitest"

import { GoogleAdsCampaignService, servingStatusOf } from "../google-ads/services"

describe("google ads serving status", () => {
  it("reads 'under review' from the reasons, and otherwise the primary status", () => {
    expect(servingStatusOf("NOT_ELIGIBLE", ["MOST_ADS_UNDER_REVIEW"])).toBe("UNDER_REVIEW")
    expect(servingStatusOf("PENDING", ["AD_UNDER_REVIEW"])).toBe("UNDER_REVIEW")
    expect(servingStatusOf("ELIGIBLE", [])).toBe("ELIGIBLE")
    expect(servingStatusOf("LIMITED", ["BUDGET_CONSTRAINED"])).toBe("LIMITED")
    expect(servingStatusOf("UNKNOWN", undefined)).toBeNull()
    expect(servingStatusOf(undefined, undefined)).toBeNull()
  })

  it("attaches it to each campaign, and still lists campaigns when Google refuses the fields", async () => {
    const campaignRows = [
      { campaign: { id: "1", name: "In review", status: "ENABLED" } },
      { campaign: { id: "2", name: "Running", status: "ENABLED" } },
    ]
    const withStatus = new GoogleAdsCampaignService({
      queryAllRows: async ({ query }) =>
        query.includes("primary_status")
          ? [
              {
                campaign: {
                  id: "1",
                  primaryStatus: "NOT_ELIGIBLE",
                  primaryStatusReasons: ["MOST_ADS_UNDER_REVIEW"],
                },
              },
              { campaign: { id: "2", primaryStatus: "ELIGIBLE", primaryStatusReasons: [] } },
            ]
          : campaignRows,
    })
    const campaigns = await withStatus.listCampaigns({ connectionId: "c", customerId: "x" })
    expect(
      campaigns.map((campaign) => [campaign.name, campaign.status, campaign.servingStatus])
    ).toEqual([
      ["In review", "ENABLED", "UNDER_REVIEW"],
      ["Running", "ENABLED", "ELIGIBLE"],
    ])

    const refused = new GoogleAdsCampaignService({
      queryAllRows: async ({ query }) => {
        if (query.includes("primary_status")) throw new Error("UNRECOGNIZED_FIELD")
        return campaignRows
      },
    })
    const plain = await refused.listCampaigns({ connectionId: "c", customerId: "x" })
    expect(plain).toHaveLength(2)
    expect(plain[0].servingStatus).toBeNull()
  })
})
