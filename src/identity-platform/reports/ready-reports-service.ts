import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { TaxRatesService } from "../tax/tax-rates-service"

import { type ReadyReportRange, ReadyReportsRepository } from "./ready-reports-repository"
import type {
  NetIncomeReportDto,
  PurchaseInvoicesDto,
  SalesByBranchDto,
  SalesByCustomerDto,
  SalesByProductDto,
  SalesByUserPaymentMethodDto,
  SalesMovementDto,
  VatReturnDto,
  WaterfallStep,
} from "./ready-reports-types"

const TOP_N = 5

function previousRange(from: string, to: string): { from: string; to: string } {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const lengthMs = Math.max(toMs - fromMs, 0)
  return {
    from: new Date(fromMs - lengthMs).toISOString(),
    to: new Date(fromMs).toISOString(),
  }
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

export class ReadyReportsService {
  private readonly repository: ReadyReportsRepository
  private readonly taxRatesService: TaxRatesService

  constructor(db: PostgresDatabase) {
    this.repository = new ReadyReportsRepository(db)
    this.taxRatesService = new TaxRatesService(db)
  }

  async netIncome(
    range: ReadyReportRange,
    timeGrouping: "day" | "week" | "month"
  ): Promise<NetIncomeReportDto> {
    const [totalsRaw, periods, byBranch] = await Promise.all([
      this.repository.netIncomeTotals(range),
      this.repository.netIncomePeriods(range, timeGrouping),
      this.repository.netIncomeByWorkspace(range.organizationId, range.from, range.to),
    ])

    const netSales = totalsRaw.sales - totalsRaw.returns
    // Tax reflects into net income -- subtracted in the math (matches the reference design's own
    // waterfall, which places "الضريبة" as a step right after "المبيعات").
    const netIncome =
      totalsRaw.sales -
      totalsRaw.tax -
      totalsRaw.returns -
      totalsRaw.cogs +
      totalsRaw.returnedCogs -
      totalsRaw.expenses

    const totals = {
      sales: totalsRaw.sales,
      tax: totalsRaw.tax,
      returns: totalsRaw.returns,
      netSales,
      cogs: totalsRaw.cogs,
      returnedCogs: totalsRaw.returnedCogs,
      expenses: totalsRaw.expenses,
      netIncome,
    }

    const waterfall: WaterfallStep[] = [
      { key: "sales", label: "المبيعات", value: totalsRaw.sales, kind: "start" },
      { key: "tax", label: "الضريبة", value: -totalsRaw.tax, kind: "decrease" },
      { key: "returns", label: "المرتجعات", value: -totalsRaw.returns, kind: "decrease" },
      { key: "cogs", label: "تكلفة المنتجات المباعة", value: -totalsRaw.cogs, kind: "decrease" },
      {
        key: "returnedCogs",
        label: "تكلفة المنتجات المسترجعة",
        value: totalsRaw.returnedCogs,
        kind: "increase",
      },
      { key: "expenses", label: "المصروفات", value: -totalsRaw.expenses, kind: "decrease" },
      { key: "netIncome", label: "صافي الدخل", value: netIncome, kind: "total" },
    ]

    return { totals, waterfall, periods, byBranch }
  }

  async salesByUserAndPaymentMethod(range: ReadyReportRange): Promise<SalesByUserPaymentMethodDto> {
    const rows = await this.repository.salesByUserAndPaymentMethod(range)
    const totalPayments = rows.reduce((sum, row) => sum + row.totalSales, 0)
    const invoiceCount = rows.reduce((sum, row) => sum + row.invoiceCount, 0)
    const userCount = new Set(rows.map((row) => row.cashierUserId ?? "")).size
    const paymentMethodCount = new Set(rows.map((row) => row.paymentMethod)).size

    return {
      rows,
      kpis: {
        avgTransaction: invoiceCount > 0 ? totalPayments / invoiceCount : 0,
        paymentMethodCount,
        userCount,
        totalPayments,
      },
    }
  }

  async salesByCustomer(
    range: ReadyReportRange,
    customerId: string | null
  ): Promise<SalesByCustomerDto> {
    const previous = previousRange(range.from, range.to)
    const previousRangeInput: ReadyReportRange = { ...range, from: previous.from, to: previous.to }

    const [customers, newCustomers, previousCustomers, previousNewCustomers] = await Promise.all([
      this.repository.customerAggregates(range, customerId),
      this.repository.newCustomersCount(range),
      this.repository.customerAggregates(previousRangeInput, customerId),
      this.repository.newCustomersCount(previousRangeInput),
    ])

    const totalSales = customers.reduce((sum, row) => sum + row.totalSales, 0)
    const orderCount = customers.reduce((sum, row) => sum + row.orderCount, 0)
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0

    const previousTotalSales = previousCustomers.reduce((sum, row) => sum + row.totalSales, 0)
    const previousOrderCount = previousCustomers.reduce((sum, row) => sum + row.orderCount, 0)
    const previousAvgOrderValue =
      previousOrderCount > 0 ? previousTotalSales / previousOrderCount : 0

    const topCustomerIds = customers.slice(0, TOP_N).map((row) => row.customerId)
    const trendPoints = await this.repository.customerTrend(range, topCustomerIds)

    return {
      kpis: {
        newCustomers: {
          value: newCustomers,
          changePercent: changePercent(newCustomers, previousNewCustomers),
        },
        avgOrderValue: {
          value: avgOrderValue,
          changePercent: changePercent(avgOrderValue, previousAvgOrderValue),
        },
        customerCount: {
          value: customers.length,
          changePercent: changePercent(customers.length, previousCustomers.length),
        },
        totalSales: {
          value: totalSales,
          changePercent: changePercent(totalSales, previousTotalSales),
        },
      },
      customers,
      trend: trendPoints,
    }
  }

  async salesByProduct(range: ReadyReportRange): Promise<SalesByProductDto> {
    const [products, returnedAmount] = await Promise.all([
      this.repository.productAggregates(range),
      this.repository.productReturnedAmount(range),
    ])

    const totalSales = products.reduce((sum, row) => sum + row.totalSales, 0)
    const totalQuantity = products.reduce((sum, row) => sum + row.quantitySold, 0)

    const categoryTotals = new Map<string, number>()
    for (const product of products) {
      categoryTotals.set(
        product.category,
        (categoryTotals.get(product.category) ?? 0) + product.totalSales
      )
    }
    const categories = [...categoryTotals.entries()]
      .map(([category, categoryTotal]) => ({ category, totalSales: categoryTotal }))
      .sort((left, right) => right.totalSales - left.totalSales)

    const topProductIds = products.slice(0, TOP_N).map((row) => row.productId)
    const trendPoints = await this.repository.productTrend(range, topProductIds)

    return {
      kpis: {
        productsSoldCount: products.length,
        avgProductPrice: totalQuantity > 0 ? totalSales / totalQuantity : 0,
        productCount: products.length,
        netSales: totalSales - returnedAmount,
        totalSales,
      },
      products,
      categories,
      trend: trendPoints,
    }
  }

  async vatReturn(range: ReadyReportRange): Promise<VatReturnDto> {
    const [sales, salesReturns, purchases, purchaseReturns, expensesGross, defaultRate] =
      await Promise.all([
        this.repository.vatReturnSales(range),
        this.repository.vatReturnSalesReturns(range),
        this.repository.vatReturnPurchases(range),
        this.repository.vatReturnPurchaseReturns(range),
        this.repository.vatReturnExpensesGross(range),
        this.taxRatesService.getDefaultRatePercent(range.organizationId),
      ])

    // getDefaultRatePercent returns a decimal fraction (0.15), not a percentage -- VAT is
    // extracted from the tax-inclusive gross amount as gross * rate / (1 + rate). Rounded to
    // cents -- unlike every other ready-report figure (a straight SQL sum), this one is a JS
    // floating-point division and can otherwise land a cent off (e.g. 15.000000000000002).
    const splitExclusiveOfVat = (grossInclusive: number) => {
      const vat =
        grossInclusive > 0
          ? Math.round(((grossInclusive * defaultRate) / (1 + defaultRate)) * 100) / 100
          : 0
      return { net: Math.round((grossInclusive - vat) * 100) / 100, vat }
    }
    const activeExpenses = splitExclusiveOfVat(expensesGross.active)
    const cancelledExpenses = splitExclusiveOfVat(expensesGross.cancelled)

    // A line's "amount" is always the full gross figure before anything is taken back out of it
    // (a return, a cancellation, a discount) -- those are surfaced in "adjustmentAmount" (negative,
    // since they reduce the declared value) instead of being silently netted out of "amount"
    // itself, so a cancelled expense or a returned purchase/sale stays visible in the return rather
    // than disappearing. "amountAfterAdjustment" (amount + adjustmentAmount) is the actual taxable
    // base the VAT figures below are computed from.
    const expenses = {
      amount: activeExpenses.net + cancelledExpenses.net,
      adjustmentAmount: -cancelledExpenses.net,
      amountAfterAdjustment: activeExpenses.net,
      vatAmount: activeExpenses.vat,
    }
    const salesStandard = {
      amount: sales.standardAmount,
      adjustmentAmount: -salesReturns.standardAmount,
      amountAfterAdjustment: sales.standardAmount - salesReturns.standardAmount,
      vatAmount: sales.standardVat - salesReturns.standardVat,
    }
    const salesZero = {
      amount: sales.zeroAmount,
      adjustmentAmount: -salesReturns.zeroAmount,
      amountAfterAdjustment: sales.zeroAmount - salesReturns.zeroAmount,
      vatAmount: 0,
    }
    const purchasesStandard = {
      amount: purchases.standardAmount,
      adjustmentAmount: -(purchases.standardAdjustment + purchaseReturns.standardAmount),
      amountAfterAdjustment:
        purchases.standardAmount - purchases.standardAdjustment - purchaseReturns.standardAmount,
      vatAmount: purchases.standardVat - purchaseReturns.standardVat,
    }
    const purchasesZero = {
      amount: purchases.zeroAmount,
      adjustmentAmount: -(purchases.zeroAdjustment + purchaseReturns.zeroAmount),
      amountAfterAdjustment:
        purchases.zeroAmount - purchases.zeroAdjustment - purchaseReturns.zeroAmount,
      vatAmount: 0,
    }

    return {
      sales: { standardRated: salesStandard, zeroRated: salesZero },
      purchases: { standardRated: purchasesStandard, zeroRated: purchasesZero },
      expenses,
      totals: {
        totalSales: salesStandard.amountAfterAdjustment + salesZero.amountAfterAdjustment,
        totalPurchases:
          purchasesStandard.amountAfterAdjustment + purchasesZero.amountAfterAdjustment,
        totalExpenses: expenses.amountAfterAdjustment,
        netVatDue: salesStandard.vatAmount - purchasesStandard.vatAmount - expenses.vatAmount,
      },
    }
  }

  async purchaseInvoices(range: ReadyReportRange): Promise<PurchaseInvoicesDto> {
    const rows = await this.repository.purchaseInvoices(range)
    return {
      rows,
      kpis: {
        totalItems: rows.reduce((sum, row) => sum + row.itemCount, 0),
        totalVat: rows.reduce((sum, row) => sum + row.vatAmount, 0),
        invoiceCount: rows.length,
        totalPurchases: rows.reduce((sum, row) => sum + row.total, 0),
      },
    }
  }

  async salesMovement(range: ReadyReportRange): Promise<SalesMovementDto> {
    const previous = previousRange(range.from, range.to)
    const previousRangeInput: ReadyReportRange = { ...range, from: previous.from, to: previous.to }

    const [hours, previousHours] = await Promise.all([
      this.repository.salesMovementByHour(range),
      this.repository.salesMovementByHour(previousRangeInput),
    ])

    const sum = (list: typeof hours, pick: (row: (typeof hours)[number]) => number) =>
      list.reduce((total, row) => total + pick(row), 0)

    const totalSales = sum(hours, (row) => row.totalSales)
    const invoiceCount = sum(hours, (row) => row.invoiceCount)
    const itemsSold = sum(hours, (row) => row.itemsSold)
    const avgInvoiceValue = invoiceCount > 0 ? totalSales / invoiceCount : 0

    const previousTotalSales = sum(previousHours, (row) => row.totalSales)
    const previousInvoiceCount = sum(previousHours, (row) => row.invoiceCount)
    const previousItemsSold = sum(previousHours, (row) => row.itemsSold)
    const previousAvgInvoiceValue =
      previousInvoiceCount > 0 ? previousTotalSales / previousInvoiceCount : 0

    return {
      kpis: {
        totalSales: {
          value: totalSales,
          changePercent: changePercent(totalSales, previousTotalSales),
        },
        invoiceCount: {
          value: invoiceCount,
          changePercent: changePercent(invoiceCount, previousInvoiceCount),
        },
        itemsSold: { value: itemsSold, changePercent: changePercent(itemsSold, previousItemsSold) },
        avgInvoiceValue: {
          value: avgInvoiceValue,
          changePercent: changePercent(avgInvoiceValue, previousAvgInvoiceValue),
        },
      },
      hours,
    }
  }

  async salesByBranch(range: ReadyReportRange): Promise<SalesByBranchDto> {
    const branches = await this.repository.salesByBranch(range)
    const totalSales = branches.reduce((sum, branch) => sum + branch.totalSales, 0)
    const orderCount = branches.reduce((sum, branch) => sum + branch.orderCount, 0)
    const itemsSold = branches.reduce((sum, branch) => sum + branch.itemsSold, 0)

    return {
      kpis: {
        totalSales,
        itemsSold,
        avgInvoiceValue: orderCount > 0 ? totalSales / orderCount : 0,
        orderCount,
      },
      branches: branches.map((branch) => ({
        ...branch,
        contributionPercent: totalSales > 0 ? (branch.totalSales / totalSales) * 100 : 0,
      })),
    }
  }
}
