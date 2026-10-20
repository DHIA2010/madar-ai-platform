import { IdentityError } from "../application/errors/IdentityError"

import type { ProductCatalogService } from "./catalog-service"
import { mapZidProductToCreateInput, type ZidProductApiPayload } from "./zid-product-mapper"
import type { ZidProductLinksService } from "./zid-product-links-service"

// Falls back to this when a real Zid product has no categories at all -- category is a
// required, non-nullable field on a native product (catalog-service.ts), but a real synced
// product's categories array can be empty.
const DEFAULT_CATEGORY_FALLBACK = "متجر زد"

// Direct adaptation of SallaProductPromotionService, simplified: Zid products map to "simple"
// only this pass (no confirmed variant/options shape was available to build against -- see
// zid-product-mapper.ts), so there's no per-variant self-linking branch to handle -- every
// promoted Zid product self-links at the product level.
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
    const zidProductId = String(payload.id)
    const existing = await this.linksService.findProductForAnyZidId(organizationId, [zidProductId])
    const input = mapZidProductToCreateInput(payload, DEFAULT_CATEGORY_FALLBACK)

    if (existing) {
      try {
        await this.catalogService.update({
          organizationId,
          id: existing.productId,
          updatedBy: null,
          product: input,
        })
        return
      } catch (error) {
        if (!(error instanceof IdentityError && error.code === "PRODUCT_NOT_FOUND")) {
          throw error
        }
        // The native product this link pointed to was deleted since the link was created -- see
        // SallaProductPromotionService's identical fallthrough for the full reasoning. Clear the
        // stale link and fall through to create a fresh product below.
        await this.linksService.removeLinksByZidIds(organizationId, [zidProductId])
      }
    }

    const created = await this.catalogService.create({
      organizationId,
      workspaceId,
      createdBy: null,
      product: input,
    })

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
}
