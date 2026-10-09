// Response shapes for the 5 bespoke "ready report" dashboards (src/features/reports/components/
// ready/). These are hand-written SQL aggregations, not the generic KPI catalog/query-builder --
// see ready-reports-repository.ts for why (the catalog engine only supports one groupByDimension
// and a single-aggregate trend, neither of which fits a two-dimension group or a multi-series
// top-5 trend).

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
  // Always covers every branch in the org for the selected date range, ignoring the page's own
  // branch filter -- the whole point is comparing branches against each other.
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
