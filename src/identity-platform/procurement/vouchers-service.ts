import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { VouchersRepository } from "./vouchers-repository"
import type { CreateSupplierVoucherInput, SupplierVoucherDto } from "./types"

export class VouchersService {
  private readonly repository: VouchersRepository

  constructor(db: PostgresDatabase) {
    this.repository = new VouchersRepository(db)
  }

  list(organizationId: string): Promise<SupplierVoucherDto[]> {
    return this.repository.list(organizationId)
  }

  create(
    organizationId: string,
    workspaceId: string | null,
    input: CreateSupplierVoucherInput
  ): Promise<SupplierVoucherDto> {
    return this.repository.create(organizationId, workspaceId, input)
  }
}
