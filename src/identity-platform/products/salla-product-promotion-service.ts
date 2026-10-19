import type { ProductCatalogService } from "./catalog-service"
import { mapSallaProductToCreateInput, type SallaProductApiPayload } from "./salla-product-mapper"
import type { SallaProductLinksService } from "./salla-product-links-service"

// Falls back to this when a real Salla product has no categories at all -- category is a
// required, non-nullable field on a native product (catalog-service.ts), but a real synced
// product's categories array can be empty.
const DEFAULT_CATEGORY_FALLBACK = "متجر سلة"

// Turns a synced Salla product into a real, stock-trackable native Madar product -- auto-linked
// to itself, no manual UI step. Runs identically whether triggered by the very first sync
// (create) or a later re-sync (update, full overwrite -- Salla's version always wins, see the
// plan's "Decided" section): the only branch is whether a link already exists for this Salla
// product, never which ingestion path (poll vs webhook) called it.
export class SallaProductPromotionService {
  constructor(
    private readonly catalogService: ProductCatalogService,
    private readonly linksService: SallaProductLinksService
  ) {}

  // Can throw (a validation error, a SKU conflict, ...) -- every call site (sync-service.ts,
  // webhook-service.ts) wraps each product in its own try/catch, so a promotion failure for one
  // product never fails the surrounding sync run or webhook ack.
  async promoteOrSync(
    organizationId: string,
    workspaceId: string | null,
    payload: SallaProductApiPayload
  ): Promise<void> {
    const sallaProductId = String(payload.id)
    const skuIds = (payload.skus ?? []).map((sku) => String(sku.id))
    // A simple product self-links at the product level (salla_product_id = the product's own
    // id); a variable product self-links per-variant (salla_product_id = each skus[].id, never
    // the parent product's own id) -- so "has this product already been promoted" means "does any
    // one of these candidate ids already have a link", not a single-id lookup.
    const candidateIds = skuIds.length > 0 ? skuIds : [sallaProductId]

    const existing = await this.linksService.findProductForAnySallaId(organizationId, candidateIds)
    const input = mapSallaProductToCreateInput(payload, DEFAULT_CATEGORY_FALLBACK)

    if (existing) {
      await this.catalogService.update({
        organizationId,
        id: existing.productId,
        updatedBy: null,
        product: input,
      })
      if (input.productType === "variable") {
        await this.relinkVariants(organizationId, existing.productId, payload)
      }
      return
    }

    const created = await this.catalogService.create({
      organizationId,
      workspaceId,
      createdBy: null,
      product: input,
    })

    if (input.productType === "variable") {
      await this.linkVariants(organizationId, created.id, created.variants, payload)
      return
    }

    await this.linksService.upsertLink(
      organizationId,
      {
        productId: created.id,
        variantId: null,
        sallaProductId,
        sallaProductSku: input.sku,
        sallaProductName: input.name,
      },
      null
    )
  }

  // Links each returned native variant to its originating Salla sku by array position -- both
  // arrays are built in the same order (the mapper builds `variants` straight from `payload.skus`
  // in order, and ProductCatalogRepository.create()/update() return variants in the same order
  // they were inserted, position = index -- confirmed at catalog-repository.ts).
  private async linkVariants(
    organizationId: string,
    productId: string,
    createdVariants: Array<{ id: string }>,
    payload: SallaProductApiPayload
  ): Promise<void> {
    const skus = payload.skus ?? []
    for (let index = 0; index < createdVariants.length && index < skus.length; index += 1) {
      await this.linksService.upsertLink(
        organizationId,
        {
          productId,
          variantId: createdVariants[index].id,
          sallaProductId: String(skus[index].id),
          sallaProductSku: skus[index].sku ?? null,
          sallaProductName: null,
        },
        null
      )
    }
  }

  // After update() rebuilds a variable product's variants (full replace, new ids each time -- see
  // catalog-repository.ts:574-589), re-resolve and re-link them the same way the initial create()
  // path does, since the previous self-links now point at deleted variant ids.
  private async relinkVariants(
    organizationId: string,
    productId: string,
    payload: SallaProductApiPayload
  ): Promise<void> {
    const refreshed = await this.catalogService.getById(organizationId, productId)
    await this.linkVariants(organizationId, productId, refreshed.variants, payload)
  }
}
