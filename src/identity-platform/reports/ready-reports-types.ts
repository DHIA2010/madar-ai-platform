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

// ---- VAT return ("الإقرار الضريبي") ------------------------------------------------------------
// A record only "contains VAT" (counts toward the standard-rated/input-tax figures below) when it
// carries a real, non-zero VAT marker: pos_invoices.tax_amount > 0 for a sale, purchase_line_items
// .tax_percent > 0 for a purchase line, expenses.tax_inclusive = true for an expense (expenses have
// no per-record tax amount of their own -- the VAT is extracted from the tax-inclusive gross amount
// using the organization's own default tax rate, see ready-reports-service.ts's vatReturn()).
// Records that don't carry that marker still belong in the return (a zero-rated sale/purchase is a
// real declared supply, just taxed at 0%) except for expenses, which have no zero-rated concept --
// an expense not marked tax-inclusive simply isn't part of this VAT return at all.
//
// Every figure below is net of the period's own returns: a sales return (pos_invoice_returns) nets
// against sales, a purchase return (purchase_return_items, joined back to the tax_percent its
// original purchase line was bought at) nets against purchases -- see ready-reports-service.ts's
// vatReturn().
export interface VatLineAmounts {
  amount: number
  // Negative when a return/cancellation/discount reduces the declared value -- see
  // ready-reports-service.ts's vatReturn() for why this is no longer netted into `amount` itself.
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
    // Output VAT (sales) minus input VAT (purchases + expenses) -- positive is payable, negative
    // is refundable.
    netVatDue: number
  }
}

// ---- Purchase invoices report ("تقرير فواتير المشتريات") ---------------------------------------

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

// ---- Daily sales movement report ("تقرير الحركة اليومية للمبيعات") -----------------------------
// Always bucketed by hour-of-day (0-23, UTC -- same simplification bucketKey() already makes for
// day/week/month, since this codebase has no per-organization timezone configuration to bucket
// by instead), summed across every day the selected range spans -- a single-day range (e.g.
// "اليوم") naturally produces one real hourly timeline; a longer range aggregates the same
// hour-of-day across all of its days.

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

// ---- Sales by branch report ("تقرير المبيعات حسب الفرع") ---------------------------------------

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
