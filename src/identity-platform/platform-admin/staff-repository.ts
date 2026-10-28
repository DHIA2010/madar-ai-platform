import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PlatformStaffEntry, PlatformStaffRepository } from "./staff-roles"

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function map(row: Record<string, unknown>): PlatformStaffEntry {
  return {
    userId: String(row.user_id),
    role: row.role as PlatformStaffEntry["role"],
    status: row.status as PlatformStaffEntry["status"],
    addedByUserId: (row.added_by_user_id as string | null) ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

// Every authenticated request looks its user up here (is this a Madar staff member?), so lookups
// are cached briefly; a change made through this repository replaces the cache right away.
const CACHE_TTL_MS = 15_000

export class PostgresPlatformStaffRepository implements PlatformStaffRepository {
  private cache: { entries: Map<string, PlatformStaffEntry>; expiresAt: number } | null = null

  constructor(private readonly db: PostgresDatabase) {}

  private async all(): Promise<Map<string, PlatformStaffEntry>> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.entries
    const result = await this.db.query<Record<string, unknown>>("SELECT * FROM platform_staff")
    const entries = new Map(result.rows.map((row) => [String(row.user_id), map(row)]))
    this.cache = { entries, expiresAt: Date.now() + CACHE_TTL_MS }
    return entries
  }

  async findByUserId(userId: string) {
    return (await this.all()).get(userId) ?? null
  }

  async list() {
    return [...(await this.all()).values()]
  }

  async save(entry: PlatformStaffEntry) {
    await this.db.query(
      `INSERT INTO platform_staff (user_id, role, status, added_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        entry.userId,
        entry.role,
        entry.status,
        entry.addedByUserId,
        entry.createdAt,
        entry.updatedAt,
      ]
    )
    this.cache = null
  }
}

export class InMemoryPlatformStaffRepository implements PlatformStaffRepository {
  private readonly entries = new Map<string, PlatformStaffEntry>()

  async findByUserId(userId: string) {
    const entry = this.entries.get(userId)
    return entry ? { ...entry } : null
  }

  async list() {
    return [...this.entries.values()].map((entry) => ({ ...entry }))
  }

  async save(entry: PlatformStaffEntry) {
    this.entries.set(entry.userId, { ...entry })
  }
}
