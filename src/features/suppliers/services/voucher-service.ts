import type { CreateSupplierVoucherInput, SupplierVoucher } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const VOUCHERS_ENDPOINT = ["", "v1", "supplier-vouchers"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const voucherService = {
  async list(): Promise<SupplierVoucher[]> {
    const response = await client.get<{ items: SupplierVoucher[] }>(VOUCHERS_ENDPOINT)
    return response.items
  },

  async create(input: CreateSupplierVoucherInput): Promise<SupplierVoucher> {
    return client.post<CreateSupplierVoucherInput, SupplierVoucher>(VOUCHERS_ENDPOINT, input)
  },
}
