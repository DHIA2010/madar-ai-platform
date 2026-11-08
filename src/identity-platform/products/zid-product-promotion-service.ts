import { IdentityError } from "../application/errors/IdentityError"

import type { ProductCatalogService } from "./catalog-service"
import {
  isZidVariantChild,
  mapZidProductToCreateInput,
  type ZidProductApiPayload,
} from "./zid-product-mapper"
import type { ZidProductLinksService } from "./zid-product-links-service"

// Falls back to this when a real Zid product has no categories at all -- category is a
// required, non-nullable field on a native product (catalog-service.ts), but a real synced
// product's categories array can be empty.
const DEFAULT_CATEGORY_FALLBACK = "متجر زد"

// Direct adaptation of SallaProductPromotionService. A standalone Zid product self-links at the
// product level (zid_product_id = its own id); a parent with variants becomes a native "variable"
// product whose variants each self-link to their Zid child (zid_product_id = the child's id) --
// the child is a product in its own right on Zid's side, with its own stock entry, which is what
// lets zid-product-stock-push-service.ts push a variant's stock straight to it.
export class ZidProductPromotionService {
  constructor(
    private readonly catalogService: ProductCatalogService,
    private readonly linksService: ZidProductLinksService
  ) {}

  // Can throw (a validation error, a SKU conflict, ...) -- every call site (sync-service.ts,
  // webhook-service.ts) wraps each product in its own try/catch, so a promotion failure for one
  // product never fails the surrounding sync run or webhook ack.
  async promoteOrSync(
    organizationId: string,
    workspaceId: string | null,
    payload: ZidProductApiPayload
  ): Promise<void> {
    // A child is imported as a variant of its parent, never as a product of its own -- the
    // callers re-fetch and promote the parent instead.
    if (isZidVariantChild(payload)) return

    const zidProductId = String(payload.id)
    const childIds = (payload.variants ?? []).map((child) => String(child.id))
    // The parent's own id stays a candidate too: a product promoted as standalone before it got
    // variants is linked by it, and is updated in place into a variable product.
    const candidateIds = [...childIds, zidProductId]
    const existing = await this.linksService.findProductForAnyZidId(organizationId, candidateIds)
    const input = mapZidProductToCreateInput(payload, DEFAULT_CATEGORY_FALLBACK)

    if (existing) {
      try {
        await this.updateAndRelink(organizationId, existing.productId, input, payload)
        return
      } catch (error) {
        if (!(error instanceof IdentityError && error.code === "PRODUCT_NOT_FOUND")) {
          throw error
        }
        // The native product this link pointed to was deleted since the link was created -- see
        // SallaProductPromotionService's identical fallthrough for the full reasoning. Clear the
        // stale links and fall through to create a fresh product below.
        await this.linksService.removeLinksByZidIds(organizationId, candidateIds)
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
      if (!(error instanceof IdentityError && error.code === "PRODUCT_SKU_TAKEN") || !input.sku) {
        throw error
      }
      // Zid regenerates child ids when a merchant rebuilds a product's variants, so none of the
      // candidate ids match a link any more -- but the native product already exists under this
      // exact sku. Same recovery as SallaProductPromotionService.
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
        zidProductId,
        zidProductSku: input.sku,
        zidProductName: input.name,
      },
      null
    )
  }

  // A product deleted on Zid. One auto-promotion created from it is deleted here too (a soft
  // delete, like the products page's own); one a person linked by hand is Madar's own product
  // that was also listed on Zid, so it is only unlinked and stays. A child is a variant removed
  // from its parent -- the parent's own product.update rebuilds the variants, nothing to do here.
  async removeDeleted(organizationId: string, payload: ZidProductApiPayload): Promise<void> {
    if (isZidVariantChild(payload)) return

    const zidIds = [
      String(payload.id),
      ...(payload.variants ?? []).map((child) => String(child.id)),
    ]
    const links = await this.linksService.findLinksForZidIds(organizationId, zidIds)
    const autoProductIds = new Set(
      links.filter((link) => link.createdByUserId === null).map((link) => link.productId)
    )
    for (const productId of autoProductIds) {
      try {
        await this.catalogService.delete(organizationId, productId)
      } catch (error) {
        if (!(error instanceof IdentityError && error.code === "PRODUCT_NOT_FOUND")) throw error
      }
    }
    await this.linksService.removeLinksByZidIds(organizationId, zidIds)
  }

  private async updateAndRelink(
    organizationId: string,
    productId: string,
    input: ReturnType<typeof mapZidProductToCreateInput>,
    payload: ZidProductApiPayload
  ): Promise<void> {
    await this.catalogService.update({
      organizationId,
      id: productId,
      updatedBy: null,
      product: input,
    })
    if (input.productType === "variable") {
      // update() rebuilds a variable product's variants with new ids, so the previous links now
      // point at deleted variants -- re-read and re-link them.
      const refreshed = await this.catalogService.getById(organizationId, productId)
      await this.linkVariants(organizationId, productId, refreshed.variants, payload)
    }
  }

  // Links each native variant to its Zid child by position -- the mapper builds `variants` in
  // payload.variants order, and the catalog returns them in insertion order (position = index).
  // Linking a variant also drops the product-level link (zid-product-links-service.ts), so a
  // product that just gained variants stops pushing stock to the parent.
  private async linkVariants(
    organizationId: string,
    productId: string,
    nativeVariants: Array<{ id: string }>,
    payload: ZidProductApiPayload
  ): Promise<void> {
    const children = payload.variants ?? []
    for (let index = 0; index < nativeVariants.length && index < children.length; index += 1) {
      await this.linksService.upsertLink(
        organizationId,
        {
          productId,
          variantId: nativeVariants[index].id,
          zidProductId: String(children[index].id),
          zidProductSku: children[index].sku ?? null,
          zidProductName: null,
        },
        null
      )
    }
  }
}
