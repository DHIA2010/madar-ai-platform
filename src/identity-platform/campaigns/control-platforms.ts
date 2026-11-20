// The calls that switch or delete a campaign, an ad group or an ad on TikTok and on Google Ads,
// kept apart from control-service.ts so each can be stood in for in tests. (Snapchat's live in
// publishing/snapchat-publisher.ts, next to the calls that publish.)

export type ControlLevel = "campaign" | "adGroup" | "ad"

// A refusal from the ad platform, with its own words.
export class PlatformControlError extends Error {
  constructor(
    readonly platform: "tiktok" | "google",
    readonly reason: string,
    readonly denied = false
  ) {
    super(`${platform} refused: ${reason}`)
    this.name = "PlatformControlError"
  }
}

// ---- TikTok ----
// One "status update" call per level does all three: ENABLE, DISABLE and DELETE. TikTok answers
// 200 with a code in the body; anything but 0 is a refusal.

const TIKTOK_DEFAULT_BASE = "https://business-api.tiktok.com/open_api/v1.3"
const TIKTOK_CALLS: Record<ControlLevel, { path: string; idsKey: string }> = {
  campaign: { path: "/campaign/status/update/", idsKey: "campaign_ids" },
  adGroup: { path: "/adgroup/status/update/", idsKey: "adgroup_ids" },
  ad: { path: "/ad/status/update/", idsKey: "ad_ids" },
}

export type TikTokOperation = "ENABLE" | "DISABLE" | "DELETE"

export class TikTokCampaignControl {
  private readonly base: string

  constructor(private readonly options: { apiBaseUrl?: string; fetch?: typeof fetch } = {}) {
    this.base = (
      options.apiBaseUrl ??
      process.env.TIKTOK_ADS_API_BASE_URL ??
      TIKTOK_DEFAULT_BASE
    ).replace(/\/$/, "")
  }

  async setStatus(input: {
    accessToken: string
    advertiserId: string
    level: ControlLevel
    id: string
    operation: TikTokOperation
  }): Promise<void> {
    const call = TIKTOK_CALLS[input.level]
    const response = await (this.options.fetch ?? fetch)(`${this.base}${call.path}`, {
      method: "POST",
      headers: {
        "access-token": input.accessToken,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        advertiser_id: input.advertiserId,
        [call.idsKey]: [input.id],
        operation_status: input.operation,
      }),
    })
    const text = await response.text()
    let body: { code?: number; message?: string } = {}
    try {
      body = text ? (JSON.parse(text) as typeof body) : {}
    } catch {
      body = { message: text.slice(0, 300) }
    }
    if (!response.ok || body.code !== 0) {
      const denied = response.status === 401 || response.status === 403 || body.code === 40001
      throw new PlatformControlError(
        "tiktok",
        String(body.message ?? `request failed (${response.status})`).slice(0, 400),
        denied
      )
    }
  }
}

// ---- Google Ads ----
// Each level has its own "mutate" service. A change names the one field it touches; a removal
// names the resource. An ad is addressed through its ad group.

export interface GoogleAdsMutator {
  mutate(input: {
    connectionId: string
    customerId: string
    service: string
    operations: Array<Record<string, unknown>>
  }): Promise<unknown>
}

export interface GoogleControlTarget {
  connectionId: string
  customerId: string
  level: ControlLevel
  id: string
  // The ad's ad group; an ad cannot be addressed without it.
  adGroupId?: string | null
}

function googleResource(target: GoogleControlTarget): { service: string; resourceName: string } {
  const customer = `customers/${target.customerId}`
  if (target.level === "campaign") {
    return { service: "campaigns", resourceName: `${customer}/campaigns/${target.id}` }
  }
  if (target.level === "adGroup") {
    return { service: "adGroups", resourceName: `${customer}/adGroups/${target.id}` }
  }
  if (!target.adGroupId) {
    throw new PlatformControlError("google", "The ad's ad group is not known.")
  }
  return {
    service: "adGroupAds",
    resourceName: `${customer}/adGroupAds/${target.adGroupId}~${target.id}`,
  }
}

export class GoogleCampaignControl {
  constructor(private readonly client: GoogleAdsMutator) {}

  async setStatus(target: GoogleControlTarget, active: boolean): Promise<void> {
    const { service, resourceName } = googleResource(target)
    await this.client.mutate({
      connectionId: target.connectionId,
      customerId: target.customerId,
      service,
      operations: [
        { update: { resourceName, status: active ? "ENABLED" : "PAUSED" }, updateMask: "status" },
      ],
    })
  }

  async remove(target: GoogleControlTarget): Promise<void> {
    const { service, resourceName } = googleResource(target)
    await this.client.mutate({
      connectionId: target.connectionId,
      customerId: target.customerId,
      service,
      operations: [{ remove: resourceName }],
    })
  }
}
