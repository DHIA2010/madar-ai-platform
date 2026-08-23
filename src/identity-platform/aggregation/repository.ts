import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type {
  CampaignLinkAttributionDetail,
  CampaignLinkSummaryRow,
  DailyMetricPoint,
  MatchMethodBreakdownRow,
} from "./types"

function toNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

interface ClickAggregateRow {
  key_id: string
  workspace_id: string | null
  clicks: string | number
  sessions: string | number
  [key: string]: unknown
}

interface OrderAggregateRow {
  key_id: string
  workspace_id: string | null
  orders_count: string | number
  revenue: string | number | null
  currency: string | null
  [key: string]: unknown
}

export class AggregationRepository {
  constructor(private readonly database: PostgresDatabase) {}

  private async fetchClicksByLink(
    organizationId: string,
    metricDate: string
  ): Promise<ClickAggregateRow[]> {
    const result = await this.database.query<ClickAggregateRow>(
      `SELECT te.campaign_link_id AS key_id, cl.workspace_id, count(*) AS clicks,
              count(DISTINCT te.session_id) AS sessions
       FROM tracking_events te
       JOIN campaign_links cl ON cl.id = te.campaign_link_id
       WHERE te.organization_id = $1 AND te.event_type = 'CLICK'
         AND te.occurred_at::date = $2::date
       GROUP BY te.campaign_link_id, cl.workspace_id`,
      [organizationId, metricDate]
    )
    return result.rows
  }

  private async fetchOrdersByLink(
    organizationId: string,
    metricDate: string
  ): Promise<OrderAggregateRow[]> {
    const result = await this.database.query<OrderAggregateRow>(
      `SELECT oa.campaign_link_id AS key_id, cl.workspace_id, count(*) AS orders_count,
              sum(oa.total_amount) AS revenue, max(oa.currency) AS currency
       FROM order_attributions oa
       JOIN campaign_links cl ON cl.id = oa.campaign_link_id
       WHERE oa.organization_id = $1 AND oa.attribution_status = 'ATTRIBUTED' AND oa.campaign_link_id IS NOT NULL
         AND oa.order_created_at::date = $2::date
       GROUP BY oa.campaign_link_id, cl.workspace_id`,
      [organizationId, metricDate]
    )
    return result.rows
  }

  private async fetchClicksByCampaign(
    organizationId: string,
    metricDate: string
  ): Promise<ClickAggregateRow[]> {
    const result = await this.database.query<ClickAggregateRow>(
      `SELECT cl.campaign_id AS key_id, cl.workspace_id, count(*) AS clicks,
              count(DISTINCT te.session_id) AS sessions
       FROM tracking_events te
       JOIN campaign_links cl ON cl.id = te.campaign_link_id
       WHERE te.organization_id = $1 AND te.event_type = 'CLICK'
         AND te.occurred_at::date = $2::date
       GROUP BY cl.campaign_id, cl.workspace_id`,
      [organizationId, metricDate]
    )
    return result.rows
  }

  private async fetchOrdersByCampaign(
    organizationId: string,
    metricDate: string
  ): Promise<OrderAggregateRow[]> {
    const result = await this.database.query<OrderAggregateRow>(
      `SELECT oa.campaign_id AS key_id, c.workspace_id, count(*) AS orders_count,
              sum(oa.total_amount) AS revenue, max(oa.currency) AS currency
       FROM order_attributions oa
       JOIN campaigns c ON c.id = oa.campaign_id
       WHERE oa.organization_id = $1 AND oa.attribution_status = 'ATTRIBUTED' AND oa.campaign_id IS NOT NULL
         AND oa.order_created_at::date = $2::date
       GROUP BY oa.campaign_id, c.workspace_id`,
      [organizationId, metricDate]
    )
    return result.rows
  }

  private mergeAggregates(clicks: ClickAggregateRow[], orders: OrderAggregateRow[]) {
    const merged = new Map<
      string,
      {
        workspaceId: string | null
        clicks: number
        sessions: number
        ordersCount: number
        revenue: number
        currency: string | null
      }
    >()

    for (const row of clicks) {
      merged.set(row.key_id, {
        workspaceId: row.workspace_id,
        clicks: toNumber(row.clicks),
        sessions: toNumber(row.sessions),
        ordersCount: 0,
        revenue: 0,
        currency: null,
      })
    }
    for (const row of orders) {
      const existing = merged.get(row.key_id)
      if (existing) {
        existing.ordersCount = toNumber(row.orders_count)
        existing.revenue = toNumber(row.revenue)
        existing.currency = row.currency
      } else {
        merged.set(row.key_id, {
          workspaceId: row.workspace_id,
          clicks: 0,
          sessions: 0,
          ordersCount: toNumber(row.orders_count),
          revenue: toNumber(row.revenue),
          currency: row.currency,
        })
      }
    }
    return merged
  }

  // Computes and upserts both daily-metrics tables for one day -- the only write path that
  // populates the tables dashboard/summary reads are allowed to query.
  async rollupDaily(
    organizationId: string,
    metricDate: string
  ): Promise<{ campaignLinksUpdated: number; campaignsUpdated: number }> {
    const [linkClicks, linkOrders, campaignClicks, campaignOrders] = await Promise.all([
      this.fetchClicksByLink(organizationId, metricDate),
      this.fetchOrdersByLink(organizationId, metricDate),
      this.fetchClicksByCampaign(organizationId, metricDate),
      this.fetchOrdersByCampaign(organizationId, metricDate),
    ])

    const linkMetrics = this.mergeAggregates(linkClicks, linkOrders)
    const campaignMetrics = this.mergeAggregates(campaignClicks, campaignOrders)

    await Promise.all(
      [...linkMetrics.entries()].map(([campaignLinkId, metrics]) =>
        this.database.query(
          `INSERT INTO campaign_link_daily_metrics (
             id, organization_id, workspace_id, campaign_link_id, metric_date,
             clicks, sessions, orders_count, revenue, currency
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (campaign_link_id, metric_date) DO UPDATE SET
             clicks = EXCLUDED.clicks, sessions = EXCLUDED.sessions,
             orders_count = EXCLUDED.orders_count, revenue = EXCLUDED.revenue,
             currency = EXCLUDED.currency, updated_at = now()`,
          [
            randomUUID(),
            organizationId,
            metrics.workspaceId,
            campaignLinkId,
            metricDate,
            metrics.clicks,
            metrics.sessions,
            metrics.ordersCount,
            metrics.revenue,
            metrics.currency,
          ]
        )
      )
    )

    await Promise.all(
      [...campaignMetrics.entries()].map(([campaignId, metrics]) =>
        this.database.query(
          `INSERT INTO campaign_daily_metrics (
             id, organization_id, workspace_id, campaign_id, metric_date,
             clicks, sessions, orders_count, revenue, currency
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (campaign_id, metric_date) DO UPDATE SET
             clicks = EXCLUDED.clicks, sessions = EXCLUDED.sessions,
             orders_count = EXCLUDED.orders_count, revenue = EXCLUDED.revenue,
             currency = EXCLUDED.currency, updated_at = now()`,
          [
            randomUUID(),
            organizationId,
            metrics.workspaceId,
            campaignId,
            metricDate,
            metrics.clicks,
            metrics.sessions,
            metrics.ordersCount,
            metrics.revenue,
            metrics.currency,
          ]
        )
      )
    )

    return { campaignLinksUpdated: linkMetrics.size, campaignsUpdated: campaignMetrics.size }
  }

  // Reads ONLY the precomputed daily-metrics table -- never tracking_events/order_attributions.
  async getCampaignLinksSummary(
    organizationId: string,
    workspaceId: string | null,
    range: { startDate: string | null; endDate: string | null }
  ): Promise<CampaignLinkSummaryRow[]> {
    const result = await this.database.query<{
      id: string
      display_id: string
      name: string
      campaign_id: string
      tracking_type: string
      enabled: boolean
      short_url: string | null
      final_url: string
      created_at: Date | string
      clicks: string | number
      sessions: string | number
      orders_count: string | number
      revenue: string | number
    }>(
      `SELECT cl.id, cl.display_id, cl.name, cl.campaign_id, cl.tracking_type, cl.enabled,
              cl.short_url, cl.final_url, cl.created_at,
              COALESCE(SUM(m.clicks), 0) AS clicks,
              COALESCE(SUM(m.sessions), 0) AS sessions,
              COALESCE(SUM(m.orders_count), 0) AS orders_count,
              COALESCE(SUM(m.revenue), 0) AS revenue
       FROM campaign_links cl
       LEFT JOIN campaign_link_daily_metrics m ON m.campaign_link_id = cl.id
         AND ($3::date IS NULL OR m.metric_date >= $3::date)
         AND ($4::date IS NULL OR m.metric_date <= $4::date)
       WHERE cl.organization_id = $1 AND cl.deleted_at IS NULL
         AND ($2::uuid IS NULL OR cl.workspace_id = $2::uuid)
       GROUP BY cl.id
       ORDER BY cl.created_at DESC`,
      [organizationId, workspaceId, range.startDate, range.endDate]
    )
    return result.rows.map((row) => ({
      id: row.id,
      displayId: row.display_id,
      name: row.name,
      campaignId: row.campaign_id,
      trackingType: row.tracking_type,
      enabled: row.enabled,
      shortUrl: row.short_url,
      finalUrl: row.final_url,
      clicks: toNumber(row.clicks),
      sessions: toNumber(row.sessions),
      ordersCount: toNumber(row.orders_count),
      revenue: toNumber(row.revenue),
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }))
  }

  async getLinkAttributionDetail(
    organizationId: string,
    campaignLinkId: string
  ): Promise<CampaignLinkAttributionDetail> {
    const [dailyResult, breakdownResult] = await Promise.all([
      this.database.query<{
        metric_date: Date | string
        clicks: string | number
        sessions: string | number
        orders_count: string | number
        revenue: string | number
        currency: string | null
      }>(
        `SELECT m.metric_date, m.clicks, m.sessions, m.orders_count, m.revenue, m.currency
         FROM campaign_link_daily_metrics m
         JOIN campaign_links cl ON cl.id = m.campaign_link_id
         WHERE cl.organization_id = $1 AND m.campaign_link_id = $2
         ORDER BY m.metric_date ASC`,
        [organizationId, campaignLinkId]
      ),
      this.database.query<{
        match_method: string
        orders_count: string | number
        revenue: string | number
      }>(
        `SELECT oa.match_method, count(*) AS orders_count, sum(oa.total_amount) AS revenue
         FROM order_attributions oa
         JOIN campaign_links cl ON cl.id = oa.campaign_link_id
         WHERE cl.organization_id = $1 AND oa.campaign_link_id = $2 AND oa.attribution_status = 'ATTRIBUTED'
         GROUP BY oa.match_method`,
        [organizationId, campaignLinkId]
      ),
    ])

    const daily: DailyMetricPoint[] = dailyResult.rows.map((row) => ({
      metricDate: toDateOnly(row.metric_date),
      clicks: toNumber(row.clicks),
      sessions: toNumber(row.sessions),
      ordersCount: toNumber(row.orders_count),
      revenue: toNumber(row.revenue),
      currency: row.currency,
    }))

    const byMatchMethod: MatchMethodBreakdownRow[] = breakdownResult.rows.map((row) => ({
      matchMethod: row.match_method,
      ordersCount: toNumber(row.orders_count),
      revenue: toNumber(row.revenue),
    }))

    return { daily, byMatchMethod }
  }
}
