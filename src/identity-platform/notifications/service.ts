import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export type NotificationType =
  | "stock_low"
  | "stock_out"
  | "order_new"
  | "orders_new_batch"
  | "sync_failed"
  | "subscription_ending"
  | "subscription_expired"
  | "payment_succeeded"
  | "payment_failed"
  | "activation_approved"
  | "activation_rejected"

// Who may see a notification: anyone holding this module permission, owners and admins ("admin"),
// or everyone (null).
export type NotificationAudience = "products:view" | "orders:view" | "connections:view" | "admin"

export interface NotifyInput {
  organizationId: string
  // The branch it concerns; null for the whole organization.
  workspaceId?: string | null
  type: NotificationType
  audience: NotificationAudience | null
  params: Record<string, unknown>
  link?: string | null
  dedupeKey?: string | null
}

export interface NotificationView {
  id: string
  type: NotificationType
  params: Record<string, unknown>
  link: string | null
  workspaceId: string | null
  read: boolean
  createdAt: string
}

const LIST_LIMIT = 30
// Older notifications drop out of the bell (and its unread count).
const WINDOW_DAYS = 60

// Records a notification. Never throws: a notification must not be able to fail the sale, sync or
// payment that raised it. A repeat of the same dedupeKey is ignored.
export async function notify(db: PostgresDatabase, input: NotifyInput): Promise<void> {
  try {
    await db.query(
      `INSERT INTO notifications
         (id, organization_id, workspace_id, type, audience, params, link, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT (organization_id, dedupe_key) DO NOTHING`,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId ?? null,
        input.type,
        input.audience,
        JSON.stringify(input.params),
        input.link ?? null,
        input.dedupeKey ?? null,
      ]
    )
  } catch (error) {
    console.error("notifications.notify_failed", {
      type: input.type,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function isAdmin(actor: AuthenticatedActor) {
  return actor.roles.includes("owner") || actor.roles.includes("admin")
}

// The notifications this person may see: in their organization, for their branch (owners and
// admins see every branch), and meant for them.
function visibility(actor: AuthenticatedActor, firstParam: number) {
  const admin = isAdmin(actor)
  const audiences = [...actor.modulePermissions, ...(admin ? ["admin"] : [])]
  return {
    sql: `n.organization_id = $${firstParam}
      AND n.created_at > now() - interval '${WINDOW_DAYS} days'
      AND (n.workspace_id IS NULL OR $${firstParam + 1}::boolean OR n.workspace_id = $${firstParam + 2}::uuid)
      AND (n.audience IS NULL OR n.audience = ANY($${firstParam + 3}::text[]))`,
    params: [actor.organizationId, admin, actor.workspaceId, audiences],
  }
}

// How many of the newest visible notifications the unread count looks at.
const UNREAD_SCAN_LIMIT = 500

export class NotificationsService {
  constructor(private readonly db: PostgresDatabase) {}

  private async visibleRows(actor: AuthenticatedActor, limit: number) {
    const where = visibility(actor, 1)
    const rows = await this.db.query<{
      id: string
      type: NotificationType
      params: Record<string, unknown>
      link: string | null
      workspace_id: string | null
      created_at: string | Date
    }>(
      `SELECT n.id, n.type, n.params, n.link, n.workspace_id, n.created_at
         FROM notifications n
        WHERE ${where.sql}
        ORDER BY n.created_at DESC
        LIMIT ${limit}`,
      where.params
    )
    return rows.rows
  }

  // Which notifications this person has read. Only reads in the bell's window can matter: a
  // notification still shown there was created within it, so it can't have been read before.
  private async readIds(userId: string): Promise<Set<string>> {
    const rows = await this.db.query<{ notification_id: string }>(
      `SELECT notification_id FROM notification_reads
        WHERE user_id = $1 AND read_at > now() - interval '${WINDOW_DAYS} days'`,
      [userId]
    )
    return new Set(rows.rows.map((row) => String(row.notification_id)))
  }

  async list(
    actor: AuthenticatedActor
  ): Promise<{ items: NotificationView[]; unreadCount: number }> {
    const rows = await this.visibleRows(actor, UNREAD_SCAN_LIMIT)
    const read = await this.readIds(actor.userId)
    return {
      items: rows.slice(0, LIST_LIMIT).map((row) => ({
        id: row.id,
        type: row.type,
        params: row.params ?? {},
        link: row.link,
        workspaceId: row.workspace_id,
        read: read.has(row.id),
        createdAt: new Date(row.created_at).toISOString(),
      })),
      unreadCount: rows.filter((row) => !read.has(row.id)).length,
    }
  }

  private async markIdsRead(userId: string, ids: string[]) {
    for (const id of ids) {
      await this.db.query(
        `INSERT INTO notification_reads (notification_id, user_id) VALUES ($1, $2)
         ON CONFLICT (notification_id, user_id) DO NOTHING`,
        [id, userId]
      )
    }
  }

  // Marks these notifications read for this person (only ones they can see).
  async markRead(actor: AuthenticatedActor, ids: string[]): Promise<void> {
    const wanted = new Set(ids)
    const visible = await this.visibleRows(actor, UNREAD_SCAN_LIMIT)
    await this.markIdsRead(
      actor.userId,
      visible.filter((row) => wanted.has(row.id)).map((row) => row.id)
    )
  }

  async markAllRead(actor: AuthenticatedActor): Promise<void> {
    const visible = await this.visibleRows(actor, UNREAD_SCAN_LIMIT)
    const read = await this.readIds(actor.userId)
    await this.markIdsRead(
      actor.userId,
      visible.filter((row) => !read.has(row.id)).map((row) => row.id)
    )
  }
}
