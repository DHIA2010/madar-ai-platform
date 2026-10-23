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

export interface VatLineAmounts {
  amount: number
  // Negative when a return/cancellation/discount reduces the declared value.
  adjustmentAmount: number
  amountAfterAdjustment: number
  vatAmount: number
}

export interface VatReturnDto {
  sales: { standardRated: VatLineAmounts; zeroRated: VatLineAmounts }
  purchases: { standardRated: VatLineAmounts; zeroRated: VatLineAmounts }
  expenses: VatLineAmounts
  totals: {
    totalSales: number
    totalPurchases: number
    totalExpenses: number
    netVatDue: number
  }
}

export interface PurchaseInvoiceRow {
  purchaseId: string
  date: string
  supplierId: string
  supplierName: string
  supplierTaxNumber: string | null
  referenceNumber: string | null
  itemCount: number
  amountBeforeTax: number
  vatAmount: number
  total: number
}

export interface PurchaseInvoicesDto {
  rows: PurchaseInvoiceRow[]
  kpis: {
    totalItems: number
    totalVat: number
    invoiceCount: number
    totalPurchases: number
  }
}

export interface SalesMovementHourRow {
  hour: number
  invoiceCount: number
  totalSales: number
  itemsSold: number
  avgInvoiceValue: number
}

export interface SalesMovementDto {
  kpis: {
    totalSales: { value: number; changePercent: number | null }
    invoiceCount: { value: number; changePercent: number | null }
    itemsSold: { value: number; changePercent: number | null }
    avgInvoiceValue: { value: number; changePercent: number | null }
  }
  hours: SalesMovementHourRow[]
}

export interface SalesByBranchRow {
  workspaceId: string
  workspaceName: string
  totalSales: number
  orderCount: number
  avgInvoiceValue: number
  itemsSold: number
  contributionPercent: number
}

export interface SalesByBranchDto {
  kpis: {
    totalSales: number
    itemsSold: number
    avgInvoiceValue: number
    orderCount: number
  }
  branches: SalesByBranchRow[]
}

export interface PosSummaryKpiValue {
  value: number
  changePercent: number | null
}

export interface PosSummaryDto {
  kpis: {
    netSales: PosSummaryKpiValue
    totalSales: PosSummaryKpiValue
    invoiceCount: PosSummaryKpiValue
    avgInvoiceValue: PosSummaryKpiValue
    customerCount: PosSummaryKpiValue
    returns: PosSummaryKpiValue
  }
  paymentBreakdown: Array<{ paymentMethodCode: string; amount: number; percentage: number }>
  trend: Array<{ date: string; totalSales: number }>
  topProducts: SalesByProductRow[]
  branches: SalesByBranchRow[]
}

export interface ReadyReportFilters {
  from: string
  to: string
  workspaceId: string | null
}
