import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { ZidOAuthRepository } from "../zid-oauth/repository"
import { TYPES_REQUIRING_STOCK, type ProductType } from "./catalog-types"

const LINK_ERRORS = {
  productNotFound: () =>
    new IdentityError("ZID_PRODUCT_LINK_PRODUCT_NOT_FOUND", 404, "business", "Product not found."),
  variantNotOwned: () =>
    new IdentityError(
      "ZID_PRODUCT_LINK_VARIANT_NOT_FOUND",
      404,
      "business",
      "That variant does not belong to this product."
    ),
  productTypeNotStocked: () =>
    new IdentityError(
      "ZID_PRODUCT_LINK_TYPE_NOT_STOCKED",
      400,
      "validation",
      "Only raw material, simple, and weighted products can be linked at the product level -- link a bundle's own components instead, and link a variable product per variant."
    ),
}

export interface ZidProductLinkTarget {
  productId: string
  variantId?: string | null
}

export interface UpsertZidProductLinkInput extends ZidProductLinkTarget {
  zidProductId: string
  zidProductSku: string | null
  zidProductName: string | null
}

export interface LinkableZidProduct {
  zidProductId: string
  name: string
  sku: string
}

// Direct adaptation of SallaProductLinksService -- same shape, same rules (one link per product
// OR per variant, never both; reverse lookup by any candidate id for auto-promotion's create-vs-
// update decision), against zid_product_links (migration 104) instead of salla_product_links.
export class ZidProductLinksService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly zidOAuthRepository: ZidOAuthRepository
  ) {}

  async upsertLink(
    organizationId: string,
    input: UpsertZidProductLinkInput,
    createdByUserId: string | null
  ): Promise<void> {
    const productRow = await this.database.query<{ product_type: string }>(
      `SELECT product_type FROM products WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [input.productId, organizationId]
    )
    if (!productRow.rows[0]) throw LINK_ERRORS.productNotFound()

    if (input.variantId) {
      const variantRow = await this.database.query<{ id: string }>(
        `SELECT id FROM product_variants WHERE id = $1 AND product_id = $2`,
        [input.variantId, input.productId]
      )
      if (!variantRow.rows[0]) throw LINK_ERRORS.variantNotOwned()
    } else if (!TYPES_REQUIRING_STOCK.includes(productRow.rows[0].product_type as ProductType)) {
      throw LINK_ERRORS.productTypeNotStocked()
    }

    await this.database.withTransaction(async () => {
      if (input.variantId) {
        await this.database.query(
          `DELETE FROM zid_product_links WHERE product_id = $1 AND variant_id IS NULL`,
          [input.productId]
        )
        await this.database.query(`DELETE FROM zid_product_links WHERE variant_id = $1`, [
          input.variantId,
        ])
      } else {
        await this.database.query(`DELETE FROM zid_product_links WHERE product_id = $1`, [
          input.productId,
        ])
      }

      await this.database.query(
        `INSERT INTO zid_product_links
           (id, organization_id, product_id, variant_id, zid_product_id, zid_product_sku,
            zid_product_name, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
        [
          randomUUID(),
          organizationId,
          input.productId,
          input.variantId ?? null,
          input.zidProductId,
          input.zidProductSku,
          input.zidProductName,
          createdByUserId,
        ]
      )
    })
  }

  async removeLink(organizationId: string, target: ZidProductLinkTarget): Promise<void> {
    await this.database.query(
      `DELETE FROM zid_product_links
        WHERE organization_id = $1 AND product_id = $2
          AND (($3::uuid IS NULL AND variant_id IS NULL) OR variant_id = $3::uuid)`,
      [organizationId, target.productId, target.variantId ?? null]
    )
  }

  async findLinkForLine(
    organizationId: string,
    target: ZidProductLinkTarget
  ): Promise<{ zidProductId: string } | null> {
    const result = await this.database.query<{ zid_product_id: string }>(
      `SELECT zid_product_id FROM zid_product_links
        WHERE organization_id = $1 AND product_id = $2
          AND (variant_id IS NULL OR variant_id = $3::uuid)
        ORDER BY variant_id IS NOT NULL DESC
        LIMIT 1`,
      [organizationId, target.productId, target.variantId ?? null]
    )
    const row = result.rows[0]
    return row ? { zidProductId: row.zid_product_id } : null
  }

  async findProductForAnyZidId(
    organizationId: string,
    zidIds: string[]
  ): Promise<{ productId: string } | null> {
    if (zidIds.length === 0) return null
    const placeholders = zidIds.map((_, index) => `$${index + 2}`).join(", ")
    const result = await this.database.query<{ product_id: string }>(
      `SELECT product_id FROM zid_product_links
        WHERE organization_id = $1 AND zid_product_id IN (${placeholders})
        LIMIT 1`,
      [organizationId, ...zidIds]
    )
    const row = result.rows[0]
    return row ? { productId: row.product_id } : null
  }

  async listLinkableZidProducts(
    organizationId: string,
    workspaceId: string | null,
    search: string | null
  ): Promise<LinkableZidProduct[]> {
    const connection = await this.zidOAuthRepository.findActiveConnection(
      organizationId,
      workspaceId
    )
    if (!connection) return []

    // Unlike Salla, Zid's `name` is a bilingual {en, ar} jsonb object, not a plain string --
    // payload->>'name' on an object field would return its stringified JSON, not a clean display
    // string, so each localized key is pulled out explicitly instead (same precedence
    // normalizeZidProduct/mapZidProductToCreateInput already use: English, then Arabic).
    const result = await this.database.query<{ entity_id: string; name: string; sku: string }>(
      `SELECT entity_id,
              coalesce(payload->'name'->>'en', payload->'name'->>'ar', '') AS name,
              coalesce(payload->>'sku', '') AS sku
         FROM zid_records
        WHERE connection_id = $1
          AND entity_type = 'products'
          AND coalesce(payload->>'sku', '') != ''
          AND (
            $2::text IS NULL
            OR coalesce(payload->'name'->>'en', payload->'name'->>'ar', '') ILIKE '%' || $2 || '%'
            OR payload->>'sku' ILIKE '%' || $2 || '%'
          )
        ORDER BY coalesce(payload->'name'->>'en', payload->'name'->>'ar', '')
        LIMIT 50`,
      [connection.id, search]
    )

    return result.rows.map((row) => ({
      zidProductId: row.entity_id,
      name: row.name,
      sku: row.sku,
    }))
  }
}
