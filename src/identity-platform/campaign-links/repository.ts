import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { CampaignLinkView, TrackingType } from "./types"

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

interface CampaignLinkRow {
  id: string
  organization_id: string
  workspace_id: string | null
  campaign_id: string
  display_id: string
  name: string
  tracking_type: string
  destination_base_url: string
  final_url: string
  short_url: string | null
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string | null
  utm_term: string | null
  ad_group_name: string | null
  ad_name: string | null
  custom_params: unknown
  enabled: boolean
  created_by: string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function mapCampaignLink(row: CampaignLinkRow): CampaignLinkView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    displayId: row.display_id,
    name: row.name,
    trackingType: row.tracking_type as TrackingType,
    destinationBaseUrl: row.destination_base_url,
    finalUrl: row.final_url,
    shortUrl: row.short_url,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmTerm: row.utm_term,
    adGroupName: row.ad_group_name,
    adName: row.ad_name,
    customParams:
      row.custom_params && typeof row.custom_params === "object"
        ? (row.custom_params as Record<string, string>)
        : {},
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

const CAMPAIGN_LINK_SELECT = `
  SELECT id, organization_id, workspace_id, campaign_id, display_id, name, tracking_type,
    destination_base_url, final_url, short_url, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, ad_group_name, ad_name, custom_params, enabled, created_by,
    created_at, updated_at
  FROM campaign_links
`

export interface CreateCampaignLinkRow {
  organizationId: string
  workspaceId: string | null
  campaignId: string
  name: string
  trackingType: TrackingType
  destinationBaseUrl: string
  finalUrl: string
  shortUrl: string | null
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
  adGroupName: string | null
  adName: string | null
  customParams: Record<string, string>
  createdBy: string | null
}

export class CampaignLinkRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async nextDisplayId(): Promise<string> {
    const result = await this.database.query<{ seq: string | number }>(
      `SELECT nextval('campaign_link_display_seq') AS seq`
    )
    const seq = Number(result.rows[0].seq)
    const year = new Date().getUTCFullYear()
    return `MD-${year}-${String(seq).padStart(5, "0")}`
  }

  async list(organizationId: string, workspaceId: string | null): Promise<CampaignLinkView[]> {
    const result = await this.database.query<CampaignLinkRow>(
      `${CAMPAIGN_LINK_SELECT}
       WHERE organization_id = $1 AND deleted_at IS NULL
         AND ($2::uuid IS NULL OR workspace_id = $2)
       ORDER BY created_at DESC`,
      [organizationId, workspaceId]
    )
    return result.rows.map(mapCampaignLink)
  }

  async findById(organizationId: string, id: string): Promise<CampaignLinkView | null> {
    const result = await this.database.query<CampaignLinkRow>(
      `${CAMPAIGN_LINK_SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    return result.rows[0] ? mapCampaignLink(result.rows[0]) : null
  }

  // No organization scoping -- the public short-link redirect resolves display_id alone.
  async findByDisplayId(displayId: string): Promise<CampaignLinkView | null> {
    const result = await this.database.query<CampaignLinkRow>(
      `${CAMPAIGN_LINK_SELECT} WHERE display_id = $1 AND deleted_at IS NULL`,
      [displayId]
    )
    return result.rows[0] ? mapCampaignLink(result.rows[0]) : null
  }

  async create(input: CreateCampaignLinkRow & { displayId: string }): Promise<CampaignLinkView> {
    const id = randomUUID()
    const result = await this.database.query<CampaignLinkRow>(
      `INSERT INTO campaign_links (
         id, organization_id, workspace_id, campaign_id, display_id, name, tracking_type,
         destination_base_url, final_url, short_url, utm_source, utm_medium, utm_campaign,
         utm_content, utm_term, ad_group_name, ad_name, custom_params, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id, organization_id, workspace_id, campaign_id, display_id, name, tracking_type,
         destination_base_url, final_url, short_url, utm_source, utm_medium, utm_campaign,
         utm_content, utm_term, ad_group_name, ad_name, custom_params, enabled, created_by,
         created_at, updated_at`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.campaignId,
        input.displayId,
        input.name,
        input.trackingType,
        input.destinationBaseUrl,
        input.finalUrl,
        input.shortUrl,
        input.utmSource,
        input.utmMedium,
        input.utmCampaign,
        input.utmContent,
        input.utmTerm,
        input.adGroupName,
        input.adName,
        JSON.stringify(input.customParams),
        input.createdBy,
      ]
    )
    return mapCampaignLink(result.rows[0])
  }

  // Deliberately cannot update utm_*/tracking_type/campaign_id/display_id -- immutability is
  // structural (these columns are simply absent from the SET clause), not just a runtime check.
  async update(
    organizationId: string,
    id: string,
    input: { name?: string; customParams?: Record<string, string> }
  ): Promise<CampaignLinkView | null> {
    const result = await this.database.query<CampaignLinkRow>(
      `UPDATE campaign_links SET
         name = COALESCE($3, name),
         custom_params = COALESCE($4, custom_params),
         updated_at = now()
       WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id, organization_id, workspace_id, campaign_id, display_id, name, tracking_type,
         destination_base_url, final_url, short_url, utm_source, utm_medium, utm_campaign,
         utm_content, utm_term, ad_group_name, ad_name, custom_params, enabled, created_by,
         created_at, updated_at`,
      [
        organizationId,
        id,
        input.name ?? null,
        input.customParams ? JSON.stringify(input.customParams) : null,
      ]
    )
    return result.rows[0] ? mapCampaignLink(result.rows[0]) : null
  }

  async setEnabled(
    organizationId: string,
    id: string,
    enabled: boolean
  ): Promise<CampaignLinkView | null> {
    const result = await this.database.query<CampaignLinkRow>(
      `UPDATE campaign_links SET enabled = $3, updated_at = now()
       WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING id, organization_id, workspace_id, campaign_id, display_id, name, tracking_type,
         destination_base_url, final_url, short_url, utm_source, utm_medium, utm_campaign,
         utm_content, utm_term, ad_group_name, ad_name, custom_params, enabled, created_by,
         created_at, updated_at`,
      [organizationId, id, enabled]
    )
    return result.rows[0] ? mapCampaignLink(result.rows[0]) : null
  }

  async archive(organizationId: string, id: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE campaign_links SET deleted_at = now(), updated_at = now()
       WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    return (result.rowCount ?? 0) > 0
  }
}
