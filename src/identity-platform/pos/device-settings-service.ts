import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import {
  DEFAULT_POS_DEVICE_SETTINGS,
  type PosDeviceSettings,
  type PosDeviceSettingsView,
} from "./device-settings-types"

interface SettingsRow {
  organization_id: string
  workspace_id: string | null
  settings: unknown
  updated_by: string | null
  updated_at: Date | string
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// jsonb arrives parsed through node-postgres but as a string through some drivers and pg-mem.
function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

// Merges a stored row over the defaults one group at a time. A settings row written before a
// peripheral existed simply has no key for it, and would otherwise come back undefined and
// crash the screen reading it.
function withDefaults(stored: Record<string, unknown>): PosDeviceSettings {
  const group = <K extends keyof PosDeviceSettings>(key: K): PosDeviceSettings[K] => ({
    ...DEFAULT_POS_DEVICE_SETTINGS[key],
    ...(toObject(stored[key]) as Partial<PosDeviceSettings[K]>),
  })

  return {
    scale: group("scale"),
    receiptPrinter: group("receiptPrinter"),
    barcodeScanner: group("barcodeScanner"),
    cashDrawer: group("cashDrawer"),
    customerDisplay: group("customerDisplay"),
    cardReader: group("cardReader"),
  }
}

export class PosDeviceSettingsService {
  constructor(private readonly database: PostgresDatabase) {}

  // Falls back to the workspace-less row before the built-in defaults, so an organization can
  // configure once centrally and a branch can override only if it needs to.
  async get(organizationId: string, workspaceId: string | null): Promise<PosDeviceSettingsView> {
    const result = await this.database.query<SettingsRow>(
      `SELECT organization_id, workspace_id, settings, updated_by, updated_at
         FROM pos_device_settings
        WHERE organization_id = $1
          AND (workspace_id = $2::uuid OR workspace_id IS NULL)
        ORDER BY workspace_id NULLS LAST
        LIMIT 1`,
      [organizationId, workspaceId]
    )

    const row = result.rows[0]
    if (!row) {
      return {
        organizationId,
        workspaceId,
        settings: DEFAULT_POS_DEVICE_SETTINGS,
        updatedBy: null,
        updatedAt: null,
        configured: false,
      }
    }

    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      settings: withDefaults(toObject(row.settings)),
      updatedBy: row.updated_by,
      updatedAt: toIso(row.updated_at),
      configured: true,
    }
  }

  async save(input: {
    organizationId: string
    workspaceId: string | null
    updatedBy: string | null
    settings: PosDeviceSettings
  }): Promise<PosDeviceSettingsView> {
    const existing = await this.database.query<{ id: string }>(
      `SELECT id FROM pos_device_settings
        WHERE organization_id = $1
          AND ((workspace_id IS NULL AND $2::uuid IS NULL) OR workspace_id = $2::uuid)
        LIMIT 1`,
      [input.organizationId, input.workspaceId]
    )

    // Written as a read-then-write rather than ON CONFLICT because the uniqueness is split
    // across two partial indexes, and ON CONFLICT can only name one of them.
    if (existing.rows[0]) {
      await this.database.query(
        `UPDATE pos_device_settings
            SET settings = $2::jsonb, updated_by = $3, updated_at = now()
          WHERE id = $1`,
        [existing.rows[0].id, JSON.stringify(input.settings), input.updatedBy]
      )
    } else {
      await this.database.query(
        `INSERT INTO pos_device_settings
           (id, organization_id, workspace_id, settings, updated_by)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [
          randomUUID(),
          input.organizationId,
          input.workspaceId,
          JSON.stringify(input.settings),
          input.updatedBy,
        ]
      )
    }

    return this.get(input.organizationId, input.workspaceId)
  }
}
