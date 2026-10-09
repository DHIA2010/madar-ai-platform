import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { ReturnsRepository } from "./returns-repository"
import type { CreatePurchaseReturnInput, PurchaseReturnDto, ReturnStatus } from "./types"

export class ReturnsService {
  private readonly repository: ReturnsRepository

  constructor(db: PostgresDatabase) {
    this.repository = new ReturnsRepository(db)
  }

  list(organizationId: string): Promise<PurchaseReturnDto[]> {
    return this.repository.list(organizationId)
  }

  async getById(organizationId: string, id: string): Promise<PurchaseReturnDto> {
    const entry = await this.repository.findById(organizationId, id)
    if (!entry) throw ERRORS.notFound("Purchase return")
    return entry
  }

  create(
    organizationId: string,
    workspaceId: string | null,
    input: CreatePurchaseReturnInput
  ): Promise<PurchaseReturnDto> {
    if (input.items.length === 0) {
      throw ERRORS.validation({ items: "At least one line item is required." })
    }
    return this.repository.create(organizationId, workspaceId, input)
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: ReturnStatus
  ): Promise<PurchaseReturnDto> {
    const updated = await this.repository.setStatus(organizationId, id, status)
    if (!updated) throw ERRORS.notFound("Purchase return")
    return updated
  }
}
