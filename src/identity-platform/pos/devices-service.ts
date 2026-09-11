import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import {
  DEFAULT_DEVICE_PRINTER_SETTINGS,
  DEFAULT_DEVICE_SCALE_SETTINGS,
  type DeviceConnection,
  type DevicePrinterSettings,
  type DeviceScaleSettings,
  type DeviceType,
} from "./device-settings-types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A device is treated as connected only if something reported it within this window. Nothing in
// the platform reports today, so in practice every device reads as disconnected until a till or
// agent starts writing last_seen_at -- which is the honest answer, rather than assuming healthy.
const ONLINE_WINDOW_MS = 5 * 60 * 1000

const DEVICE_ERRORS = {
  notFound: () => new IdentityError("POS_DEVICE_NOT_FOUND", 404, "business", "Device not found."),
}

// Scale and receipt_printer are the only kinds with a per-unit shape today (see
// device-settings-types.ts); every other kind stores an empty object.
export type PosDeviceSettingsInput =
  | Partial<DeviceScaleSettings>
  | Partial<DevicePrinterSettings>
  | Record<string, never>

export interface PosDeviceInput {
  name: string
  deviceType: DeviceType
  model: string | null
  description: string | null
  connection: DeviceConnection
  port: string | null
  baudRate: number | null
  enabled: boolean
  settings: PosDeviceSettingsInput
}

export interface PosDeviceView extends PosDeviceInput {
  id: string
  lastSeenAt: string | null
  online: boolean
  createdAt: string
  updatedAt: string
}

interface DeviceRow {
  id: string
  name: string
  device_type: string
  model: string | null
  description: string | null
  connection: string
  port: string | null
  baud_rate: number | string | null
  enabled: boolean
  settings: unknown
  last_seen_at: Date | string | null
  created_at: Date | string
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

// A saved row from before a field existed gets the default rather than undefined, which would
// otherwise reach the screen reading it -- same reasoning for scale and receipt_printer alike.
function settingsFor(deviceType: DeviceType, stored: unknown): PosDeviceSettingsInput {
  const raw = toObject(stored)
  if (deviceType === "scale") return { ...DEFAULT_DEVICE_SCALE_SETTINGS, ...raw }
  if (deviceType === "receipt_printer") return { ...DEFAULT_DEVICE_PRINTER_SETTINGS, ...raw }
  return raw
}

function mapDevice(row: DeviceRow): PosDeviceView {
  const lastSeenAt = row.last_seen_at ? toIso(row.last_seen_at) : null

  return {
    id: row.id,
    name: row.name,
    deviceType: row.device_type as DeviceType,
    model: row.model,
    description: row.description,
    connection: row.connection as DeviceConnection,
    port: row.port,
    baudRate: row.baud_rate === null ? null : Number(row.baud_rate),
    enabled: row.enabled,
    settings: settingsFor(row.device_type as DeviceType, row.settings),
    lastSeenAt,
    online: lastSeenAt !== null && Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

const DEVICE_SELECT = `
  SELECT id, name, device_type, model, description, connection, port, baud_rate, enabled,
         settings, last_seen_at, created_at, updated_at
    FROM pos_devices
`

export class PosDevicesService {
  constructor(private readonly database: PostgresDatabase) {}

  async list(organizationId: string, workspaceId: string | null): Promise<PosDeviceView[]> {
    const result = await this.database.query<DeviceRow>(
      `${DEVICE_SELECT}
        WHERE organization_id = $1 AND deleted_at IS NULL
          AND ($2::uuid IS NULL OR workspace_id = $2::uuid OR workspace_id IS NULL)
        ORDER BY created_at`,
      [organizationId, workspaceId]
    )
    return result.rows.map(mapDevice)
  }

  // One count per branch, for the branch-management screen's "عدد نقاط البيع" column -- a single
  // grouped query rather than one list() call per workspace, which the caller's session-scoped
  // workspaceId could not do anyway (list() only ever sees the caller's *current* workspace or
  // organization-wide devices, never an arbitrary other branch's).
  async countByWorkspace(organizationId: string): Promise<Record<string, number>> {
    const result = await this.database.query<{ workspace_id: string; count: string | number }>(
      `SELECT workspace_id, count(*) AS count
         FROM pos_devices
        WHERE organization_id = $1 AND deleted_at IS NULL AND workspace_id IS NOT NULL
        GROUP BY workspace_id`,
      [organizationId]
    )
    const counts: Record<string, number> = {}
    for (const row of result.rows) {
      counts[row.workspace_id] = Number(row.count) || 0
    }
    return counts
  }

  async create(input: {
    organizationId: string
    workspaceId: string | null
    createdBy: string | null
    device: PosDeviceInput
  }): Promise<PosDeviceView> {
    const id = randomUUID()

    await this.database.query(
      `INSERT INTO pos_devices
         (id, organization_id, workspace_id, name, device_type, model, description, connection,
          port, baud_rate, enabled, settings, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.device.name,
        input.device.deviceType,
        input.device.model,
        input.device.description,
        input.device.connection,
        input.device.port,
        input.device.baudRate,
        input.device.enabled,
        JSON.stringify(input.device.settings),
        input.createdBy,
      ]
    )

    const created = await this.findById(input.organizationId, id)
    if (!created) throw DEVICE_ERRORS.notFound()
    return created
  }

  async update(input: {
    organizationId: string
    id: string
    device: PosDeviceInput
  }): Promise<PosDeviceView> {
    if (!UUID_PATTERN.test(input.id)) throw DEVICE_ERRORS.notFound()

    const result = await this.database.query(
      `UPDATE pos_devices
          SET name = $3, device_type = $4, model = $5, description = $6, connection = $7,
              port = $8, baud_rate = $9, enabled = $10, settings = $11::jsonb, updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [
        input.organizationId,
        input.id,
        input.device.name,
        input.device.deviceType,
        input.device.model,
        input.device.description,
        input.device.connection,
        input.device.port,
        input.device.baudRate,
        input.device.enabled,
        JSON.stringify(input.device.settings),
      ]
    )

    if (result.rowCount === 0) throw DEVICE_ERRORS.notFound()

    const updated = await this.findById(input.organizationId, input.id)
    if (!updated) throw DEVICE_ERRORS.notFound()
    return updated
  }

  // Soft delete, matching every other removable record here: a device referenced by a past
  // sale or an audit entry still has to resolve.
  async delete(organizationId: string, id: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) throw DEVICE_ERRORS.notFound()

    const result = await this.database.query(
      `UPDATE pos_devices SET deleted_at = now(), updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    if (result.rowCount === 0) throw DEVICE_ERRORS.notFound()
  }

  async getById(organizationId: string, id: string): Promise<PosDeviceView> {
    if (!UUID_PATTERN.test(id)) throw DEVICE_ERRORS.notFound()
    const device = await this.findById(organizationId, id)
    if (!device) throw DEVICE_ERRORS.notFound()
    return device
  }

  private async findById(organizationId: string, id: string): Promise<PosDeviceView | null> {
    const result = await this.database.query<DeviceRow>(
      `${DEVICE_SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    return result.rows[0] ? mapDevice(result.rows[0]) : null
  }
}
