// The Google Ads search campaign publisher against a stand-in for the Google Ads client: what it
// sends, in what order, and what it removes when a step is refused. Nothing reaches Google.

import { describe, expect, it } from "vitest"

import type { GoogleAdsMutator } from "../campaigns/control-platforms"
import {
  GoogleSearchCampaignPublisher,
  googleTextProblem,
} from "../campaigns/publishing/google-publisher"
import { PlatformPublishError, type GooglePublishInput } from "../campaigns/publishing/platform"
import { GoogleAdsMutateError } from "../google-ads/client"

const CONNECTION = "connection-1"
const CUSTOMER = "2739111244"
const BUDGET = `customers/${CUSTOMER}/campaignBudgets/900`
const CAMPAIGN = `customers/${CUSTOMER}/campaigns/11`
const AD_GROUP = `customers/${CUSTOMER}/adGroups/21`

type Call = Parameters<GoogleAdsMutator["mutate"]>[0]

// Records every write and answers the name Google would give what was created. `refuse` names
// the services (for creates only, unless `refuseRemovals`) that throw instead.
function fakeGoogle(
  options: {
    refuse?: Record<string, GoogleAdsMutateError>
    refuseRemovals?: GoogleAdsMutateError
  } = {}
) {
  const calls: Call[] = []
  const names: Record<string, string> = {
    campaignBudgets: BUDGET,
    campaigns: CAMPAIGN,
    campaignCriteria: `customers/${CUSTOMER}/campaignCriteria/11~2682`,
    adGroups: AD_GROUP,
    adGroupCriteria: `customers/${CUSTOMER}/adGroupCriteria/21~501`,
    adGroupAds: `customers/${CUSTOMER}/adGroupAds/21~31`,
  }
  const client: GoogleAdsMutator = {
    mutate: async (input) => {
      calls.push(input)
      const removal = "remove" in (input.operations[0] ?? {})
      if (removal && options.refuseRemovals) throw options.refuseRemovals
      const refused = options.refuse?.[input.service]
      if (refused && !removal) throw refused
      return { results: input.operations.map(() => ({ resourceName: names[input.service] })) }
    },
  }
  return { calls, publisher: new GoogleSearchCampaignPublisher(client) }
}

function input(overrides: Partial<GooglePublishInput> = {}): GooglePublishInput {
  return {
    connectionId: CONNECTION,
    customerId: CUSTOMER,
    name: "Winter offer",
    objective: "traffic",
    dailyBudget: 75.5,
    startDate: "2026-12-01",
    endDate: "2026-12-31",
    countryCode: "sa",
    headlines: [" Cashier for your shop ", "Try it free", "", "Works in Arabic"],
    descriptions: ["Sell, track stock and invoice from one place.", "Start in minutes."],
    keywords: [" pos system ", "POS system", "", "cashier app"],
    url: "https://www.example.com/pos",
    startActive: false,
    ...overrides,
  }
}

const created = (call: Call | undefined, index = 0) =>
  (call?.operations[index] as { create: Record<string, unknown> }).create

describe("the Google Ads search campaign publisher", () => {
  it("creates the budget, campaign, criteria, ad group, keywords and ad in order", async () => {
    const { publisher, calls } = fakeGoogle()
    const ids = await publisher.publish(input())

    expect(ids).toEqual({
      campaignId: "11",
      budgetResourceName: BUDGET,
      adGroupId: "21",
      adId: "31",
    })
    expect(calls.map((call) => call.service)).toEqual([
      "campaignBudgets",
      "campaigns",
      "campaignCriteria",
      "adGroups",
      "adGroupCriteria",
      "adGroupAds",
    ])
    expect(
      calls.every((call) => call.connectionId === CONNECTION && call.customerId === CUSTOMER)
    ).toBe(true)

    const budget = created(calls[0])
    expect(budget).toMatchObject({
      amountMicros: "75500000",
      deliveryMethod: "STANDARD",
      explicitlyShared: false,
    })
    expect(budget.name).toMatch(/^Winter offer \d+$/)

    const campaign = created(calls[1])
    expect(campaign).toMatchObject({
      name: "Winter offer",
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
      campaignBudget: BUDGET,
      networkSettings: {
        targetGoogleSearch: true,
        targetSearchNetwork: false,
        targetContentNetwork: false,
        targetPartnerSearchNetwork: false,
      },
      geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      endDateTime: "2026-12-31 23:59:59",
    })
    expect(campaign).not.toHaveProperty("startDate")

    expect(calls[2]?.operations).toEqual([
      {
        create: { campaign: CAMPAIGN, location: { geoTargetConstant: "geoTargetConstants/2682" } },
      },
      { create: { campaign: CAMPAIGN, language: { languageConstant: "languageConstants/1019" } } },
    ])

    expect(calls[3]?.operations).toEqual([
      {
        create: {
          name: "Winter offer",
          campaign: CAMPAIGN,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
        },
      },
    ])

    // Trimmed, the empty one dropped, and the same words in other letters sent once.
    expect(calls[4]?.operations).toEqual([
      {
        create: {
          adGroup: AD_GROUP,
          status: "ENABLED",
          keyword: { text: "pos system", matchType: "PHRASE" },
        },
      },
      {
        create: {
          adGroup: AD_GROUP,
          status: "ENABLED",
          keyword: { text: "cashier app", matchType: "PHRASE" },
        },
      },
    ])

    expect(calls[5]?.operations).toEqual([
      {
        create: {
          adGroup: AD_GROUP,
          status: "ENABLED",
          ad: {
            finalUrls: ["https://www.example.com/pos"],
            responsiveSearchAd: {
              headlines: [
                { text: "Cashier for your shop" },
                { text: "Try it free" },
                { text: "Works in Arabic" },
              ],
              descriptions: [
                { text: "Sell, track stock and invoice from one place." },
                { text: "Start in minutes." },
              ],
            },
          },
        },
      },
    ])
  })

  it("starts switched on when asked, with no end date and the country chosen", async () => {
    const { publisher, calls } = fakeGoogle()
    await publisher.publish(input({ startActive: true, endDate: null, countryCode: "AE" }))
    const campaign = created(calls[1])
    expect(campaign.status).toBe("ENABLED")
    expect(campaign).not.toHaveProperty("endDateTime")
    expect(created(calls[2]).location).toEqual({ geoTargetConstant: "geoTargetConstants/2784" })
  })

  it("bids for clicks on a visits campaign and for conversions on a sign-ups one", async () => {
    const traffic = fakeGoogle()
    await traffic.publisher.publish(input({ objective: "traffic" }))
    expect(created(traffic.calls[1])).toMatchObject({ targetSpend: {} })
    expect(created(traffic.calls[1])).not.toHaveProperty("maximizeConversions")

    const leads = fakeGoogle()
    await leads.publisher.publish(input({ objective: "leads" }))
    expect(created(leads.calls[1])).toMatchObject({ maximizeConversions: {} })
    expect(created(leads.calls[1])).not.toHaveProperty("targetSpend")
  })

  it("says which part of the text does not fit", () => {
    const fits = {
      headlines: ["One", "Two", "Three"],
      descriptions: ["First.", "Second."],
      keywords: ["pos"],
    }
    expect(googleTextProblem(fits)).toBeNull()
    expect(googleTextProblem({ ...fits, headlines: ["One", "Two", "  "] })).toBe("headlines")
    expect(googleTextProblem({ ...fits, headlines: ["One", "Two", "x".repeat(31)] })).toBe(
      "headlines"
    )
    expect(googleTextProblem({ ...fits, headlines: ["One", "Two", "x".repeat(30)] })).toBeNull()
    expect(googleTextProblem({ ...fits, descriptions: ["Only one."] })).toBe("descriptions")
    expect(googleTextProblem({ ...fits, descriptions: ["First.", "x".repeat(91)] })).toBe(
      "descriptions"
    )
    expect(googleTextProblem({ ...fits, keywords: [] })).toBe("keywords")
    expect(googleTextProblem({ ...fits, keywords: [" ", ""] })).toBe("keywords")
    expect(googleTextProblem({ ...fits, keywords: ["x".repeat(81)] })).toBe("keywords")
    expect(
      googleTextProblem({ ...fits, keywords: Array.from({ length: 21 }, (_, i) => `word ${i}`) })
    ).toBe("keywords")
    expect(
      googleTextProblem({ ...fits, keywords: Array.from({ length: 20 }, (_, i) => `word ${i}`) })
    ).toBeNull()
  })

  it("refuses a text that does not fit, or an unknown country, before asking Google", async () => {
    const { publisher, calls } = fakeGoogle()
    const refusedCases: Array<Partial<GooglePublishInput>> = [
      { headlines: ["One", "Two"] },
      { descriptions: ["First.", "x".repeat(91)] },
      { keywords: [] },
    ]
    for (const overrides of refusedCases) {
      await expect(publisher.publish(input(overrides))).rejects.toMatchObject({
        name: "PlatformPublishError",
        platform: "google",
        step: "ad",
        code: "GOOGLE_REFUSED",
      })
    }
    await expect(publisher.publish(input({ countryCode: "fr" }))).rejects.toMatchObject({
      platform: "google",
      step: "campaign",
      code: "GOOGLE_REFUSED",
    })
    expect(calls).toEqual([])
  })

  it("removes the campaign and the budget when the ad is refused, and reports the reason", async () => {
    const { publisher, calls } = fakeGoogle({
      refuse: { adGroupAds: new GoogleAdsMutateError(400, "The final URL is not reachable.") },
    })
    const error = await publisher.publish(input()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PlatformPublishError)
    expect(error).toMatchObject({
      platform: "google",
      step: "ad",
      reason: "The final URL is not reachable.",
      code: "GOOGLE_REFUSED",
    })
    expect(calls.slice(-2).map((call) => [call.service, call.operations])).toEqual([
      ["campaigns", [{ remove: CAMPAIGN }]],
      ["campaignBudgets", [{ remove: BUDGET }]],
    ])
  })

  it("keeps the original reason when the removals fail too, and names the step", async () => {
    const { publisher, calls } = fakeGoogle({
      refuse: { adGroupCriteria: new GoogleAdsMutateError(400, "Keyword not allowed.") },
      refuseRemovals: new GoogleAdsMutateError(500, "Try again later."),
    })
    await expect(publisher.publish(input())).rejects.toMatchObject({
      step: "ad_set",
      reason: "Keyword not allowed.",
      code: "GOOGLE_REFUSED",
    })
    expect(calls.map((call) => call.service)).toEqual([
      "campaignBudgets",
      "campaigns",
      "campaignCriteria",
      "adGroups",
      "adGroupCriteria",
      "campaigns",
      "campaignBudgets",
    ])
  })

  it("removes only the budget when the campaign itself is refused, and nothing when the budget is", async () => {
    const campaign = fakeGoogle({
      refuse: { campaigns: new GoogleAdsMutateError(400, "Name already used.") },
    })
    await expect(campaign.publisher.publish(input())).rejects.toMatchObject({
      step: "campaign",
      reason: "Name already used.",
    })
    expect(campaign.calls.map((call) => [call.service, call.operations[0]])).toEqual([
      ["campaignBudgets", expect.objectContaining({ create: expect.anything() })],
      ["campaigns", expect.objectContaining({ create: expect.anything() })],
      ["campaignBudgets", { remove: BUDGET }],
    ])

    const budget = fakeGoogle({
      refuse: { campaignBudgets: new GoogleAdsMutateError(400, "Budget too low.") },
    })
    await expect(budget.publisher.publish(input())).rejects.toMatchObject({
      step: "campaign",
      reason: "Budget too low.",
    })
    expect(budget.calls).toHaveLength(1)
  })

  it("reports a connection that is not allowed as an access denial", async () => {
    const { publisher, calls } = fakeGoogle({
      refuse: { campaigns: new GoogleAdsMutateError(403, "The caller does not have permission.") },
    })
    await expect(publisher.publish(input())).rejects.toMatchObject({
      step: "campaign",
      code: "GOOGLE_ACCESS_DENIED",
      reason: "The caller does not have permission.",
    })
    expect(calls.at(-1)?.operations).toEqual([{ remove: BUDGET }])
  })

  it("switches a campaign on and off by its status alone", async () => {
    const { publisher, calls } = fakeGoogle()
    const target = { connectionId: CONNECTION, customerId: CUSTOMER, campaignId: "11" }
    await publisher.setCampaignStatus({ ...target, active: true })
    await publisher.setCampaignStatus({ ...target, active: false })
    expect(calls.map((call) => [call.service, call.operations])).toEqual([
      [
        "campaigns",
        [{ update: { resourceName: CAMPAIGN, status: "ENABLED" }, updateMask: "status" }],
      ],
      [
        "campaigns",
        [{ update: { resourceName: CAMPAIGN, status: "PAUSED" }, updateMask: "status" }],
      ],
    ])

    const refusing = new GoogleSearchCampaignPublisher({
      mutate: async () => {
        throw new GoogleAdsMutateError(401, "Login expired.")
      },
    })
    await expect(refusing.setCampaignStatus({ ...target, active: true })).rejects.toMatchObject({
      step: "status",
      code: "GOOGLE_ACCESS_DENIED",
    })
  })

  it("deletes a campaign, and counts one that is already gone as deleted", async () => {
    const target = { connectionId: CONNECTION, customerId: CUSTOMER, campaignId: "11" }
    const { publisher, calls } = fakeGoogle()
    await publisher.deleteCampaign(target)
    expect(calls).toEqual([
      {
        connectionId: CONNECTION,
        customerId: CUSTOMER,
        service: "campaigns",
        operations: [{ remove: CAMPAIGN }],
      },
    ])

    for (const reason of [
      "Resource was not found.",
      "RESOURCE_NOT_FOUND",
      "The campaign is removed and cannot be changed.",
    ]) {
      const gone = fakeGoogle({ refuseRemovals: new GoogleAdsMutateError(400, reason) })
      await expect(gone.publisher.deleteCampaign(target)).resolves.toBeUndefined()
    }

    const refused = fakeGoogle({ refuseRemovals: new GoogleAdsMutateError(400, "Cannot remove.") })
    await expect(refused.publisher.deleteCampaign(target)).rejects.toMatchObject({
      name: "PlatformPublishError",
      step: "campaign",
      reason: "Cannot remove.",
      code: "GOOGLE_REFUSED",
    })

    const denied = fakeGoogle({ refuseRemovals: new GoogleAdsMutateError(403, "Not found.") })
    await expect(denied.publisher.deleteCampaign(target)).rejects.toMatchObject({
      code: "GOOGLE_ACCESS_DENIED",
    })
  })

  it("sends no more headlines and descriptions than Google takes in one ad", async () => {
    const { publisher, calls } = fakeGoogle()
    await publisher.publish(
      input({
        headlines: Array.from({ length: 16 }, (_, i) => `Headline ${i + 1}`),
        descriptions: Array.from({ length: 5 }, (_, i) => `Description ${i + 1}.`),
      })
    )
    const ad = created(calls[5]).ad as {
      responsiveSearchAd: { headlines: Array<{ text: string }>; descriptions: unknown[] }
    }
    expect(ad.responsiveSearchAd.headlines).toHaveLength(15)
    expect(ad.responsiveSearchAd.headlines.at(-1)).toEqual({ text: "Headline 15" })
    expect(ad.responsiveSearchAd.descriptions).toHaveLength(4)
  })

  const adInput = () => ({
    connectionId: CONNECTION,
    customerId: CUSTOMER,
    adGroupId: "21",
    headlines: [" Cashier for your shop ", "Try it free", "", "Works in Arabic"],
    descriptions: ["Sell, track stock and invoice from one place.", "Start in minutes."],
    url: "https://www.example.com/pos",
  })

  it("adds a text ad to an ad group that exists", async () => {
    const { publisher, calls } = fakeGoogle()
    await expect(publisher.addAd(adInput())).resolves.toEqual({ adId: "31" })
    expect(calls).toEqual([
      {
        connectionId: CONNECTION,
        customerId: CUSTOMER,
        service: "adGroupAds",
        operations: [
          {
            create: {
              adGroup: AD_GROUP,
              status: "ENABLED",
              ad: {
                finalUrls: ["https://www.example.com/pos"],
                responsiveSearchAd: {
                  headlines: [
                    { text: "Cashier for your shop" },
                    { text: "Try it free" },
                    { text: "Works in Arabic" },
                  ],
                  descriptions: [
                    { text: "Sell, track stock and invoice from one place." },
                    { text: "Start in minutes." },
                  ],
                },
              },
            },
          },
        ],
      },
    ])
  })

  it("refuses a new ad whose text does not fit before asking Google", async () => {
    const { publisher, calls } = fakeGoogle()
    const refusedCases = [
      { headlines: ["One", "Two"] },
      { headlines: ["One", "Two", "x".repeat(31)] },
      { descriptions: ["Only one."] },
    ]
    for (const overrides of refusedCases) {
      await expect(publisher.addAd({ ...adInput(), ...overrides })).rejects.toMatchObject({
        name: "PlatformPublishError",
        platform: "google",
        step: "ad",
        code: "GOOGLE_REFUSED",
      })
    }
    expect(calls).toEqual([])
  })

  it("reports a new ad the connection is not allowed to create as an access denial", async () => {
    const { publisher, calls } = fakeGoogle({
      refuse: { adGroupAds: new GoogleAdsMutateError(403, "The caller does not have permission.") },
    })
    await expect(publisher.addAd(adInput())).rejects.toMatchObject({
      platform: "google",
      step: "ad",
      code: "GOOGLE_ACCESS_DENIED",
      reason: "The caller does not have permission.",
    })
    // Nothing was created, so nothing is removed.
    expect(calls).toHaveLength(1)
  })
})
