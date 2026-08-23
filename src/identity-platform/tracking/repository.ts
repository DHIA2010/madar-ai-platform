import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { RecordClickInput } from "./types"

export class TrackingRepository {
  constructor(private readonly database: PostgresDatabase) {}

  // Deliberately two separate, independently-fireable inserts rather than one transaction --
  // a failure in either must never surface back to the redirect route that already responded.
  async insertClickEvent(input: RecordClickInput): Promise<void> {
    await this.database.query(
      `INSERT INTO tracking_events (
         id, organization_id, campaign_link_id, event_type, visitor_id, session_id,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         landing_url, referrer_url, device_type
       ) VALUES ($1, $2, $3, 'CLICK', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        randomUUID(),
        input.organizationId,
        input.campaignLinkId,
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
      ]
    )
  }

  async insertAttribution(input: RecordClickInput): Promise<void> {
    await this.database.query(
      `INSERT INTO attributions (
         id, organization_id, campaign_id, campaign_link_id, visitor_id, session_id,
         utm_source, utm_medium, utm_campaign, utm_content, utm_term
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomUUID(),
        input.organizationId,
        input.campaignId,
        input.campaignLinkId,
        input.visitorId,
        input.sessionId,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
        input.utmContent,
        input.utmTerm,
      ]
    )
  }
}
