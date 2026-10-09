import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { type ReadyReportRange, ReadyReportsRepository } from "./ready-reports-repository"
import type {
  NetIncomeReportDto,
  SalesByCustomerDto,
  SalesByProductDto,
  SalesByUserPaymentMethodDto,
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

  constructor(db: PostgresDatabase) {
    this.repository = new ReadyReportsRepository(db)
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
}
