import { randomBytes } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { CRM_STAGES, type CrmStageView, type SystemStage } from "./types"

// The pipeline's stages: the built-in ones (fixed -- the system moves leads through them) and the
// sales team's own, placed between them -- see migration 138.

export const STAGE_COLORS = [
  "blue",
  "sky",
  "violet",
  "amber",
  "emerald",
  "rose",
  "teal",
  "orange",
  "pink",
  "slate",
] as const
export type StageColor = (typeof STAGE_COLORS)[number]

const SYSTEM: Record<SystemStage, { label: string; color: StageColor; position: number }> = {
  new: { label: "جديد", color: "blue", position: 100 },
  contacted: { label: "تم التواصل", color: "sky", position: 200 },
  meeting: { label: "اجتماع محجوز", color: "violet", position: 300 },
  trial: { label: "تجربة", color: "amber", position: 400 },
  won: { label: "تم الفوز", color: "emerald", position: 1000 },
  lost: { label: "خسارة", color: "rose", position: 1001 },
}

export const CLOSED_STAGES = ["won", "lost"]
const isSystem = (key: string): key is SystemStage =>
  (CRM_STAGES as readonly string[]).includes(key)

type StageRow = { key: string; label: string; color: string; position: number }

// Every stage, in pipeline order.
export async function listStages(db: PostgresDatabase): Promise<CrmStageView[]> {
  const custom = await db.query<StageRow>("SELECT key, label, color, position FROM crm_stages")
  return [
    ...CRM_STAGES.map((key) => ({ key, ...SYSTEM[key], system: true })),
    ...custom.rows.map((row) => ({
      key: row.key,
      label: row.label,
      color: row.color,
      position: Number(row.position),
      system: false,
    })),
  ].sort((left, right) => left.position - right.position)
}

// How far along a stage is: system events only ever move a lead forward.
export async function stageRank(db: PostgresDatabase, key: string) {
  if (isSystem(key)) return SYSTEM[key].position
  const rows = await db.query<{ position: number }>(
    "SELECT position FROM crm_stages WHERE key = $1",
    [key]
  )
  return rows.rows[0] ? Number(rows.rows[0].position) : 0
}

export async function requireStage(db: PostgresDatabase, key: string) {
  if (isSystem(key)) return
  const rows = await db.query("SELECT key FROM crm_stages WHERE key = $1", [key])
  if (!rows.rows.length) throw ERRORS.validation({ stage: "Unknown stage." })
}

// Spreads the custom stages evenly between the built-in ones around them, in the given order.
async function layout(db: PostgresDatabase, order: string[]) {
  const anchors = order.map((key) => (isSystem(key) ? SYSTEM[key].position : null))
  for (let index = 0; index < order.length; index++) {
    if (anchors[index] !== null) continue
    let start = index
    while (start > 0 && anchors[start - 1] === null) start--
    let end = index
    while (end < order.length - 1 && anchors[end + 1] === null) end++
    const before = start > 0 ? (anchors[start - 1] as number) : 0
    const after = end < order.length - 1 ? (anchors[end + 1] as number) : 1000
    const step = (after - before) / (end - start + 2)
    for (let slot = start; slot <= end; slot++) {
      const position = Math.round(before + step * (slot - start + 1))
      anchors[slot] = position
      await db.query("UPDATE crm_stages SET position = $2 WHERE key = $1", [order[slot], position])
    }
  }
}

// The open stages (not won/lost) in order, with `key` moved to just after `after`.
async function openOrderWith(db: PostgresDatabase, key: string, after: string) {
  const open = (await listStages(db))
    .map((stage) => stage.key)
    .filter((stage) => !CLOSED_STAGES.includes(stage) && stage !== key)
  const index = open.indexOf(after)
  if (index < 0) throw ERRORS.validation({ after: "Place it after an open stage." })
  open.splice(index + 1, 0, key)
  return open
}

export async function saveStage(
  db: PostgresDatabase,
  key: string | null,
  input: { label: string; color: StageColor; after?: string }
) {
  if (key && isSystem(key)) throw ERRORS.validation({ stage: "Built-in stages can't be changed." })
  const creating = !key
  if (key) {
    const exists = await db.query("SELECT key FROM crm_stages WHERE key = $1", [key])
    if (!exists.rows.length) throw ERRORS.notFound("Stage")
    await db.query("UPDATE crm_stages SET label = $2, color = $3 WHERE key = $1", [
      key,
      input.label,
      input.color,
    ])
  } else {
    key = `c_${randomBytes(5).toString("hex")}`
    await db.query("INSERT INTO crm_stages (key, label, color, position) VALUES ($1, $2, $3, 0)", [
      key,
      input.label,
      input.color,
    ])
  }
  // New stages go after the one picked (default: just before the deal closes).
  if (creating || input.after) {
    await layout(db, await openOrderWith(db, key, input.after ?? "trial"))
  }
  return listStages(db)
}

// Drag-and-drop order of the open stages (every one, won/lost excluded). Custom stages can go
// anywhere; the built-in ones keep their order.
export async function reorderStages(db: PostgresDatabase, order: string[]) {
  const open = (await listStages(db))
    .map((stage) => stage.key)
    .filter((key) => !CLOSED_STAGES.includes(key))
  if (order.length !== open.length || !open.every((key) => order.includes(key))) {
    throw ERRORS.validation({ order: "List every open stage once." })
  }
  const builtIn = order.filter(isSystem).join(",")
  if (builtIn !== open.filter(isSystem).join(",")) {
    throw ERRORS.validation({ order: "Built-in stages keep their order." })
  }
  await layout(db, order)
  return listStages(db)
}

// Removes a custom stage; its leads move to `moveTo` (a stage that stays).
export async function deleteStage(db: PostgresDatabase, key: string, moveTo: string) {
  if (isSystem(key)) throw ERRORS.validation({ stage: "Built-in stages can't be deleted." })
  if (moveTo === key) throw ERRORS.validation({ moveTo: "Pick another stage." })
  await requireStage(db, moveTo)
  await db.query(
    "UPDATE crm_leads SET stage = $2, stage_changed_at = now(), updated_at = now() WHERE stage = $1",
    [key, moveTo]
  )
  await db.query("DELETE FROM crm_stages WHERE key = $1", [key])
  return listStages(db)
}
