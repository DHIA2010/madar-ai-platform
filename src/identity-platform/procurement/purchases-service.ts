import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { PurchasesRepository } from "./purchases-repository"
import type { PurchaseDto, SavePurchaseInput } from "./types"

export class PurchasesService {
  private readonly repository: PurchasesRepository

  constructor(db: PostgresDatabase) {
    this.repository = new PurchasesRepository(db)
  }

  list(organizationId: string): Promise<PurchaseDto[]> {
    return this.repository.list(organizationId)
  }

  async getById(organizationId: string, id: string): Promise<PurchaseDto> {
    const purchase = await this.repository.findById(organizationId, id)
    if (!purchase) throw ERRORS.notFound("Purchase")
    return purchase
  }

  create(
    organizationId: string,
    workspaceId: string | null,
    input: SavePurchaseInput
  ): Promise<PurchaseDto> {
    if (input.items.length === 0) {
      throw ERRORS.validation({ items: "At least one line item is required." })
    }
    return this.repository.create(organizationId, workspaceId, input)
  }

  async update(organizationId: string, id: string, input: SavePurchaseInput): Promise<PurchaseDto> {
    if (input.items.length === 0) {
      throw ERRORS.validation({ items: "At least one line item is required." })
    }
    const updated = await this.repository.update(organizationId, id, input)
    if (!updated) throw ERRORS.notFound("Purchase")
    return updated
  }
}
