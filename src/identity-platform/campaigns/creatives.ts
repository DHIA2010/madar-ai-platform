import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { ObjectStorageGateway } from "../application/ports"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// The creative library: the images and videos an organization keeps for its ads. A creative is
// uploaded once and can then be used in any campaign published from Madar (campaigns/publishing).
// The file goes to object storage; its size on screen (and a video's length) is measured in the
// browser at upload and kept here, because that is what decides which ad platforms accept it.

export type CreativeKind = "image" | "video"

export const CREATIVE_CONTENT_TYPES = ["image/png", "image/jpeg", "video/mp4"] as const
export type CreativeContentType = (typeof CREATIVE_CONTENT_TYPES)[number]

// Snapchat takes images up to 5 MB. Videos are capped by what one upload request to Madar can
// carry, well under the ad platforms' own limits.
export const MAX_CREATIVE_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_CREATIVE_VIDEO_BYTES = 30 * 1024 * 1024

export interface CreativeView {
  id: string
  name: string
  kind: CreativeKind
  contentType: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  url: string
  createdAt: string
}

export interface UploadCreativeInput {
  organizationId: string
  workspaceId: string | null
  userId: string | null
  name: string
  contentType: CreativeContentType
  dataBase64: string
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

const ERRORS = {
  unavailable: () =>
    new IdentityError(
      "CREATIVE_STORAGE_UNAVAILABLE",
      503,
      "infrastructure",
      "Creative uploads are not available right now."
    ),
  notFound: () => new IdentityError("CREATIVE_NOT_FOUND", 404, "business", "Creative not found."),
  tooLarge: (kind: CreativeKind) =>
    new IdentityError(
      "CREATIVE_TOO_LARGE",
      413,
      "validation",
      kind === "image" ? "An image can be up to 5 MB." : "A video can be up to 30 MB."
    ),
  notThatFile: () =>
    new IdentityError(
      "CREATIVE_INVALID_FILE",
      422,
      "validation",
      "The file is not a PNG or JPG image or an MP4 video."
    ),
}

// The file's first bytes must match what it says it is -- a renamed file is refused here rather
// than by the ad platform later.
function matchesContentType(bytes: Buffer, contentType: CreativeContentType): boolean {
  if (contentType === "image/png") {
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8
  // MP4: a box named "ftyp" right after the first box size.
  return bytes.subarray(4, 8).toString("latin1") === "ftyp"
}

interface CreativeRow {
  id: string
  name: string
  kind: string
  content_type: string
  size_bytes: number | string
  width: number | null
  height: number | null
  duration_seconds: number | string | null
  storage_key: string
  url: string
  created_at: Date | string
  [key: string]: unknown
}

function mapCreative(row: CreativeRow): CreativeView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as CreativeKind,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width === null ? null : Number(row.width),
    height: row.height === null ? null : Number(row.height),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    url: row.url,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }
}

const SELECT = `SELECT id, name, kind, content_type, size_bytes, width, height, duration_seconds,
  storage_key, url, created_at FROM campaign_creatives`

const positiveOrNull = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null

export class CampaignCreativesService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly storage: ObjectStorageGateway | null
  ) {}

  async list(organizationId: string): Promise<CreativeView[]> {
    const result = await this.db.query<CreativeRow>(
      `${SELECT} WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [organizationId]
    )
    return result.rows.map(mapCreative)
  }

  async get(organizationId: string, id: string): Promise<CreativeView> {
    const result = await this.db.query<CreativeRow>(
      `${SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    if (!result.rows[0]) throw ERRORS.notFound()
    return mapCreative(result.rows[0])
  }

  async upload(input: UploadCreativeInput): Promise<CreativeView> {
    if (!this.storage) throw ERRORS.unavailable()
    const kind: CreativeKind = input.contentType === "video/mp4" ? "video" : "image"
    const bytes = Buffer.from(input.dataBase64, "base64")
    const limit = kind === "image" ? MAX_CREATIVE_IMAGE_BYTES : MAX_CREATIVE_VIDEO_BYTES
    if (bytes.length === 0 || !matchesContentType(bytes, input.contentType)) {
      throw ERRORS.notThatFile()
    }
    if (bytes.length > limit) throw ERRORS.tooLarge(kind)

    const id = randomUUID()
    const extension =
      input.contentType === "image/png" ? "png" : input.contentType === "image/jpeg" ? "jpg" : "mp4"
    const key = `campaign-creatives/${input.organizationId}/${id}.${extension}`
    const url = await this.storage.uploadPublicObject({
      key,
      body: bytes,
      contentType: input.contentType,
    })
    const width = positiveOrNull(input.width)
    const height = positiveOrNull(input.height)
    await this.db.query(
      `INSERT INTO campaign_creatives
         (id, organization_id, workspace_id, name, kind, content_type, size_bytes, width, height,
          duration_seconds, storage_key, url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.name.trim().slice(0, 120) || "creative",
        kind,
        input.contentType,
        bytes.length,
        width === null ? null : Math.round(width),
        height === null ? null : Math.round(height),
        kind === "video" ? positiveOrNull(input.durationSeconds) : null,
        key,
        url,
        input.userId,
      ]
    )
    return this.get(input.organizationId, id)
  }

  // Removed from the library; the file stays in storage, since an ad already published may still
  // be shown from the platform's own copy and Madar keeps the record of what was used.
  async remove(organizationId: string, id: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE campaign_creatives SET deleted_at = now()
        WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
      [organizationId, id]
    )
    if (result.rows.length === 0) throw ERRORS.notFound()
  }

  // The creative's file, for handing to an ad platform.
  async readFile(
    organizationId: string,
    id: string
  ): Promise<{ creative: CreativeView; bytes: Buffer; fileName: string }> {
    const result = await this.db.query<CreativeRow>(
      `${SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    const row = result.rows[0]
    if (!row) throw ERRORS.notFound()
    const file = this.storage?.readObject ? await this.storage.readObject(row.storage_key) : null
    if (!file) throw ERRORS.unavailable()
    return {
      creative: mapCreative(row),
      bytes: file.body,
      fileName: row.storage_key.split("/").pop() ?? `${row.id}`,
    }
  }
}
