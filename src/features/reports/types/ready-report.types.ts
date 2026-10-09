export type WaterfallStepKind = "start" | "increase" | "decrease" | "total"

export interface WaterfallStep {
  key: string
  label: string
  value: number
  kind: WaterfallStepKind
}

export interface NetIncomePeriodRow {
  label: string
  sales: number
  returns: number
  netSales: number
  tax: number
  cogs: number
  returnedCogs: number
  expenses: number
  netIncome: number
}

export interface NetIncomeTotals {
  sales: number
  tax: number
  returns: number
  netSales: number
  cogs: number
  returnedCogs: number
  expenses: number
  netIncome: number
}

export interface NetIncomeByBranchRow {
  workspaceId: string
  workspaceName: string
  netIncome: number
}

export interface NetIncomeReportDto {
  totals: NetIncomeTotals
  waterfall: WaterfallStep[]
  periods: NetIncomePeriodRow[]
  byBranch: NetIncomeByBranchRow[]
}

export interface SalesByUserPaymentMethodRow {
  cashierUserId: string | null
  cashierName: string
  paymentMethod: string
  invoiceCount: number
  totalSales: number
}

export interface SalesByUserPaymentMethodDto {
  rows: SalesByUserPaymentMethodRow[]
  kpis: {
    avgTransaction: number
    paymentMethodCount: number
    userCount: number
    totalPayments: number
  }
}

export interface SalesTrendPoint {
  id: string
  name: string
  bucket: string
  value: number
}

export interface SalesByCustomerRow {
  customerId: string
  customerName: string
  totalSales: number
  orderCount: number
  avgOrderValue: number
  lastOrderDate: string | null
}

export interface SalesByCustomerDto {
  kpis: {
    newCustomers: { value: number; changePercent: number | null }
    avgOrderValue: { value: number; changePercent: number | null }
    customerCount: { value: number; changePercent: number | null }
    totalSales: { value: number; changePercent: number | null }
  }
  customers: SalesByCustomerRow[]
  trend: SalesTrendPoint[]
}

export interface SalesByProductRow {
  productId: string
  productName: string
  category: string
  quantitySold: number
  orderCount: number
  totalSales: number
}

export interface SalesByProductDto {
  kpis: {
    productsSoldCount: number
    avgProductPrice: number
    productCount: number
    netSales: number
    totalSales: number
  }
  products: SalesByProductRow[]
  categories: Array<{ category: string; totalSales: number }>
  trend: SalesTrendPoint[]
}

export interface ReadyReportFilters {
  from: string
  to: string
  workspaceId: string | null
}
