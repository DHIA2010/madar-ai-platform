import type {
  NetIncomeReportDto,
  ReadyReportFilters,
  SalesByCustomerDto,
  SalesByProductDto,
  SalesByUserPaymentMethodDto,
} from "../types/ready-report.types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "reports", "ready"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

function buildQuery(filters: ReadyReportFilters, extra?: Record<string, string | null>): string {
  const params = new URLSearchParams()
  params.set("from", filters.from)
  params.set("to", filters.to)
  if (filters.workspaceId) params.set("workspaceId", filters.workspaceId)
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value)
  }
  return params.toString()
}

export const readyReportsService = {
  async netIncome(
    filters: ReadyReportFilters,
    timeGrouping: "day" | "week" | "month"
  ): Promise<NetIncomeReportDto> {
    const query = buildQuery(filters, { timeGrouping })
    return client.get<NetIncomeReportDto>(`${ENDPOINT}/net-income?${query}`)
  },

  async salesByUserAndPaymentMethod(
    filters: ReadyReportFilters
  ): Promise<SalesByUserPaymentMethodDto> {
    const query = buildQuery(filters)
    return client.get<SalesByUserPaymentMethodDto>(
      `${ENDPOINT}/sales-by-user-payment-method?${query}`
    )
  },

  async salesByCustomer(
    filters: ReadyReportFilters,
    customerId: string | null
  ): Promise<SalesByCustomerDto> {
    const query = buildQuery(filters, { customerId })
    return client.get<SalesByCustomerDto>(`${ENDPOINT}/sales-by-customer?${query}`)
  },

  async salesByProduct(filters: ReadyReportFilters): Promise<SalesByProductDto> {
    const query = buildQuery(filters)
    return client.get<SalesByProductDto>(`${ENDPOINT}/sales-by-product?${query}`)
  },
}
