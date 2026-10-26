import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { requireProcurementEnabled } from "./guards"
import { SuppliersRepository } from "./suppliers-repository"
import type { SaveSupplierInput, SupplierDto, SupplierStatus } from "./types"

export class SuppliersService {
  private readonly db: PostgresDatabase
  private readonly repository: SuppliersRepository

  constructor(db: PostgresDatabase) {
    this.db = db
    this.repository = new SuppliersRepository(db)
  }

  async list(organizationId: string): Promise<SupplierDto[]> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.list(organizationId)
  }

  async getById(organizationId: string, id: string): Promise<SupplierDto> {
    await requireProcurementEnabled(this.db, organizationId)
    const supplier = await this.repository.findById(organizationId, id)
    if (!supplier) throw ERRORS.notFound("Supplier")
    return supplier
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    input: SaveSupplierInput
  ): Promise<SupplierDto> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.create(organizationId, workspaceId, input)
  }

  async update(organizationId: string, id: string, input: SaveSupplierInput): Promise<SupplierDto> {
    await requireProcurementEnabled(this.db, organizationId)
    const updated = await this.repository.update(organizationId, id, input)
    if (!updated) throw ERRORS.notFound("Supplier")
    return updated
  }

  async setStatus(organizationId: string, ids: string[], status: SupplierStatus): Promise<number> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.setStatus(organizationId, ids, status)
  }

  async delete(organizationId: string, id: string): Promise<void> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.softDelete(organizationId, id)
  }
}
