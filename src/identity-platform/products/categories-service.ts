import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export const CATEGORY_SOURCES = ["madar", "salla", "zid", "shopify"] as const
export type CategorySource = (typeof CATEGORY_SOURCES)[number]
export type CategoryStatus = "active" | "inactive"

export interface ProductCategoryView {
  // Null for a category known only from its products (no row yet -- active by default).
  id: string | null
  name: string
  // Where its products come from; a category created in Madar with no products yet is ["madar"].
  sources: CategorySource[]
  status: CategoryStatus
  productCount: number
  createdAt: string | null
}

// A product as the merged GET /v1/products list returns it -- all this needs from one.
export interface CategorizedProduct {
  category: string | null | undefined
  platform: string
}

const PLATFORM_SOURCE: Record<string, CategorySource> = {
  Madar: "madar",
  Salla: "salla",
  Zid: "zid",
  Shopify: "shopify",
}

interface CategoryRow {
  id: string
  name: string
  name_key: string
  source: CategorySource
  status: CategoryStatus
  created_at: string | Date
  [key: string]: unknown
}

// The category the cashier's quick-add stores when none is picked.
const UNSPECIFIED_CATEGORY = "غير محدد"

// Products with no category -- empty, or the cashier quick-add's "unspecified" placeholder.
export function countUncategorized(products: CategorizedProduct[]): number {
  return products.filter((product) => {
    const name = product.category?.trim()
    return !name || name === UNSPECIFIED_CATEGORY
  }).length
}

function nameKey(name: string) {
  return name.trim().toLowerCase()
}

function scopeKey(workspaceId: string | null) {
  return workspaceId ?? "organization"
}

function groupProducts(products: CategorizedProduct[]) {
  const groups = new Map<string, { name: string; count: number; sources: Set<CategorySource> }>()
  for (const product of products) {
    const name = product.category?.trim()
    if (!name) continue
    const key = nameKey(name)
    const group = groups.get(key) ?? { name, count: 0, sources: new Set<CategorySource>() }
    group.count += 1
    group.sources.add(PLATFORM_SOURCE[product.platform] ?? "madar")
    groups.set(key, group)
  }
  return groups
}

// A workspace's product categories: every category its products carry (from Madar and from each
// connected store), plus the ones created here, each with its status. Inactive ones -- and their
// products -- are left out of the cashier.
export class ProductCategoriesService {
  constructor(private readonly db: PostgresDatabase) {}

  private async rows(organizationId: string, workspaceId: string | null) {
    const result = await this.db.query<CategoryRow>(
      `SELECT id, name, name_key, source, status, created_at FROM product_categories
        WHERE organization_id = $1 AND scope_key = $2`,
      [organizationId, scopeKey(workspaceId)]
    )
    return result.rows
  }

  async list(
    organizationId: string,
    workspaceId: string | null,
    products: CategorizedProduct[]
  ): Promise<ProductCategoryView[]> {
    const groups = groupProducts(products)
    const rows = await this.rows(organizationId, workspaceId)
    const views: ProductCategoryView[] = rows.map((row) => {
      const group = groups.get(row.name_key)
      groups.delete(row.name_key)
      return {
        id: row.id,
        name: group?.name ?? row.name,
        sources: group ? [...group.sources] : [row.source],
        status: row.status,
        productCount: group?.count ?? 0,
        createdAt: new Date(row.created_at).toISOString(),
      }
    })
    for (const group of groups.values()) {
      views.push({
        id: null,
        name: group.name,
        sources: [...group.sources],
        status: "active",
        productCount: group.count,
        createdAt: null,
      })
    }
    return views.sort((left, right) => left.name.localeCompare(right.name, "ar"))
  }

  async create(input: {
    organizationId: string
    workspaceId: string | null
    name: string
    userId: string
    products: CategorizedProduct[]
  }): Promise<ProductCategoryView> {
    const name = input.name.trim()
    const key = nameKey(name)
    const existing = await this.list(input.organizationId, input.workspaceId, input.products)
    if (existing.some((category) => nameKey(category.name) === key)) {
      throw ERRORS.conflict("CATEGORY_EXISTS", "A category with this name already exists.")
    }
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO product_categories
         (id, organization_id, workspace_id, scope_key, name, name_key, source, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'madar', 'active', $7)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        scopeKey(input.workspaceId),
        name,
        key,
        input.userId,
      ]
    )
    return {
      id,
      name,
      sources: ["madar"],
      status: "active",
      productCount: 0,
      createdAt: new Date().toISOString(),
    }
  }

  // Works for a category known only from its products too: its row is created on first change.
  async setStatus(input: {
    organizationId: string
    workspaceId: string | null
    name: string
    status: CategoryStatus
    userId: string
    products: CategorizedProduct[]
  }): Promise<void> {
    const key = nameKey(input.name)
    const updated = await this.db.query(
      `UPDATE product_categories SET status = $4, updated_at = now()
        WHERE organization_id = $1 AND scope_key = $2 AND name_key = $3
        RETURNING id`,
      [input.organizationId, scopeKey(input.workspaceId), key, input.status]
    )
    if (updated.rows.length > 0) return

    const group = groupProducts(input.products).get(key)
    if (!group) throw ERRORS.notFound("Category")
    const source = [...group.sources].find((value) => value !== "madar") ?? "madar"
    await this.db.query(
      `INSERT INTO product_categories
         (id, organization_id, workspace_id, scope_key, name, name_key, source, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        scopeKey(input.workspaceId),
        group.name,
        key,
        source,
        input.status,
        input.userId,
      ]
    )
  }

  // Only a category created in Madar, and only while no product uses it -- a store's category
  // comes back with its next sync, and a category in use would leave its products uncategorised.
  async remove(input: {
    organizationId: string
    workspaceId: string | null
    id: string
    products: CategorizedProduct[]
  }): Promise<void> {
    const row = (await this.rows(input.organizationId, input.workspaceId)).find(
      (candidate) => candidate.id === input.id
    )
    if (!row) throw ERRORS.notFound("Category")
    if (row.source !== "madar" || groupProducts(input.products).has(row.name_key)) {
      throw ERRORS.conflict(
        "CATEGORY_IN_USE",
        "Only an unused category created in Madar can be deleted."
      )
    }
    await this.db.query("DELETE FROM product_categories WHERE id = $1", [row.id])
  }
}
