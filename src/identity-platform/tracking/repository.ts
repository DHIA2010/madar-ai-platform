import { randomBytes, randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { RecordClickInput } from "./types"

export class TrackingRepository {
  constructor(private readonly database: PostgresDatabase) {}

  // Resolves the storefront capture snippet's public site key to a tenant -- deliberately not
  // organization_id itself (see the public_tracking_key column comment in migration 037).
  async findOrganizationIdBySiteKey(siteKey: string): Promise<string | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT id FROM organizations WHERE public_tracking_key = $1`,
      [siteKey]
    )
    return result.rows[0]?.id ?? null
  }

  // Lazily generates the key on first request rather than backfilling every organization at
  // migration time -- most orgs will never install the snippet.
  async ensureSiteKey(organizationId: string): Promise<string> {
    const existing = await this.database.query<{ public_tracking_key: string | null }>(
      `SELECT public_tracking_key FROM organizations WHERE id = $1`,
      [organizationId]
    )
    const current = existing.rows[0]?.public_tracking_key
    if (current) {
      return current
    }

    const siteKey = `mtk_${randomBytes(12).toString("hex")}`
    await this.database.query(`UPDATE organizations SET public_tracking_key = $2 WHERE id = $1`, [
      organizationId,
      siteKey,
    ])
    return siteKey
  }

  // Deliberately two separate, independently-fireable inserts rather than one transaction --
  // a failure in either must never surface back to the redirect route that already responded.
  // One method per table serves both CLICK (redirect, campaignId/campaignLinkId always known)
  // and PAGE_VIEW (storefront snippet capture, both null until order-time UTM matching) --
  // see the RecordClickInput doc comment in ./types.ts.
  async insertClickEvent(input: RecordClickInput): Promise<void> {
    await this.database.query(
      `INSERT INTO tracking_events (
         id, organization_id, campaign_link_id, event_type, visitor_id, session_id,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         landing_url, referrer_url, device_type,
         click_id, click_id_platform, platform_campaign_id, platform_adgroup_id,
         platform_keyword, platform_creative_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        randomUUID(),
        input.organizationId,
        input.campaignLinkId,
        input.eventType,
        input.visitorId,
        input.sessionId,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
        input.utmContent,
        input.utmTerm,
        input.landingUrl,
        input.referrerUrl,
        input.deviceType,
        input.clickId,
        input.clickIdPlatform,
        input.platformCampaignId,
        input.platformAdgroupId,
        input.platformKeyword,
        input.platformCreativeId,
      ]
    )
  }

  async insertAttribution(input: RecordClickInput): Promise<void> {
    await this.database.query(
      `INSERT INTO attributions (
         id, organization_id, campaign_id, campaign_link_id, visitor_id, session_id,
         customer_ref, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         click_id, click_id_platform, platform_campaign_id, platform_adgroup_id,
         platform_keyword, platform_creative_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        randomUUID(),
        input.organizationId,
        input.campaignId,
        input.campaignLinkId,
        input.visitorId,
        input.sessionId,
        input.customerRef,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
        input.utmContent,
        input.utmTerm,
        input.clickId,
        input.clickIdPlatform,
        input.platformCampaignId,
        input.platformAdgroupId,
        input.platformKeyword,
        input.platformCreativeId,
      ]
    )
  }
}
