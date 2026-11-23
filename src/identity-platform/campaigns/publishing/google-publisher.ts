// Publishes one search campaign to Google Ads through its REST API: a budget, the campaign, where
// and in what language it shows, one ad group, its keywords and one text ad -- each piece created
// before the next one needs its name. If a later step fails, the campaign and the budget created
// so far are removed, so a failed publish leaves nothing behind on the account.
//
// Google names everything by a path, "customers/<customerId>/<collection>/<id>", and answers each
// write with { results: [{ resourceName }] }; a new id is the last part of that path.

import type { GoogleAdsMutator } from "../control-platforms"
import { GoogleAdsMutateError } from "../../google-ads/client"
import {
  GOOGLE_DESCRIPTION_MAX,
  GOOGLE_HEADLINE_MAX,
  GOOGLE_MIN_DESCRIPTIONS,
  GOOGLE_MIN_HEADLINES,
  PlatformPublishError,
  type GooglePublishInput,
  type GooglePublishedIds,
  type PublishErrorCode,
  type PublishStep,
} from "./platform"

// Google's own limits for the words people search.
const GOOGLE_MAX_KEYWORDS = 20
const GOOGLE_KEYWORD_MAX = 80
// And for one responsive search ad: more than these are refused, so only the first ones are sent.
const GOOGLE_MAX_HEADLINES = 15
const GOOGLE_MAX_DESCRIPTIONS = 4

// Google's id for each country an ad can be shown in (its "geo target constants").
const GOOGLE_COUNTRY_IDS: Record<string, string> = {
  sa: "2682",
  ae: "2784",
  kw: "2414",
  qa: "2634",
  bh: "2048",
  om: "2512",
  eg: "2818",
  jo: "2400",
}
// Arabic.
const GOOGLE_LANGUAGE_ID = "1019"

type Operation = Record<string, unknown>

function filled(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}

// The words people search, as they are sent: trimmed, without empty ones, each one once (Google
// does not tell capital letters apart in a keyword).
function keywordsOf(values: string[]): string[] {
  const seen = new Set<string>()
  return filled(values).filter((value) => {
    const key = value.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Which part of a text ad's own words Google would refuse, or null when both fit.
function adTextProblem(input: {
  headlines: string[]
  descriptions: string[]
}): "headlines" | "descriptions" | null {
  const headlines = filled(input.headlines)
  if (
    headlines.length < GOOGLE_MIN_HEADLINES ||
    headlines.some((text) => text.length > GOOGLE_HEADLINE_MAX)
  ) {
    return "headlines"
  }
  const descriptions = filled(input.descriptions)
  if (
    descriptions.length < GOOGLE_MIN_DESCRIPTIONS ||
    descriptions.some((text) => text.length > GOOGLE_DESCRIPTION_MAX)
  ) {
    return "descriptions"
  }
  return null
}

// Which part of the ad's text Google would refuse, or null when all of it fits.
export function googleTextProblem(
  input: Pick<GooglePublishInput, "headlines" | "descriptions" | "keywords">
): "headlines" | "descriptions" | "keywords" | null {
  const adProblem = adTextProblem(input)
  if (adProblem) return adProblem
  const keywords = keywordsOf(input.keywords)
  if (
    keywords.length === 0 ||
    keywords.length > GOOGLE_MAX_KEYWORDS ||
    keywords.some((text) => text.length > GOOGLE_KEYWORD_MAX)
  ) {
    return "keywords"
  }
  return null
}

// The write that creates one responsive search ad in an ad group: the headlines and descriptions
// as they are sent (trimmed, without empty ones, no more than Google takes) and where it leads.
function adCreateOperation(
  adGroupResourceName: string,
  ad: { headlines: string[]; descriptions: string[]; url: string }
): Operation {
  return {
    create: {
      adGroup: adGroupResourceName,
      status: "ENABLED",
      ad: {
        finalUrls: [ad.url],
        responsiveSearchAd: {
          headlines: filled(ad.headlines)
            .slice(0, GOOGLE_MAX_HEADLINES)
            .map((text) => ({ text })),
          descriptions: filled(ad.descriptions)
            .slice(0, GOOGLE_MAX_DESCRIPTIONS)
            .map((text) => ({ text })),
        },
      },
    },
  }
}

// An ad is named through its ad group: ".../adGroupAds/<adGroupId>~<adId>".
function adIdOf(adResourceName: string): string {
  return (adResourceName.split("/").pop() as string).split("~").pop() as string
}

// A refusal in the words the publishing service reads: Google's own reason, and whether it was
// the connection that is not allowed (401/403) or the change itself.
function refusal(step: PublishStep, error: unknown): PlatformPublishError {
  if (error instanceof PlatformPublishError) return error
  if (error instanceof GoogleAdsMutateError) {
    const kind: PublishErrorCode =
      error.status === 401 || error.status === 403 ? "ACCESS_DENIED" : "REFUSED"
    return new PlatformPublishError("google", step, error.reason.slice(0, 400), kind)
  }
  const reason = error instanceof Error ? error.message : String(error)
  return new PlatformPublishError("google", step, (reason || "no reason given").slice(0, 400))
}

export class GoogleSearchCampaignPublisher {
  constructor(private readonly client: GoogleAdsMutator) {}

  // One write, with its refusal reported against the step it belongs to.
  private async mutate(
    step: PublishStep,
    account: { connectionId: string; customerId: string },
    service: string,
    operations: Operation[]
  ): Promise<unknown> {
    try {
      return await this.client.mutate({
        connectionId: account.connectionId,
        customerId: account.customerId,
        service,
        operations,
      })
    } catch (error) {
      throw refusal(step, error)
    }
  }

  // The name Google gave the first thing a write created.
  private created(step: PublishStep, body: unknown): string {
    const results = (body as { results?: Array<{ resourceName?: unknown }> } | null)?.results
    const resourceName = Array.isArray(results) ? results[0]?.resourceName : undefined
    if (typeof resourceName !== "string" || resourceName.length === 0) {
      throw new PlatformPublishError("google", step, "Google did not say what it created.")
    }
    return resourceName
  }

  async publish(input: GooglePublishInput): Promise<GooglePublishedIds> {
    // Everything that can be checked here is checked first, so a text that does not fit or an
    // unknown country stops the publish before anything is created.
    const problem = googleTextProblem(input)
    if (problem) {
      throw new PlatformPublishError(
        "google",
        "ad",
        `The ${problem} do not fit Google's limits.`,
        "REFUSED"
      )
    }
    const countryId = GOOGLE_COUNTRY_IDS[input.countryCode.trim().toLowerCase()]
    if (!countryId) {
      throw new PlatformPublishError(
        "google",
        "campaign",
        `The country "${input.countryCode}" is not one the campaign can be shown in.`,
        "REFUSED"
      )
    }
    const keywords = keywordsOf(input.keywords)

    // The daily budget is a thing of its own on Google, and its name must be unique in the
    // account -- hence the timestamp.
    const budgetResourceName = this.created(
      "campaign",
      await this.mutate("campaign", input, "campaignBudgets", [
        {
          create: {
            name: `${input.name} ${Date.now()}`,
            amountMicros: String(Math.round(input.dailyBudget * 1_000_000)),
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        },
      ])
    )

    let campaignResourceName: string | null = null
    try {
      // Only Google Search itself, and only people who are in the country: search partner sites
      // and display banners are where an earlier campaign on a real account lost most of its
      // money. No start date is sent -- a campaign starts when it is switched on.
      campaignResourceName = this.created(
        "campaign",
        await this.mutate("campaign", input, "campaigns", [
          {
            create: {
              name: input.name,
              status: input.startActive ? "ENABLED" : "PAUSED",
              advertisingChannelType: "SEARCH",
              campaignBudget: budgetResourceName,
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: false,
                targetContentNetwork: false,
                targetPartnerSearchNetwork: false,
              },
              geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
              containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
              // This API version (checked against a live account) names the end
              // "endDateTime" and takes it to the second; the old date-only field is gone.
              ...(input.endDate ? { endDateTime: `${input.endDate} 23:59:59` } : {}),
              // Sign-ups: as many conversions as the budget buys. Visits: as many clicks.
              ...(input.objective === "leads" ? { maximizeConversions: {} } : { targetSpend: {} }),
            },
          },
        ])
      )
      const campaignId = campaignResourceName.split("/").pop() as string

      // Where it shows and in what language.
      await this.mutate("campaign", input, "campaignCriteria", [
        {
          create: {
            campaign: campaignResourceName,
            location: { geoTargetConstant: `geoTargetConstants/${countryId}` },
          },
        },
        {
          create: {
            campaign: campaignResourceName,
            language: { languageConstant: `languageConstants/${GOOGLE_LANGUAGE_ID}` },
          },
        },
      ])

      const adGroupResourceName = this.created(
        "ad_set",
        await this.mutate("ad_set", input, "adGroups", [
          {
            create: {
              name: input.name,
              campaign: campaignResourceName,
              status: "ENABLED",
              type: "SEARCH_STANDARD",
            },
          },
        ])
      )
      const adGroupId = adGroupResourceName.split("/").pop() as string

      // A phrase match: the search has to contain the keyword's meaning, not just be related.
      await this.mutate(
        "ad_set",
        input,
        "adGroupCriteria",
        keywords.map((text) => ({
          create: {
            adGroup: adGroupResourceName,
            status: "ENABLED",
            keyword: { text, matchType: "PHRASE" },
          },
        }))
      )

      const adResourceName = this.created(
        "ad",
        await this.mutate("ad", input, "adGroupAds", [
          adCreateOperation(adGroupResourceName, input),
        ])
      )
      const adId = adIdOf(adResourceName)

      return { campaignId, budgetResourceName, adGroupId, adId }
    } catch (error) {
      // Nothing half-built stays on the account. Removing the campaign takes its ad group,
      // keywords and ad with it, and frees the budget to be removed; a failure to remove must not
      // hide the original reason.
      if (campaignResourceName) {
        await this.client
          .mutate({
            connectionId: input.connectionId,
            customerId: input.customerId,
            service: "campaigns",
            operations: [{ remove: campaignResourceName }],
          })
          .catch(() => undefined)
      }
      await this.client
        .mutate({
          connectionId: input.connectionId,
          customerId: input.customerId,
          service: "campaignBudgets",
          operations: [{ remove: budgetResourceName }],
        })
        .catch(() => undefined)
      throw refusal("campaign", error)
    }
  }

  // A new responsive search ad in an ad group that already exists. The text is checked first, so
  // one that does not fit is refused before Google is asked; the ad group's keywords and other
  // ads are left as they are.
  async addAd(input: {
    connectionId: string
    // Digits only.
    customerId: string
    adGroupId: string
    headlines: string[]
    descriptions: string[]
    url: string
  }): Promise<{ adId: string }> {
    const problem = adTextProblem(input)
    if (problem) {
      throw new PlatformPublishError(
        "google",
        "ad",
        `The ${problem} do not fit Google's limits.`,
        "REFUSED"
      )
    }
    const adResourceName = this.created(
      "ad",
      await this.mutate("ad", input, "adGroupAds", [
        adCreateOperation(`customers/${input.customerId}/adGroups/${input.adGroupId}`, input),
      ])
    )
    return { adId: adIdOf(adResourceName) }
  }

  // Switches a published campaign on or off; only its status is sent.
  async setCampaignStatus(input: {
    connectionId: string
    customerId: string
    campaignId: string
    active: boolean
  }): Promise<void> {
    await this.mutate("status", input, "campaigns", [
      {
        update: {
          resourceName: `customers/${input.customerId}/campaigns/${input.campaignId}`,
          status: input.active ? "ENABLED" : "PAUSED",
        },
        updateMask: "status",
      },
    ])
  }

  // Removes a published campaign from the account, with its ad group, keywords and ad. A campaign
  // that is already gone (removed in Google Ads itself) counts as deleted; a connection that is
  // not allowed is still reported.
  async deleteCampaign(input: {
    connectionId: string
    customerId: string
    campaignId: string
  }): Promise<void> {
    try {
      await this.mutate("campaign", input, "campaigns", [
        { remove: `customers/${input.customerId}/campaigns/${input.campaignId}` },
      ])
    } catch (error) {
      if (
        error instanceof PlatformPublishError &&
        error.code !== "GOOGLE_ACCESS_DENIED" &&
        /not found|RESOURCE_NOT_FOUND|REMOVED/i.test(error.reason)
      ) {
        return
      }
      throw error
    }
  }
}
