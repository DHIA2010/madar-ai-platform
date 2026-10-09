import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { SuppliersRepository } from "./suppliers-repository"
import type { SaveSupplierInput, SupplierDto, SupplierStatus } from "./types"

export class SuppliersService {
  private readonly repository: SuppliersRepository

  constructor(db: PostgresDatabase) {
    this.repository = new SuppliersRepository(db)
  }

  list(organizationId: string): Promise<SupplierDto[]> {
    return this.repository.list(organizationId)
  }

  async getById(organizationId: string, id: string): Promise<SupplierDto> {
    const supplier = await this.repository.findById(organizationId, id)
    if (!supplier) throw ERRORS.notFound("Supplier")
    return supplier
  }

  create(
    organizationId: string,
    workspaceId: string | null,
    input: SaveSupplierInput
  ): Promise<SupplierDto> {
    return this.repository.create(organizationId, workspaceId, input)
  }

  async update(organizationId: string, id: string, input: SaveSupplierInput): Promise<SupplierDto> {
    const updated = await this.repository.update(organizationId, id, input)
    if (!updated) throw ERRORS.notFound("Supplier")
    return updated
  }

  setStatus(organizationId: string, ids: string[], status: SupplierStatus): Promise<number> {
    return this.repository.setStatus(organizationId, ids, status)
  }

  delete(organizationId: string, id: string): Promise<void> {
    return this.repository.softDelete(organizationId, id)
  }
}
