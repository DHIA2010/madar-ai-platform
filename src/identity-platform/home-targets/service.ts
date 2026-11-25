import { z } from "zod"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export const HOME_TARGET_SCOPES = ["campaigns", "stores", "pos"] as const
export type HomeTargetScope = (typeof HOME_TARGET_SCOPES)[number]

// The KPIs each tab can set a target on (the same names the tabs' numbers use).
export const HOME_TARGET_KPIS: Record<HomeTargetScope, readonly string[]> = {
  campaigns: [
    "conversions",
    "revenue",
    "roas",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "cpc",
    "cpa",
    "conversionRate",
  ],
  stores: ["totalSales", "totalOrders", "averageOrderValue"],
  pos: ["totalSales", "netSales", "invoiceCount", "avgInvoiceValue", "customerCount", "returns"],
}

export const homeTargetInputSchema = z.object({
  kpi: z.string().min(1).max(40),
  // null takes the KPI's target away.
  target: z.number().min(0).max(1_000_000_000_000).nullable().optional(),
})

export interface HomeTargetsView {
  // The KPI the tab shows, or null before one was picked.
  selected: string | null
  // Target by KPI.
  targets: Record<string, number>
}

// The home page's targets: the team's goal for a KPI over the chosen period, and the KPI each
// tab shows. Anyone in the organization can see and change them.
export class HomeTargets {
  constructor(private readonly db: PostgresDatabase) {}

  async get(organizationId: string, scope: HomeTargetScope): Promise<HomeTargetsView> {
    const [targets, choice] = await Promise.all([
      this.db.query<{ kpi: string; target: string | number }>(
        "SELECT kpi, target FROM home_targets WHERE organization_id = $1 AND scope = $2",
        [organizationId, scope]
      ),
      this.db.query<{ kpi: string }>(
        "SELECT kpi FROM home_target_choices WHERE organization_id = $1 AND scope = $2",
        [organizationId, scope]
      ),
    ])
    return {
      selected: choice.rows[0]?.kpi ?? null,
      targets: Object.fromEntries(targets.rows.map((row) => [row.kpi, Number(row.target)])),
    }
  }

  // Shows a KPI on the tab and, when a target is given, saves it (null removes it).
  async set(
    organizationId: string,
    userId: string,
    scope: HomeTargetScope,
    input: z.infer<typeof homeTargetInputSchema>
  ): Promise<HomeTargetsView> {
    if (!HOME_TARGET_KPIS[scope].includes(input.kpi)) {
      throw ERRORS.validation({ kpi: "Not a KPI this tab can have a target on." })
    }
    await this.db.query(
      `INSERT INTO home_target_choices (organization_id, scope, kpi) VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, scope) DO UPDATE SET kpi = $3, updated_at = now()`,
      [organizationId, scope, input.kpi]
    )
    if (input.target === null) {
      await this.db.query(
        "DELETE FROM home_targets WHERE organization_id = $1 AND scope = $2 AND kpi = $3",
        [organizationId, scope, input.kpi]
      )
    } else if (input.target !== undefined) {
      await this.db.query(
        `INSERT INTO home_targets (organization_id, scope, kpi, target, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, scope, kpi)
         DO UPDATE SET target = $4, updated_by = $5, updated_at = now()`,
        [organizationId, scope, input.kpi, input.target, userId]
      )
    }
    return this.get(organizationId, scope)
  }
}
