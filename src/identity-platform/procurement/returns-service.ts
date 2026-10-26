import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { requireProcurementEnabled } from "./guards"
import { ReturnsRepository } from "./returns-repository"
import type { CreatePurchaseReturnInput, PurchaseReturnDto } from "./types"

export class ReturnsService {
  private readonly db: PostgresDatabase
  private readonly repository: ReturnsRepository

  constructor(db: PostgresDatabase) {
    this.db = db
    this.repository = new ReturnsRepository(db)
  }

  async list(organizationId: string): Promise<PurchaseReturnDto[]> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.list(organizationId)
  }

  async getById(organizationId: string, id: string): Promise<PurchaseReturnDto> {
    await requireProcurementEnabled(this.db, organizationId)
    const entry = await this.repository.findById(organizationId, id)
    if (!entry) throw ERRORS.notFound("Purchase return")
    return entry
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    input: CreatePurchaseReturnInput
  ): Promise<PurchaseReturnDto> {
    await requireProcurementEnabled(this.db, organizationId)
    if (input.items.length === 0) {
      throw ERRORS.validation({ items: "At least one line item is required." })
    }
    return this.repository.create(organizationId, workspaceId, input)
  }
}
