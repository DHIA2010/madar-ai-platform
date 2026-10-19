import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { SallaOAuthRepository } from "../salla-oauth/repository"
import { TYPES_REQUIRING_STOCK, type ProductType } from "./catalog-types"

const LINK_ERRORS = {
  productNotFound: () =>
    new IdentityError(
      "SALLA_PRODUCT_LINK_PRODUCT_NOT_FOUND",
      404,
      "business",
      "Product not found."
    ),
  variantNotOwned: () =>
    new IdentityError(
      "SALLA_PRODUCT_LINK_VARIANT_NOT_FOUND",
      404,
      "business",
      "That variant does not belong to this product."
    ),
  productTypeNotStocked: () =>
    new IdentityError(
      "SALLA_PRODUCT_LINK_TYPE_NOT_STOCKED",
      400,
      "validation",
      "Only raw material, simple, and weighted products can be linked at the product level -- link a bundle's own components instead, and link a variable product per variant."
    ),
}

export interface SallaProductLinkTarget {
  productId: string
  variantId?: string | null
}

export interface UpsertSallaProductLinkInput extends SallaProductLinkTarget {
  sallaProductId: string
  sallaProductSku: string | null
  sallaProductName: string | null
}

export interface LinkableSallaProduct {
  sallaProductId: string
  name: string
  sku: string
}

export class SallaProductLinksService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly sallaOAuthRepository: SallaOAuthRepository
  ) {}

  async upsertLink(
    organizationId: string,
    input: UpsertSallaProductLinkInput,
    createdByUserId: string
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
      // A product is linked either entirely at the product level (one link, no per-variant
      // granularity) or entirely at the variant level (zero or more per-variant links, no
      // product-level link) -- never a mix of both. Linking a specific variant must not disturb
      // any OTHER variant's own link on the same product, only retire a stale product-level link
      // and replace this exact variant's own prior link, if any. Linking at the product level
      // retires every per-variant link on the product, since product-level mode has no variants
      // to still be pointing at something. The two partial unique indexes enforce uniqueness
      // within each level but can't enforce this cross-level "not both" or "upsert" on their own.
      if (input.variantId) {
        await this.database.query(
          `DELETE FROM salla_product_links WHERE product_id = $1 AND variant_id IS NULL`,
          [input.productId]
        )
        await this.database.query(`DELETE FROM salla_product_links WHERE variant_id = $1`, [
          input.variantId,
        ])
      } else {
        await this.database.query(`DELETE FROM salla_product_links WHERE product_id = $1`, [
          input.productId,
        ])
      }

      await this.database.query(
        `INSERT INTO salla_product_links
           (id, organization_id, product_id, variant_id, salla_product_id, salla_product_sku,
            salla_product_name, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
        [
          randomUUID(),
          organizationId,
          input.productId,
          input.variantId ?? null,
          input.sallaProductId,
          input.sallaProductSku,
          input.sallaProductName,
          createdByUserId,
        ]
      )
    })
  }

  async removeLink(organizationId: string, target: SallaProductLinkTarget): Promise<void> {
    await this.database.query(
      `DELETE FROM salla_product_links
        WHERE organization_id = $1 AND product_id = $2
          AND (($3::uuid IS NULL AND variant_id IS NULL) OR variant_id = $3::uuid)`,
      [organizationId, target.productId, target.variantId ?? null]
    )
  }

  // Prefers the variant-level link when one exists for this exact variant; otherwise falls back
  // to the product-level link. Returns null when neither is linked -- the caller (the stock-push
  // service) treats that as "nothing to push" rather than an error.
  async findLinkForLine(
    organizationId: string,
    target: SallaProductLinkTarget
  ): Promise<{ sallaProductId: string } | null> {
    const result = await this.database.query<{ salla_product_id: string }>(
      `SELECT salla_product_id FROM salla_product_links
        WHERE organization_id = $1 AND product_id = $2
          AND (variant_id IS NULL OR variant_id = $3::uuid)
        ORDER BY variant_id IS NOT NULL DESC
        LIMIT 1`,
      [organizationId, target.productId, target.variantId ?? null]
    )
    const row = result.rows[0]
    return row ? { sallaProductId: row.salla_product_id } : null
  }

  // Candidates for the link picker -- sourced from this org's already-synced salla_records
  // (entity_type='products'), the same JSON paths normalizeSallaProduct() reads
  // (products/service.ts). A Salla product with no SKU is filtered out: nothing for the stock
  // push to target it by.
  async listLinkableSallaProducts(
    organizationId: string,
    workspaceId: string | null,
    search: string | null
  ): Promise<LinkableSallaProduct[]> {
    const connection = await this.sallaOAuthRepository.findActiveConnection(
      organizationId,
      workspaceId
    )
    if (!connection) return []

    const result = await this.database.query<{ entity_id: string; name: string; sku: string }>(
      `SELECT entity_id,
              coalesce(payload->>'name', '') AS name,
              coalesce(payload->>'sku', '') AS sku
         FROM salla_records
        WHERE connection_id = $1
          AND entity_type = 'products'
          AND coalesce(payload->>'sku', '') != ''
          AND ($2::text IS NULL OR payload->>'name' ILIKE '%' || $2 || '%' OR payload->>'sku' ILIKE '%' || $2 || '%')
        ORDER BY payload->>'name'
        LIMIT 50`,
      [connection.id, search]
    )

    return result.rows.map((row) => ({
      sallaProductId: row.entity_id,
      name: row.name,
      sku: row.sku,
    }))
  }
}
