import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// The sector plugins (الإضافات): each completes the cashier for one kind of business. They come
// with the POS app (subscriptions/app-access.ts keeps /v1/plugins and every plugin's routes to
// it), cost nothing, and are switched on or off by the business at will.
export const PLUGINS = ["laundry"] as const
export type PluginId = (typeof PLUGINS)[number]

export interface PluginState {
  id: PluginId
  enabled: boolean
}

export const isPluginId = (value: string): value is PluginId =>
  (PLUGINS as readonly string[]).includes(value)

export class PluginsService {
  constructor(private readonly db: PostgresDatabase) {}

  async list(organizationId: string): Promise<PluginState[]> {
    const rows = await this.db.query<{ plugin: string; enabled: boolean }>(
      `SELECT plugin, enabled FROM organization_plugins WHERE organization_id = $1`,
      [organizationId]
    )
    const enabled = new Map(rows.rows.map((row) => [row.plugin, row.enabled === true]))
    return PLUGINS.map((id) => ({ id, enabled: enabled.get(id) ?? false }))
  }

  async isEnabled(organizationId: string, plugin: PluginId): Promise<boolean> {
    const rows = await this.db.query<{ enabled: boolean }>(
      `SELECT enabled FROM organization_plugins WHERE organization_id = $1 AND plugin = $2`,
      [organizationId, plugin]
    )
    return rows.rows[0]?.enabled === true
  }

  async setEnabled(
    organizationId: string,
    plugin: string,
    enabled: boolean,
    userId: string | null
  ) {
    if (!isPluginId(plugin)) {
      throw new IdentityError("PLUGIN_NOT_FOUND", 404, "business", "Unknown plugin.")
    }
    await this.db.query(
      `INSERT INTO organization_plugins (organization_id, plugin, enabled, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (organization_id, plugin)
       DO UPDATE SET enabled = $3, updated_by = $4, updated_at = now()`,
      [organizationId, plugin, enabled, userId]
    )
    return this.list(organizationId)
  }
}
