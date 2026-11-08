import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  DEFAULT_PLATFORM_SETTINGS,
  type PlatformSettings,
  type PlatformSettingsRepository,
} from "./types"

// Sign-in checks maintenance mode on every authenticated request, so reads are cached briefly;
// an update made through this repository is visible immediately (the cache is replaced).
const CACHE_TTL_MS = 15_000

function withDefaults(stored: Record<string, unknown> | null | undefined): PlatformSettings {
  const merged = { ...DEFAULT_PLATFORM_SETTINGS }
  for (const key of Object.keys(DEFAULT_PLATFORM_SETTINGS) as Array<keyof PlatformSettings>) {
    const value = stored?.[key]
    if (value !== undefined && typeof value === typeof DEFAULT_PLATFORM_SETTINGS[key]) {
      ;(merged as Record<string, unknown>)[key] = value
    }
  }
  return merged
}

export class PostgresPlatformSettingsRepository implements PlatformSettingsRepository {
  private cache: { value: PlatformSettings; expiresAt: number } | null = null

  private revisionsApplied = false

  constructor(private readonly db: PostgresDatabase) {}

  // Settings changes shipped with the code, applied once per environment (recorded in
  // platform_pricing_revisions, like migration 158's prices) so a value edited afterwards in Madar
  // Admin is kept. Done here rather than in SQL: the test database has no jsonb_set.
  private async applyRevisions(): Promise<void> {
    if (this.revisionsApplied) return
    this.revisionsApplied = true
    const id = "2026-11-trial-14-days"
    const done = await this.db.query("SELECT 1 FROM platform_pricing_revisions WHERE id = $1", [id])
    if (done.rows.length > 0) return
    // The approved November 2026 pricing comes with a 14-day free trial.
    const stored = await this.db.query<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM platform_settings WHERE id = 1"
    )
    if (stored.rows[0]) {
      await this.db.query(
        "UPDATE platform_settings SET settings = $1::jsonb, updated_at = now() WHERE id = 1",
        [JSON.stringify({ ...stored.rows[0].settings, trialDays: 14 })]
      )
    }
    await this.db.query(
      "INSERT INTO platform_pricing_revisions (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
      [id]
    )
  }

  async get(): Promise<PlatformSettings> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value
    await this.applyRevisions()
    const result = await this.db.query<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM platform_settings WHERE id = 1"
    )
    const value = withDefaults(result.rows[0]?.settings)
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
    return value
  }

  async update(
    patch: Partial<PlatformSettings>,
    updatedByUserId: string
  ): Promise<PlatformSettings> {
    this.cache = null
    const next = withDefaults({ ...(await this.get()), ...patch })
    await this.db.query(
      `INSERT INTO platform_settings (id, settings, updated_at, updated_by_user_id)
       VALUES (1, $1::jsonb, now(), $2)
       ON CONFLICT (id) DO UPDATE SET
         settings = EXCLUDED.settings,
         updated_at = EXCLUDED.updated_at,
         updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [JSON.stringify(next), updatedByUserId]
    )
    this.cache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS }
    return next
  }
}

export class InMemoryPlatformSettingsRepository implements PlatformSettingsRepository {
  private value: PlatformSettings = { ...DEFAULT_PLATFORM_SETTINGS }

  async get() {
    return { ...this.value }
  }

  async update(patch: Partial<PlatformSettings>) {
    this.value = withDefaults({ ...this.value, ...patch })
    return { ...this.value }
  }
}
