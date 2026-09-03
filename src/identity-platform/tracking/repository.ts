import { randomBytes, randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { RecordClickInput } from "./types"

export interface LiveVisitorRow {
  visitorId: string
  sessionId: string
  firstSeenAt: string
  lastSeenAt: string
  currentPageUrl: string | null
  currentPageTitle: string | null
  productId: string | null
  productName: string | null
  country: string | null
  city: string | null
  deviceType: string | null
  browser: string | null
  trafficSource: string | null
  campaign: string | null
  currentActivity: string | null
}

export interface UpsertLiveVisitorInput {
  organizationId: string
  visitorId: string
  sessionId: string
  currentPageUrl: string | null
  currentPageTitle: string | null
  productId: string | null
  productName: string | null
  country: string | null
  city: string | null
  deviceType: string | null
  browser: string | null
  trafficSource: string | null
  campaign: string | null
  currentActivity: string
}

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
  // HEARTBEAT events never reach here -- the service layer skips this insert for them entirely
  // (see TrackingService.recordEvent) so a 30s presence ping never bloats this table; every other
  // event type is inserted, including PAGE_VIEW/CLICK as before.
  async insertClickEvent(input: RecordClickInput): Promise<void> {
    await this.database.query(
      `INSERT INTO tracking_events (
         id, organization_id, campaign_link_id, event_type, event_id, visitor_id, session_id,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         landing_url, referrer_url, device_type, country_code,
         click_id, click_id_platform, platform_campaign_id, platform_adgroup_id,
         platform_keyword, platform_creative_id,
         customer_ref, customer_id, properties, page, device, geo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                 $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      [
        randomUUID(),
        input.organizationId,
        input.campaignLinkId,
        input.eventType,
        input.eventId,
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
        input.geo?.countryCode ?? null,
        input.clickId,
        input.clickIdPlatform,
        input.platformCampaignId,
        input.platformAdgroupId,
        input.platformKeyword,
        input.platformCreativeId,
        input.customerRef,
        input.customerId,
        input.properties ? JSON.stringify(input.properties) : null,
        input.page ? JSON.stringify(input.page) : null,
        input.device ? JSON.stringify(input.device) : null,
        input.geo ? JSON.stringify(input.geo) : null,
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

  // One row per (organization_id, visitor_id), kept fresh by every capture call including
  // heartbeats -- this is what GET /v1/tracking/live-visitors reads, filtered by last_seen_at,
  // rather than scanning the append-only tracking_events table for "last row per visitor".
  async upsertLiveVisitor(input: UpsertLiveVisitorInput): Promise<void> {
    await this.database.query(
      `INSERT INTO tracking_live_visitors (
         id, organization_id, visitor_id, session_id,
         current_page_url, current_page_title, product_id, product_name,
         country, city, device_type, browser, traffic_source, campaign, current_activity
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (organization_id, visitor_id) DO UPDATE SET
         session_id = excluded.session_id,
         last_seen_at = now(),
         current_page_url = excluded.current_page_url,
         current_page_title = excluded.current_page_title,
         product_id = excluded.product_id,
         product_name = excluded.product_name,
         country = coalesce(excluded.country, tracking_live_visitors.country),
         city = coalesce(excluded.city, tracking_live_visitors.city),
         device_type = coalesce(excluded.device_type, tracking_live_visitors.device_type),
         browser = coalesce(excluded.browser, tracking_live_visitors.browser),
         traffic_source = coalesce(excluded.traffic_source, tracking_live_visitors.traffic_source),
         campaign = coalesce(excluded.campaign, tracking_live_visitors.campaign),
         current_activity = excluded.current_activity`,
      [
        randomUUID(),
        input.organizationId,
        input.visitorId,
        input.sessionId,
        input.currentPageUrl,
        input.currentPageTitle,
        input.productId,
        input.productName,
        input.country,
        input.city,
        input.deviceType,
        input.browser,
        input.trafficSource,
        input.campaign,
        input.currentActivity,
      ]
    )
  }

  // sinceTimestamp is a pre-computed ISO cutoff (now - live_visitor_timeout), not a raw interval
  // -- keeps the query portable across real Postgres and the pg-mem test harness, which doesn't
  // reliably support casting a parameterized string into an interval.
  async listLiveVisitors(
    organizationId: string,
    sinceTimestamp: string
  ): Promise<LiveVisitorRow[]> {
    const result = await this.database.query<{
      visitor_id: string
      session_id: string
      first_seen_at: string
      last_seen_at: string
      current_page_url: string | null
      current_page_title: string | null
      product_id: string | null
      product_name: string | null
      country: string | null
      city: string | null
      device_type: string | null
      browser: string | null
      traffic_source: string | null
      campaign: string | null
      current_activity: string | null
    }>(
      `SELECT visitor_id, session_id, first_seen_at, last_seen_at,
              current_page_url, current_page_title, product_id, product_name,
              country, city, device_type, browser, traffic_source, campaign, current_activity
       FROM tracking_live_visitors
       WHERE organization_id = $1 AND last_seen_at > $2::timestamptz
       ORDER BY last_seen_at DESC`,
      [organizationId, sinceTimestamp]
    )

    return result.rows.map((row) => ({
      visitorId: row.visitor_id,
      sessionId: row.session_id,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      currentPageUrl: row.current_page_url,
      currentPageTitle: row.current_page_title,
      productId: row.product_id,
      productName: row.product_name,
      country: row.country,
      city: row.city,
      deviceType: row.device_type,
      browser: row.browser,
      trafficSource: row.traffic_source,
      campaign: row.campaign,
      currentActivity: row.current_activity,
    }))
  }

  async getTrackingConfigOverride(organizationId: string): Promise<unknown> {
    const result = await this.database.query<{ tracking_config: unknown }>(
      `SELECT tracking_config FROM organizations WHERE id = $1`,
      [organizationId]
    )
    return result.rows[0]?.tracking_config ?? null
  }
}
