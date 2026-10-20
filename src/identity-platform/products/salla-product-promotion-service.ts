import { IdentityError } from "../application/errors/IdentityError"

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
      try {
        await this.updateAndRelink(organizationId, existing.productId, input, payload)
        return
      } catch (error) {
        if (!(error instanceof IdentityError && error.code === "PRODUCT_NOT_FOUND")) {
          throw error
        }
        // The native product this link pointed to was deleted since the link was created --
        // findProductForAnySallaId has no way to know that itself (it never joins against
        // products). Confirmed live: this previously left a Salla product permanently stuck,
        // re-failing promotion on every future sync, since re-creating a product and adding a
        // fresh link never cleared the dead one out first. Clear it and fall through to create a
        // fresh product below, exactly as if this Salla product had never been promoted.
        await this.linksService.removeLinksBySallaIds(organizationId, candidateIds)
      }
    }

    let created
    try {
      created = await this.catalogService.create({
        organizationId,
        workspaceId,
        createdBy: null,
        product: input,
      })
    } catch (error) {
      if (!(error instanceof IdentityError && error.code === "PRODUCT_SKU_TAKEN")) {
        throw error
      }
      // Salla can regenerate a product's own sku ids when its variants are edited in its
      // dashboard -- confirmed live (a real product.variant.updated/product.updated webhook
      // delivery while a merchant edited variants). The new ids then match no existing link
      // (candidateIds above is built from skus[], which just changed), so this looked like an
      // unpromoted product -- but the native product itself already exists under this exact sku.
      // Find it by its own sku instead of permanently failing every future sync for it.
      // (input.sku is only ever null for a type the mapper never produces here, "raw"/"bundle" --
      // a null sku could never have triggered PRODUCT_SKU_TAKEN in the first place.)
      if (!input.sku) throw error
      const bySku = await this.catalogService.lookupBySku(organizationId, input.sku)
      if (!bySku) throw error
      await this.updateAndRelink(organizationId, bySku.productId, input, payload)
      return
    }

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

  private async updateAndRelink(
    organizationId: string,
    productId: string,
    input: ReturnType<typeof mapSallaProductToCreateInput>,
    payload: SallaProductApiPayload
  ): Promise<void> {
    await this.catalogService.update({
      organizationId,
      id: productId,
      updatedBy: null,
      product: input,
    })
    if (input.productType === "variable") {
      await this.relinkVariants(organizationId, productId, payload)
    }
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
