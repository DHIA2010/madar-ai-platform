import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { normalizeUtmValue } from "../tracking/utm"

import {
  ORDER_PROVIDERS,
  type AttributionStatus,
  type CandidateOrder,
  type MatchMethod,
  type OrderAttributionView,
  type OrderProvider,
  type OrderSignals,
} from "./types"

function toIso(value: unknown): string {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

// Extracts a note_attributes value by name (Shopify's array-of-{name,value} convention). No
// storefront snippet writes these yet (out of scope for this pass), so this realistically
// returns null today -- it's here so a future snippet just needs to set the attribute, not
// require any change to the matching chain.
function noteAttribute(noteAttributes: unknown, name: string): string | null {
  if (!Array.isArray(noteAttributes)) return null
  const match = noteAttributes.find(
    (entry): entry is { name?: string; value?: string } =>
      Boolean(entry) && typeof entry === "object" && (entry as { name?: string }).name === name
  )
  return match?.value ?? null
}

// landing_site is the URL the customer actually landed on -- if they clicked a campaign link,
// our redirect already appended utm_source/medium/campaign to it, so this is the one signal
// that can realistically match today without any future storefront integration.
function utmFromUrl(rawUrl: string | null): {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
} {
  if (!rawUrl) return { utmSource: null, utmMedium: null, utmCampaign: null }
  try {
    const url = new URL(rawUrl, "https://placeholder.invalid")
    return {
      utmSource: url.searchParams.get("utm_source"),
      utmMedium: url.searchParams.get("utm_medium"),
      utmCampaign: url.searchParams.get("utm_campaign"),
    }
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null }
  }
}

function extractShopifySignals(payload: Record<string, unknown>): OrderSignals {
  const utm = utmFromUrl((payload.landing_site as string | undefined) ?? null)
  return {
    explicitAttributionId: noteAttribute(payload.note_attributes, "madar_attribution_id"),
    campaignLinkDisplayId: noteAttribute(payload.note_attributes, "madar_link_id"),
    sessionId:
      noteAttribute(payload.note_attributes, "madar_session_id") ??
      (payload.cart_token as string | undefined) ??
      null,
    customerEmail:
      (payload.customer as { email?: string } | undefined)?.email ??
      (payload.email as string | undefined) ??
      null,
    ...utm,
  }
}

// No confirmed UTM/landing-page field on Salla or Zid order payloads (see the plan's flagged
// assumptions) -- customer email is the only signal attempted here, defensively, since neither
// provider's raw schema is fully documented in this codebase.
function extractGenericSignals(payload: Record<string, unknown>): OrderSignals {
  const customer = payload.customer as { email?: string } | undefined
  return {
    explicitAttributionId: null,
    campaignLinkDisplayId: null,
    sessionId: null,
    customerEmail: customer?.email ?? null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  }
}

const PROVIDER_TABLES: Record<OrderProvider, { records: string; connections: string }> = {
  salla: { records: "salla_records", connections: "salla_oauth_connections" },
  shopify: { records: "shopify_records", connections: "shopify_oauth_connections" },
  zid: { records: "zid_records", connections: "zid_oauth_connections" },
}

interface OrderAttributionRow {
  id: string
  organization_id: string
  provider: string
  connection_id: string
  external_order_id: string
  order_created_at: Date | string
  currency: string | null
  total_amount: string | number | null
  customer_ref: string | null
  attribution_id: string | null
  campaign_id: string | null
  campaign_link_id: string | null
  match_method: string
  model_used: string
  attribution_status: string
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function mapOrderAttribution(row: OrderAttributionRow): OrderAttributionView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider as OrderProvider,
    connectionId: row.connection_id,
    externalOrderId: row.external_order_id,
    orderCreatedAt: toIso(row.order_created_at),
    currency: row.currency,
    totalAmount: toNumber(row.total_amount),
    customerRef: row.customer_ref,
    attributionId: row.attribution_id,
    campaignId: row.campaign_id,
    campaignLinkId: row.campaign_link_id,
    matchMethod: row.match_method as MatchMethod,
    modelUsed: row.model_used,
    attributionStatus: row.attribution_status as AttributionStatus,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export class AttributionRepository {
  constructor(private readonly database: PostgresDatabase) {}

  // Candidates are orders not yet marked ATTRIBUTED -- unattributed orders are retried on every
  // run (a later click/UTM match may resolve them), attributed ones are skipped.
  async fetchCandidateOrders(
    organizationId: string,
    workspaceId: string | null,
    provider?: OrderProvider
  ): Promise<CandidateOrder[]> {
    const providers = provider ? [provider] : [...ORDER_PROVIDERS]
    const results = await Promise.all(
      providers.map(async (p) => {
        const tables = PROVIDER_TABLES[p]
        const result = await this.database.query<{
          connection_id: string
          entity_id: string
          payload: Record<string, unknown>
          updated_at: Date | string
        }>(
          `SELECT o.connection_id, o.entity_id, o.payload, o.updated_at
           FROM ${tables.records} o
           JOIN ${tables.connections} c ON c.id = o.connection_id
           LEFT JOIN order_attributions oa
             ON oa.provider = $3 AND oa.connection_id = o.connection_id AND oa.external_order_id = o.entity_id
           WHERE o.entity_type = 'orders'
             AND c.organization_id = $1
             AND c.deleted_at IS NULL
             AND ($2::uuid IS NULL OR c.workspace_id = $2::uuid)
             AND (oa.id IS NULL OR oa.attribution_status = 'UNATTRIBUTED')`,
          [organizationId, workspaceId, p]
        )
        return result.rows.map((row) => this.toCandidateOrder(p, row))
      })
    )
    return results.flat()
  }

  private toCandidateOrder(
    provider: OrderProvider,
    row: {
      connection_id: string
      entity_id: string
      payload: Record<string, unknown>
      updated_at: Date | string
    }
  ): CandidateOrder {
    const payload = row.payload ?? {}
    const signals =
      provider === "shopify" ? extractShopifySignals(payload) : extractGenericSignals(payload)

    if (provider === "salla") {
      const total = payload.total as { amount?: number; currency?: string } | undefined
      const date = payload.date as { date?: string } | undefined
      return {
        provider,
        connectionId: row.connection_id,
        externalOrderId: row.entity_id,
        orderCreatedAt: date?.date ? toIso(date.date) : toIso(row.updated_at),
        currency: total?.currency ?? null,
        totalAmount: toNumber(total?.amount),
        signals,
      }
    }

    if (provider === "shopify") {
      return {
        provider,
        connectionId: row.connection_id,
        externalOrderId: row.entity_id,
        orderCreatedAt: (payload.created_at as string | undefined)
          ? toIso(payload.created_at)
          : toIso(row.updated_at),
        currency: (payload.currency as string | undefined) ?? null,
        totalAmount: toNumber(payload.total_price),
        signals,
      }
    }

    return {
      provider,
      connectionId: row.connection_id,
      externalOrderId: row.entity_id,
      orderCreatedAt: (payload.created_at as string | undefined)
        ? toIso(payload.created_at)
        : toIso(row.updated_at),
      currency: (payload.currency_code as string | undefined) ?? null,
      totalAmount: toNumber(payload.order_total),
      signals,
    }
  }

  async findAttributionBySessionId(
    organizationId: string,
    sessionId: string
  ): Promise<{
    attributionId: string
    campaignId: string | null
    campaignLinkId: string | null
  } | null> {
    const result = await this.database.query<{
      id: string
      campaign_id: string | null
      campaign_link_id: string | null
    }>(
      `SELECT id, campaign_id, campaign_link_id FROM attributions
       WHERE organization_id = $1 AND session_id = $2
       ORDER BY occurred_at DESC LIMIT 1`,
      [organizationId, sessionId]
    )
    const row = result.rows[0]
    return row
      ? { attributionId: row.id, campaignId: row.campaign_id, campaignLinkId: row.campaign_link_id }
      : null
  }

  async findAttributionByCustomerRef(
    organizationId: string,
    customerRef: string
  ): Promise<{
    attributionId: string
    campaignId: string | null
    campaignLinkId: string | null
  } | null> {
    const result = await this.database.query<{
      id: string
      campaign_id: string | null
      campaign_link_id: string | null
    }>(
      `SELECT id, campaign_id, campaign_link_id FROM attributions
       WHERE organization_id = $1 AND customer_ref = $2
       ORDER BY occurred_at DESC LIMIT 1`,
      [organizationId, customerRef]
    )
    const row = result.rows[0]
    return row
      ? { attributionId: row.id, campaignId: row.campaign_id, campaignLinkId: row.campaign_link_id }
      : null
  }

  async findCampaignLinkByUtm(
    organizationId: string,
    utmSource: string,
    utmMedium: string,
    utmCampaign: string,
    before: string
  ): Promise<{ campaignId: string; campaignLinkId: string } | null> {
    const result = await this.database.query<{ id: string; campaign_id: string }>(
      `SELECT id, campaign_id FROM campaign_links
       WHERE organization_id = $1 AND utm_source = $2 AND utm_medium = $3 AND utm_campaign = $4
         AND deleted_at IS NULL AND created_at <= $5
       ORDER BY created_at DESC LIMIT 1`,
      [
        organizationId,
        normalizeUtmValue(utmSource),
        normalizeUtmValue(utmMedium),
        normalizeUtmValue(utmCampaign),
        before,
      ]
    )
    const row = result.rows[0]
    return row ? { campaignId: row.campaign_id, campaignLinkId: row.id } : null
  }

  async upsertOrderAttribution(input: {
    organizationId: string
    provider: OrderProvider
    connectionId: string
    externalOrderId: string
    orderCreatedAt: string
    currency: string | null
    totalAmount: number | null
    customerRef: string | null
    attributionId: string | null
    campaignId: string | null
    campaignLinkId: string | null
    matchMethod: MatchMethod
    attributionStatus: AttributionStatus
  }): Promise<OrderAttributionView> {
    const result = await this.database.query<OrderAttributionRow>(
      `INSERT INTO order_attributions (
         id, organization_id, provider, connection_id, external_order_id, order_created_at,
         currency, total_amount, customer_ref, attribution_id, campaign_id, campaign_link_id,
         match_method, model_used, attribution_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'LAST_CLICK', $14)
       ON CONFLICT (provider, connection_id, external_order_id)
       DO UPDATE SET
         currency = EXCLUDED.currency,
         total_amount = EXCLUDED.total_amount,
         customer_ref = EXCLUDED.customer_ref,
         attribution_id = EXCLUDED.attribution_id,
         campaign_id = EXCLUDED.campaign_id,
         campaign_link_id = EXCLUDED.campaign_link_id,
         match_method = EXCLUDED.match_method,
         attribution_status = EXCLUDED.attribution_status,
         updated_at = now()
       RETURNING id, organization_id, provider, connection_id, external_order_id, order_created_at,
         currency, total_amount, customer_ref, attribution_id, campaign_id, campaign_link_id,
         match_method, model_used, attribution_status, created_at, updated_at`,
      [
        randomUUID(),
        input.organizationId,
        input.provider,
        input.connectionId,
        input.externalOrderId,
        input.orderCreatedAt,
        input.currency,
        input.totalAmount,
        input.customerRef,
        input.attributionId,
        input.campaignId,
        input.campaignLinkId,
        input.matchMethod,
        input.attributionStatus,
      ]
    )
    return mapOrderAttribution(result.rows[0])
  }
}
