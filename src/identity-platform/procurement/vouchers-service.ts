import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { requireProcurementEnabled } from "./guards"
import { VouchersRepository } from "./vouchers-repository"
import type { CreateSupplierVoucherInput, SupplierVoucherDto } from "./types"

export class VouchersService {
  private readonly db: PostgresDatabase
  private readonly repository: VouchersRepository

  constructor(db: PostgresDatabase) {
    this.db = db
    this.repository = new VouchersRepository(db)
  }

  async list(organizationId: string): Promise<SupplierVoucherDto[]> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.list(organizationId)
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    input: CreateSupplierVoucherInput
  ): Promise<SupplierVoucherDto> {
    await requireProcurementEnabled(this.db, organizationId)
    return this.repository.create(organizationId, workspaceId, input)
  }
}
