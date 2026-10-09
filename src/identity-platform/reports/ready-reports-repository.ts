import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type {
  NetIncomeByBranchRow,
  NetIncomePeriodRow,
  SalesByCustomerRow,
  SalesByProductRow,
  SalesByUserPaymentMethodRow,
  SalesTrendPoint,
} from "./ready-reports-types"

export interface ReadyReportRange {
  organizationId: string
  workspaceId: string | null
  from: string
  to: string
}

const ALLOWED_TIME_GROUPINGS = new Set(["day", "week", "month"])

export function normalizeTimeGrouping(value: string | null): "day" | "week" | "month" {
  return value && ALLOWED_TIME_GROUPINGS.has(value) ? (value as "day" | "week" | "month") : "month"
}

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value)
}

// Buckets by date in application code instead of SQL `date_trunc` -- pg-mem (this codebase's test
// harness) doesn't implement `date_trunc` at all ("implements very few native functions"), and
// since this is financial-report logic worth actually testing end-to-end, raw per-row values are
// fetched and bucketed here rather than skipping coverage for it. Same technique already used in
// src/features/expenses/hooks/use-expenses-overview.ts for monthly bucketing.
function bucketKey(dateIso: string, timeGrouping: "day" | "week" | "month"): string {
  const date = new Date(dateIso)
  if (timeGrouping === "day") return date.toISOString().slice(0, 10)
  if (timeGrouping === "week") {
    const day = date.getUTCDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setUTCDate(date.getUTCDate() + diffToMonday)
    return monday.toISOString().slice(0, 10)
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
}

// pg-mem (this codebase's test harness) can't execute an OR filter that reaches into a joined
// table ("lookups on joins") -- the usual "$N::uuid IS NULL OR col = $N" idiom breaks the moment
// a query also has a JOIN. query-builder.ts's own generic engine already sidesteps this by only
// appending a condition when the value is actually present, never emitting the OR-null form; this
// builder does the same, and also keeps every query's placeholder numbering correct as optional
// conditions and dynamic IN-lists are added.
class WhereBuilder {
  private clauses: string[] = []
  private params: unknown[] = []

  constructor(required: Array<[string, unknown]>) {
    for (const [sql, value] of required) this.add(sql, value)
  }

  private add(sqlWithPlaceholder: string, value: unknown) {
    this.params.push(value)
    this.clauses.push(sqlWithPlaceholder.replace("?", `$${this.params.length}`))
  }

  addOptional(sqlWithPlaceholder: string, value: unknown | null | undefined) {
    if (value === null || value === undefined) return
    this.add(sqlWithPlaceholder, value)
  }

  addIn(prefix: string, values: string[]) {
    if (values.length === 0) {
      this.clauses.push("1 = 0")
      return
    }
    const placeholders = values.map((value) => {
      this.params.push(value)
      return `$${this.params.length}`
    })
    this.clauses.push(`${prefix} IN (${placeholders.join(", ")})`)
  }

  get where(): string {
    return this.clauses.join(" AND ")
  }

  get values(): unknown[] {
    return this.params
  }
}

export class ReadyReportsRepository {
  constructor(private readonly db: PostgresDatabase) {}

  // ---- Net income ---------------------------------------------------------------------------

  async netIncomeTotals(range: ReadyReportRange) {
    const { organizationId, workspaceId, from, to } = range

    const salesWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    salesWhere.addOptional("workspace_id = ?", workspaceId)
    const salesResult = await this.db.query<{ sales: string; tax: string }>(
      `SELECT coalesce(sum(total_amount),0) AS sales, coalesce(sum(tax_amount),0) AS tax
       FROM pos_invoices WHERE ${salesWhere.where} AND status != 'cancelled'`,
      salesWhere.values
    )

    const returnsWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    returnsWhere.addOptional("workspace_id = ?", workspaceId)
    const returnsResult = await this.db.query<{ returns: string }>(
      `SELECT coalesce(sum(total_amount),0) AS returns FROM pos_invoice_returns WHERE ${returnsWhere.where}`,
      returnsWhere.values
    )

    // Same current-cost-price approximation catalog.ts's financial.margin field already uses --
    // pos_invoice_items has no cost-price snapshot at sale time.
    const cogsWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    cogsWhere.addOptional("p.workspace_id = ?", workspaceId)
    const cogsResult = await this.db.query<{ cogs: string }>(
      `SELECT coalesce(sum(i.quantity * coalesce(pr.cost_price,0)),0) AS cogs
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       LEFT JOIN products pr ON pr.id::text = i.product_id
       WHERE ${cogsWhere.where} AND p.status != 'cancelled'`,
      cogsWhere.values
    )

    const returnedCogsWhere = new WhereBuilder([
      ["r.organization_id = ?", organizationId],
      ["r.created_at >= ?", from],
      ["r.created_at < ?", to],
    ])
    returnedCogsWhere.addOptional("r.workspace_id = ?", workspaceId)
    const returnedCogsResult = await this.db.query<{ returned_cogs: string }>(
      `SELECT coalesce(sum(ri.quantity * coalesce(pr.cost_price,0)),0) AS returned_cogs
       FROM pos_invoice_return_items ri
       JOIN pos_invoice_returns r ON r.id = ri.return_id
       LEFT JOIN products pr ON pr.id::text = ri.product_id
       WHERE ${returnedCogsWhere.where}`,
      returnedCogsWhere.values
    )

    const expensesWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["expense_date >= ?", from],
      ["expense_date <= ?::date", to],
    ])
    expensesWhere.addOptional("workspace_id = ?", workspaceId)
    const expensesResult = await this.db.query<{ expenses: string }>(
      `SELECT coalesce(sum(amount),0) AS expenses FROM expenses
       WHERE ${expensesWhere.where} AND deleted_at IS NULL`,
      expensesWhere.values
    )

    return {
      sales: toNumber(salesResult.rows[0]?.sales),
      tax: toNumber(salesResult.rows[0]?.tax),
      returns: toNumber(returnsResult.rows[0]?.returns),
      cogs: toNumber(cogsResult.rows[0]?.cogs),
      returnedCogs: toNumber(returnedCogsResult.rows[0]?.returned_cogs),
      expenses: toNumber(expensesResult.rows[0]?.expenses),
    }
  }

  // Always covers every branch in the org -- deliberately ignores `range.workspaceId` (the
  // page's own branch filter), since the whole point is comparing branches against each other.
  async netIncomeByWorkspace(
    organizationId: string,
    from: string,
    to: string
  ): Promise<NetIncomeByBranchRow[]> {
    const salesRows = await this.db.query<{
      workspace_id: string
      workspace_name: string
      sales: string
      tax: string
    }>(
      `SELECT p.workspace_id, w.name AS workspace_name,
              coalesce(sum(p.total_amount),0) AS sales, coalesce(sum(p.tax_amount),0) AS tax
       FROM pos_invoices p
       JOIN workspaces w ON w.id = p.workspace_id
       WHERE p.organization_id = $1 AND p.created_at >= $2 AND p.created_at < $3
         AND p.status != 'cancelled'
       GROUP BY p.workspace_id, w.name`,
      [organizationId, from, to]
    )

    const returnsRows = await this.db.query<{ workspace_id: string; returns: string }>(
      `SELECT workspace_id, coalesce(sum(total_amount),0) AS returns
       FROM pos_invoice_returns
       WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY workspace_id`,
      [organizationId, from, to]
    )

    const cogsRows = await this.db.query<{ workspace_id: string; cogs: string }>(
      `SELECT p.workspace_id, coalesce(sum(i.quantity * coalesce(pr.cost_price,0)),0) AS cogs
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       LEFT JOIN products pr ON pr.id::text = i.product_id
       WHERE p.organization_id = $1 AND p.created_at >= $2 AND p.created_at < $3
         AND p.status != 'cancelled'
       GROUP BY p.workspace_id`,
      [organizationId, from, to]
    )

    const returnedCogsRows = await this.db.query<{ workspace_id: string; returned_cogs: string }>(
      `SELECT r.workspace_id, coalesce(sum(ri.quantity * coalesce(pr.cost_price,0)),0) AS returned_cogs
       FROM pos_invoice_return_items ri
       JOIN pos_invoice_returns r ON r.id = ri.return_id
       LEFT JOIN products pr ON pr.id::text = ri.product_id
       WHERE r.organization_id = $1 AND r.created_at >= $2 AND r.created_at < $3
       GROUP BY r.workspace_id`,
      [organizationId, from, to]
    )

    const expensesRows = await this.db.query<{ workspace_id: string; expenses: string }>(
      `SELECT workspace_id, coalesce(sum(amount),0) AS expenses
       FROM expenses
       WHERE organization_id = $1 AND expense_date >= $2 AND expense_date <= $3::date
         AND deleted_at IS NULL
       GROUP BY workspace_id`,
      [organizationId, from, to]
    )

    // Same merge-by-key technique as netIncomePeriods -- each metric's set of branches can
    // differ (a branch with expenses but no sales yet, say).
    const branches = new Map<
      string,
      {
        workspaceName: string
        sales: number
        tax: number
        returns: number
        cogs: number
        returnedCogs: number
        expenses: number
      }
    >()
    const ensure = (workspaceId: string, workspaceName?: string) => {
      const existing = branches.get(workspaceId)
      if (existing) {
        if (workspaceName) existing.workspaceName = workspaceName
        return existing
      }
      const created = {
        workspaceName: workspaceName ?? "غير معروف",
        sales: 0,
        tax: 0,
        returns: 0,
        cogs: 0,
        returnedCogs: 0,
        expenses: 0,
      }
      branches.set(workspaceId, created)
      return created
    }
    for (const row of salesRows.rows) {
      const branch = ensure(row.workspace_id, row.workspace_name)
      branch.sales = toNumber(row.sales)
      branch.tax = toNumber(row.tax)
    }
    for (const row of returnsRows.rows) ensure(row.workspace_id).returns = toNumber(row.returns)
    for (const row of cogsRows.rows) ensure(row.workspace_id).cogs = toNumber(row.cogs)
    for (const row of returnedCogsRows.rows) {
      ensure(row.workspace_id).returnedCogs = toNumber(row.returned_cogs)
    }
    for (const row of expensesRows.rows) ensure(row.workspace_id).expenses = toNumber(row.expenses)

    return [...branches.entries()]
      .map(([workspaceId, figures]) => {
        const netSales = figures.sales - figures.returns
        const netIncome =
          netSales - figures.tax - figures.cogs + figures.returnedCogs - figures.expenses
        return { workspaceId, workspaceName: figures.workspaceName, netIncome }
      })
      .sort((left, right) => right.netIncome - left.netIncome)
  }

  async netIncomePeriods(
    range: ReadyReportRange,
    timeGrouping: "day" | "week" | "month"
  ): Promise<NetIncomePeriodRow[]> {
    const { organizationId, workspaceId, from, to } = range

    const salesWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    salesWhere.addOptional("workspace_id = ?", workspaceId)
    const salesRows = await this.db.query<{
      created_at: string
      total_amount: string
      tax_amount: string
    }>(
      `SELECT created_at, total_amount, tax_amount
       FROM pos_invoices WHERE ${salesWhere.where} AND status != 'cancelled'`,
      salesWhere.values
    )

    const returnsWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    returnsWhere.addOptional("workspace_id = ?", workspaceId)
    const returnsRows = await this.db.query<{ created_at: string; total_amount: string }>(
      `SELECT created_at, total_amount FROM pos_invoice_returns WHERE ${returnsWhere.where}`,
      returnsWhere.values
    )

    const cogsWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    cogsWhere.addOptional("p.workspace_id = ?", workspaceId)
    const cogsRows = await this.db.query<{ created_at: string; cogs: string }>(
      `SELECT p.created_at, (i.quantity * coalesce(pr.cost_price,0)) AS cogs
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       LEFT JOIN products pr ON pr.id::text = i.product_id
       WHERE ${cogsWhere.where} AND p.status != 'cancelled'`,
      cogsWhere.values
    )

    const returnedCogsWhere = new WhereBuilder([
      ["r.organization_id = ?", organizationId],
      ["r.created_at >= ?", from],
      ["r.created_at < ?", to],
    ])
    returnedCogsWhere.addOptional("r.workspace_id = ?", workspaceId)
    const returnedCogsRows = await this.db.query<{ created_at: string; returned_cogs: string }>(
      `SELECT r.created_at, (ri.quantity * coalesce(pr.cost_price,0)) AS returned_cogs
       FROM pos_invoice_return_items ri
       JOIN pos_invoice_returns r ON r.id = ri.return_id
       LEFT JOIN products pr ON pr.id::text = ri.product_id
       WHERE ${returnedCogsWhere.where}`,
      returnedCogsWhere.values
    )

    const expensesWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["expense_date >= ?", from],
      ["expense_date <= ?::date", to],
    ])
    expensesWhere.addOptional("workspace_id = ?", workspaceId)
    const expensesRows = await this.db.query<{ expense_date: string; amount: string }>(
      `SELECT expense_date, amount FROM expenses WHERE ${expensesWhere.where} AND deleted_at IS NULL`,
      expensesWhere.values
    )

    // Each metric's buckets can differ (a month with sales but no returns, say), so merge by
    // bucket key in application code rather than trying to force one SQL shape to carry all five.
    const buckets = new Map<
      string,
      {
        sales: number
        tax: number
        returns: number
        cogs: number
        returnedCogs: number
        expenses: number
      }
    >()
    const ensure = (bucket: string) => {
      const existing = buckets.get(bucket)
      if (existing) return existing
      const created = { sales: 0, tax: 0, returns: 0, cogs: 0, returnedCogs: 0, expenses: 0 }
      buckets.set(bucket, created)
      return created
    }
    for (const row of salesRows.rows) {
      const bucket = ensure(bucketKey(row.created_at, timeGrouping))
      bucket.sales += toNumber(row.total_amount)
      bucket.tax += toNumber(row.tax_amount)
    }
    for (const row of returnsRows.rows) {
      ensure(bucketKey(row.created_at, timeGrouping)).returns += toNumber(row.total_amount)
    }
    for (const row of cogsRows.rows) {
      ensure(bucketKey(row.created_at, timeGrouping)).cogs += toNumber(row.cogs)
    }
    for (const row of returnedCogsRows.rows) {
      ensure(bucketKey(row.created_at, timeGrouping)).returnedCogs += toNumber(row.returned_cogs)
    }
    for (const row of expensesRows.rows) {
      ensure(bucketKey(row.expense_date, timeGrouping)).expenses += toNumber(row.amount)
    }

    return [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, figures]) => {
        const netSales = figures.sales - figures.returns
        // Tax reflects into net income -- see ready-reports-service.ts's own netIncome().
        const netIncome =
          netSales - figures.tax - figures.cogs + figures.returnedCogs - figures.expenses
        return {
          label: new Date(bucket).toISOString(),
          sales: figures.sales,
          returns: figures.returns,
          netSales,
          tax: figures.tax,
          cogs: figures.cogs,
          returnedCogs: figures.returnedCogs,
          expenses: figures.expenses,
          netIncome,
        }
      })
  }

  // ---- Sales by user & payment method (also powers "sales by invoice source") ---------------

  async salesByUserAndPaymentMethod(
    range: ReadyReportRange
  ): Promise<SalesByUserPaymentMethodRow[]> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    const result = await this.db.query<{
      cashier_user_id: string | null
      full_name: string | null
      payment_method_code: string
      invoice_count: string
      total: string
    }>(
      `SELECT p.cashier_user_id, u.full_name, p.payment_method_code,
              count(*) AS invoice_count, coalesce(sum(p.total_amount),0) AS total
       FROM pos_invoices p
       LEFT JOIN users u ON u.id = p.cashier_user_id
       WHERE ${where.where} AND p.status != 'cancelled'
       GROUP BY p.cashier_user_id, u.full_name, p.payment_method_code
       ORDER BY total DESC`,
      where.values
    )
    return result.rows.map((row) => ({
      cashierUserId: row.cashier_user_id,
      cashierName: row.full_name ?? "غير معروف",
      paymentMethod: row.payment_method_code,
      invoiceCount: Number(row.invoice_count),
      totalSales: toNumber(row.total),
    }))
  }

  // ---- Sales by customer ---------------------------------------------------------------------

  async customerAggregates(
    range: ReadyReportRange,
    customerId: string | null
  ): Promise<SalesByCustomerRow[]> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    where.addOptional("c.id = ?", customerId)
    const result = await this.db.query<{
      customer_id: string
      customer_name: string
      order_count: string
      total_sales: string
      last_order_at: string | null
    }>(
      `SELECT c.id AS customer_id, c.name AS customer_name,
              count(p.id) AS order_count, coalesce(sum(p.total_amount),0) AS total_sales,
              max(p.created_at) AS last_order_at
       FROM pos_invoices p
       JOIN customers c ON c.id = p.customer_id
       WHERE ${where.where} AND p.status != 'cancelled'
       GROUP BY c.id, c.name
       ORDER BY total_sales DESC`,
      where.values
    )
    return result.rows.map((row) => {
      const orderCount = Number(row.order_count)
      const totalSales = toNumber(row.total_sales)
      return {
        customerId: row.customer_id,
        customerName: row.customer_name,
        totalSales,
        orderCount,
        avgOrderValue: orderCount > 0 ? totalSales / orderCount : 0,
        lastOrderDate: row.last_order_at
          ? new Date(row.last_order_at).toISOString().slice(0, 10)
          : null,
      }
    })
  }

  async newCustomersCount(range: ReadyReportRange): Promise<number> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    where.addOptional("workspace_id = ?", workspaceId)
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*) AS count FROM customers WHERE ${where.where} AND deleted_at IS NULL`,
      where.values
    )
    return Number(result.rows[0]?.count ?? 0)
  }

  async customerTrend(range: ReadyReportRange, customerIds: string[]): Promise<SalesTrendPoint[]> {
    if (customerIds.length === 0) return []
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    where.addIn("c.id", customerIds)
    const result = await this.db.query<{
      customer_id: string
      customer_name: string
      created_at: string
      total_amount: string
    }>(
      `SELECT c.id AS customer_id, c.name AS customer_name, p.created_at, p.total_amount
       FROM pos_invoices p
       JOIN customers c ON c.id = p.customer_id
       WHERE ${where.where} AND p.status != 'cancelled'`,
      where.values
    )
    return this.pivotMonthly(
      result.rows.map((row) => ({
        id: row.customer_id,
        name: row.customer_name,
        date: row.created_at,
        value: toNumber(row.total_amount),
      }))
    )
  }

  // Sums raw rows into monthly buckets per (id, name) in application code -- see bucketKey's own
  // comment for why date_trunc isn't used here.
  private pivotMonthly(
    rows: Array<{ id: string; name: string; date: string; value: number }>
  ): SalesTrendPoint[] {
    const buckets = new Map<string, SalesTrendPoint>()
    for (const row of rows) {
      const bucket = bucketKey(row.date, "month")
      const key = `${row.id}::${bucket}`
      const existing = buckets.get(key)
      if (existing) {
        existing.value += row.value
      } else {
        buckets.set(key, {
          id: row.id,
          name: row.name,
          bucket: new Date(bucket).toISOString(),
          value: row.value,
        })
      }
    }
    return [...buckets.values()].sort((left, right) => left.bucket.localeCompare(right.bucket))
  }

  // ---- Sales by product -----------------------------------------------------------------------

  async productAggregates(range: ReadyReportRange): Promise<SalesByProductRow[]> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    const result = await this.db.query<{
      product_id: string
      product_name: string
      category: string
      quantity_sold: string
      order_count: string
      total_sales: string
    }>(
      `SELECT i.product_id, i.product_name, coalesce(pr.category,'غير مصنف') AS category,
              coalesce(sum(i.quantity),0) AS quantity_sold,
              count(DISTINCT i.invoice_id) AS order_count,
              coalesce(sum(i.line_total),0) AS total_sales
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       LEFT JOIN products pr ON pr.id::text = i.product_id
       WHERE ${where.where} AND p.status != 'cancelled'
       GROUP BY i.product_id, i.product_name, pr.category
       ORDER BY total_sales DESC`,
      where.values
    )
    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      category: row.category,
      quantitySold: toNumber(row.quantity_sold),
      orderCount: Number(row.order_count),
      totalSales: toNumber(row.total_sales),
    }))
  }

  async productReturnedAmount(range: ReadyReportRange): Promise<number> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["r.organization_id = ?", organizationId],
      ["r.created_at >= ?", from],
      ["r.created_at < ?", to],
    ])
    where.addOptional("r.workspace_id = ?", workspaceId)
    const result = await this.db.query<{ returned: string }>(
      `SELECT coalesce(sum(ri.net_amount),0) AS returned
       FROM pos_invoice_return_items ri
       JOIN pos_invoice_returns r ON r.id = ri.return_id
       WHERE ${where.where}`,
      where.values
    )
    return toNumber(result.rows[0]?.returned)
  }

  async productTrend(range: ReadyReportRange, productIds: string[]): Promise<SalesTrendPoint[]> {
    if (productIds.length === 0) return []
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    where.addIn("i.product_id", productIds)
    const result = await this.db.query<{
      product_id: string
      product_name: string
      created_at: string
      line_total: string
    }>(
      `SELECT i.product_id, i.product_name, p.created_at, i.line_total
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       WHERE ${where.where} AND p.status != 'cancelled'`,
      where.values
    )
    return this.pivotMonthly(
      result.rows.map((row) => ({
        id: row.product_id,
        name: row.product_name,
        date: row.created_at,
        value: toNumber(row.line_total),
      }))
    )
  }
}
