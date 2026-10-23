import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type {
  NetIncomeByBranchRow,
  NetIncomePeriodRow,
  PurchaseInvoiceRow,
  SalesByCustomerRow,
  SalesByProductRow,
  SalesByUserPaymentMethodRow,
  SalesMovementHourRow,
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

// node-pg parses a Postgres `date` column (no time/timezone component) into a JS Date built from
// its LOCAL calendar fields -- formatting it via .toISOString().slice(0,10) re-reads that through
// UTC and can shift the calendar day backward a full day for any timezone ahead of UTC (see the
// identical fix/comment in expenses-repository.ts's mapExpense). Local getters undo nothing and
// always reproduce the exact day that was stored. Only for genuine `date`-only columns (e.g.
// purchases.date) -- bucketKey() below intentionally stays UTC-based, since it buckets real
// timestamptz instants (created_at/expense_date-as-filter-bound), not a stored calendar date.
function formatDateOnly(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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
       WHERE ${expensesWhere.where} AND deleted_at IS NULL AND status != 'cancelled'`,
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
         AND deleted_at IS NULL AND status != 'cancelled'
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
      `SELECT expense_date, amount FROM expenses
       WHERE ${expensesWhere.where} AND deleted_at IS NULL AND status != 'cancelled'`,
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

  // ---- VAT return ----------------------------------------------------------------------------

  async vatReturnSales(
    range: ReadyReportRange
  ): Promise<{ standardAmount: number; standardVat: number; zeroAmount: number }> {
    const { organizationId, workspaceId, from, to } = range

    const standardWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    standardWhere.addOptional("workspace_id = ?", workspaceId)
    const standardResult = await this.db.query<{ amount: string; vat: string }>(
      `SELECT coalesce(sum(subtotal_amount),0) AS amount, coalesce(sum(tax_amount),0) AS vat
       FROM pos_invoices
       WHERE ${standardWhere.where} AND status != 'cancelled' AND tax_amount > 0`,
      standardWhere.values
    )

    const zeroWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    zeroWhere.addOptional("workspace_id = ?", workspaceId)
    const zeroResult = await this.db.query<{ amount: string }>(
      `SELECT coalesce(sum(subtotal_amount),0) AS amount
       FROM pos_invoices
       WHERE ${zeroWhere.where} AND status != 'cancelled' AND tax_amount = 0`,
      zeroWhere.values
    )

    return {
      standardAmount: toNumber(standardResult.rows[0]?.amount),
      standardVat: toNumber(standardResult.rows[0]?.vat),
      zeroAmount: toNumber(zeroResult.rows[0]?.amount),
    }
  }

  // A sales return is its own credit-note event with its own subtotal/tax (pos_invoice_returns,
  // migration 073) -- classified standard/zero the same way as the original sale (by whether
  // tax_amount is non-zero on the return itself, not the invoice it refers back to), then netted
  // against the original sales figures in the service layer.
  async vatReturnSalesReturns(
    range: ReadyReportRange
  ): Promise<{ standardAmount: number; standardVat: number; zeroAmount: number }> {
    const { organizationId, workspaceId, from, to } = range

    const standardWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    standardWhere.addOptional("workspace_id = ?", workspaceId)
    const standardResult = await this.db.query<{ amount: string; vat: string }>(
      `SELECT coalesce(sum(subtotal_amount),0) AS amount, coalesce(sum(tax_amount),0) AS vat
       FROM pos_invoice_returns WHERE ${standardWhere.where} AND tax_amount > 0`,
      standardWhere.values
    )

    const zeroWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    zeroWhere.addOptional("workspace_id = ?", workspaceId)
    const zeroResult = await this.db.query<{ amount: string }>(
      `SELECT coalesce(sum(subtotal_amount),0) AS amount
       FROM pos_invoice_returns WHERE ${zeroWhere.where} AND tax_amount = 0`,
      zeroWhere.values
    )

    return {
      standardAmount: toNumber(standardResult.rows[0]?.amount),
      standardVat: toNumber(standardResult.rows[0]?.vat),
      zeroAmount: toNumber(zeroResult.rows[0]?.amount),
    }
  }

  // A purchase return (purchase_return_items) carries no tax rate of its own -- it's joined back
  // to the original purchase's own line (same purchase_id + product_id) to find the tax_percent
  // that line was actually bought at, then netted against the original purchases figures in the
  // service layer. Filtered by the RETURN's own return_date, not the original purchase's date --
  // a return can land in a different VAT period than the purchase it refers back to. A return
  // against a purchase that used order-level tax (order_tax_percent > 0, every line's own
  // tax_percent left at 0 -- see vatReturnPurchases's own comment) is pulled into its own query
  // and bucketed standard using that order-level rate, for the same reason.
  async vatReturnPurchaseReturns(
    range: ReadyReportRange
  ): Promise<{ standardAmount: number; standardVat: number; zeroAmount: number }> {
    const { organizationId, workspaceId, from, to } = range

    const standardWhere = new WhereBuilder([
      ["pr.organization_id = ?", organizationId],
      ["pr.return_date >= ?", from],
      ["pr.return_date <= ?::date", to],
    ])
    standardWhere.addOptional("pr.workspace_id = ?", workspaceId)
    const standardResult = await this.db.query<{ amount: string; vat: string }>(
      `SELECT coalesce(sum(pri.unit_cost * pri.qty),0) AS amount,
              coalesce(sum(pri.unit_cost * pri.qty * pli.tax_percent / 100),0) AS vat
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.return_id
       JOIN purchases p ON p.id = pr.purchase_id
       JOIN purchase_line_items pli
         ON pli.purchase_id = pr.purchase_id AND pli.product_id = pri.product_id
       WHERE ${standardWhere.where} AND pr.deleted_at IS NULL AND p.order_tax_percent = 0
         AND pli.tax_percent > 0`,
      standardWhere.values
    )

    const zeroWhere = new WhereBuilder([
      ["pr.organization_id = ?", organizationId],
      ["pr.return_date >= ?", from],
      ["pr.return_date <= ?::date", to],
    ])
    zeroWhere.addOptional("pr.workspace_id = ?", workspaceId)
    const zeroResult = await this.db.query<{ amount: string }>(
      `SELECT coalesce(sum(pri.unit_cost * pri.qty),0) AS amount
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.return_id
       JOIN purchases p ON p.id = pr.purchase_id
       JOIN purchase_line_items pli
         ON pli.purchase_id = pr.purchase_id AND pli.product_id = pri.product_id
       WHERE ${zeroWhere.where} AND pr.deleted_at IS NULL AND p.order_tax_percent = 0
         AND pli.tax_percent = 0`,
      zeroWhere.values
    )

    const orderTaxWhere = new WhereBuilder([
      ["pr.organization_id = ?", organizationId],
      ["pr.return_date >= ?", from],
      ["pr.return_date <= ?::date", to],
    ])
    orderTaxWhere.addOptional("pr.workspace_id = ?", workspaceId)
    const orderTaxResult = await this.db.query<{ amount: string; vat: string }>(
      `SELECT coalesce(sum(pri.unit_cost * pri.qty),0) AS amount,
              coalesce(sum(pri.unit_cost * pri.qty * p.order_tax_percent / 100),0) AS vat
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.return_id
       JOIN purchases p ON p.id = pr.purchase_id
       WHERE ${orderTaxWhere.where} AND pr.deleted_at IS NULL AND p.order_tax_percent > 0`,
      orderTaxWhere.values
    )

    return {
      standardAmount:
        toNumber(standardResult.rows[0]?.amount) + toNumber(orderTaxResult.rows[0]?.amount),
      standardVat: toNumber(standardResult.rows[0]?.vat) + toNumber(orderTaxResult.rows[0]?.vat),
      zeroAmount: toNumber(zeroResult.rows[0]?.amount),
    }
  }

  // Purchases have no invoice-level tax amount of their own in the common case -- each
  // purchase_line_items row carries its own tax_percent, so "contains VAT" is normally a per-line
  // check, and the VAT amount is computed here (net_unit_cost * qty - discount) * tax_percent / 100,
  // the exact same formula purchase-print-document.tsx already uses for a purchase's own printed
  // tax total. A purchase entered with the order-level tax toggle (see purchase-form.tsx's
  // taxLevel) instead has every line's tax_percent zeroed and the real rate living on
  // purchases.order_tax_percent -- those purchases are pulled out into their own query (third
  // below) and bucketed standard, since per-line tax_percent alone would otherwise misclassify
  // them as zero-rated and silently drop their VAT.
  async vatReturnPurchases(range: ReadyReportRange): Promise<{
    standardAmount: number
    standardAdjustment: number
    standardVat: number
    zeroAmount: number
    zeroAdjustment: number
  }> {
    const { organizationId, workspaceId, from, to } = range

    const standardWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.date >= ?", from],
      ["p.date <= ?::date", to],
    ])
    standardWhere.addOptional("p.workspace_id = ?", workspaceId)
    const standardResult = await this.db.query<{ amount: string; adjustment: string; vat: string }>(
      `SELECT coalesce(sum(pli.net_unit_cost * pli.qty),0) AS amount,
              coalesce(sum(pli.discount),0) AS adjustment,
              coalesce(sum((pli.net_unit_cost * pli.qty - pli.discount) * pli.tax_percent / 100),0) AS vat
       FROM purchase_line_items pli
       JOIN purchases p ON p.id = pli.purchase_id
       WHERE ${standardWhere.where} AND p.deleted_at IS NULL AND p.order_tax_percent = 0
         AND pli.tax_percent > 0`,
      standardWhere.values
    )

    const zeroWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.date >= ?", from],
      ["p.date <= ?::date", to],
    ])
    zeroWhere.addOptional("p.workspace_id = ?", workspaceId)
    const zeroResult = await this.db.query<{ amount: string; adjustment: string }>(
      `SELECT coalesce(sum(pli.net_unit_cost * pli.qty),0) AS amount,
              coalesce(sum(pli.discount),0) AS adjustment
       FROM purchase_line_items pli
       JOIN purchases p ON p.id = pli.purchase_id
       WHERE ${zeroWhere.where} AND p.deleted_at IS NULL AND p.order_tax_percent = 0
         AND pli.tax_percent = 0`,
      zeroWhere.values
    )

    const orderTaxWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.date >= ?", from],
      ["p.date <= ?::date", to],
    ])
    orderTaxWhere.addOptional("p.workspace_id = ?", workspaceId)
    const orderTaxResult = await this.db.query<{ amount: string; adjustment: string; vat: string }>(
      `SELECT coalesce(sum(t.gross),0) AS amount,
              coalesce(sum(t.discount),0) AS adjustment,
              coalesce(sum((t.gross - t.discount) * t.order_tax_percent / 100),0) AS vat
       FROM (
         SELECT p.id, p.order_tax_percent,
                sum(pli.net_unit_cost * pli.qty) AS gross,
                sum(pli.discount) AS discount
         FROM purchases p
         JOIN purchase_line_items pli ON pli.purchase_id = p.id
         WHERE ${orderTaxWhere.where} AND p.deleted_at IS NULL AND p.order_tax_percent > 0
         GROUP BY p.id, p.order_tax_percent
       ) t`,
      orderTaxWhere.values
    )

    return {
      standardAmount:
        toNumber(standardResult.rows[0]?.amount) + toNumber(orderTaxResult.rows[0]?.amount),
      standardAdjustment:
        toNumber(standardResult.rows[0]?.adjustment) + toNumber(orderTaxResult.rows[0]?.adjustment),
      standardVat: toNumber(standardResult.rows[0]?.vat) + toNumber(orderTaxResult.rows[0]?.vat),
      zeroAmount: toNumber(zeroResult.rows[0]?.amount),
      zeroAdjustment: toNumber(zeroResult.rows[0]?.adjustment),
    }
  }

  // Only tax_inclusive expenses count toward the VAT return at all -- an expense not marked
  // tax-inclusive (e.g. a salary or a government fee) carries no VAT to reclaim, and has no
  // zero-rated equivalent the way a sale/purchase does. Cancelled expenses are reported too (as a
  // negative adjustment in the service layer, see vatReturn()) rather than silently vanishing from
  // the return, so both the active and cancelled totals are fetched here.
  async vatReturnExpensesGross(
    range: ReadyReportRange
  ): Promise<{ active: number; cancelled: number }> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["expense_date >= ?", from],
      ["expense_date <= ?::date", to],
    ])
    where.addOptional("workspace_id = ?", workspaceId)
    const result = await this.db.query<{ active: string; cancelled: string }>(
      // sum(case when ...) rather than FILTER (WHERE ...) -- pg-mem (the test harness's in-memory
      // Postgres) doesn't implement FILTER, see invoices-service.ts's identical note.
      `SELECT
         coalesce(sum(CASE WHEN status != 'cancelled' THEN amount ELSE 0 END),0) AS active,
         coalesce(sum(CASE WHEN status = 'cancelled' THEN amount ELSE 0 END),0) AS cancelled
       FROM expenses
       WHERE ${where.where} AND deleted_at IS NULL AND tax_inclusive = true`,
      where.values
    )
    return {
      active: toNumber(result.rows[0]?.active),
      cancelled: toNumber(result.rows[0]?.cancelled),
    }
  }

  // ---- Purchase invoices ----------------------------------------------------------------------

  // Fetches raw purchase+line-item rows (one row per line, a purchase with no lines still gets one
  // row via the LEFT JOIN with every pli.* column null) and aggregates per purchase in application
  // code -- avoids a GROUP BY that would need to include suppliers.company_details (a jsonb column,
  // not a safe GROUP BY key) just to carry the supplier's name/tax number through.
  async purchaseInvoices(range: ReadyReportRange): Promise<PurchaseInvoiceRow[]> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.date >= ?", from],
      ["p.date <= ?::date", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    const result = await this.db.query<{
      purchase_id: string
      date: string
      reference_number: string | null
      supplier_id: string
      supplier_name: string
      company_details: unknown
      net_unit_cost: string | null
      qty: string | null
      discount: string | null
      tax_percent: string | null
    }>(
      `SELECT p.id AS purchase_id, p.date, p.reference_number, p.supplier_id, s.name AS supplier_name,
              s.company_details, pli.net_unit_cost, pli.qty, pli.discount, pli.tax_percent
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN purchase_line_items pli ON pli.purchase_id = p.id
       WHERE ${where.where} AND p.deleted_at IS NULL`,
      where.values
    )

    const purchases = new Map<
      string,
      {
        date: string
        referenceNumber: string | null
        supplierId: string
        supplierName: string
        supplierTaxNumber: string | null
        itemCount: number
        amountBeforeTax: number
        vatAmount: number
      }
    >()

    for (const row of result.rows) {
      let purchase = purchases.get(row.purchase_id)
      if (!purchase) {
        const companyDetails = row.company_details as Record<string, unknown> | null
        const taxNumber =
          typeof companyDetails?.taxNumber === "string" ? companyDetails.taxNumber : null
        purchase = {
          date: formatDateOnly(row.date),
          referenceNumber: row.reference_number,
          supplierId: row.supplier_id,
          supplierName: row.supplier_name,
          supplierTaxNumber: taxNumber,
          itemCount: 0,
          amountBeforeTax: 0,
          vatAmount: 0,
        }
        purchases.set(row.purchase_id, purchase)
      }
      if (row.net_unit_cost === null) continue
      const lineNet = toNumber(row.net_unit_cost) * toNumber(row.qty) - toNumber(row.discount)
      purchase.itemCount += 1
      purchase.amountBeforeTax += lineNet
      purchase.vatAmount += (lineNet * toNumber(row.tax_percent)) / 100
    }

    return [...purchases.entries()]
      .map(([purchaseId, purchase]) => ({
        purchaseId,
        date: purchase.date,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        supplierTaxNumber: purchase.supplierTaxNumber,
        referenceNumber: purchase.referenceNumber,
        itemCount: purchase.itemCount,
        amountBeforeTax: purchase.amountBeforeTax,
        vatAmount: purchase.vatAmount,
        total: purchase.amountBeforeTax + purchase.vatAmount,
      }))
      .sort((left, right) => right.date.localeCompare(left.date))
  }

  // ---- Daily sales movement --------------------------------------------------------------------

  // Always bucketed by hour-of-day (0-23, UTC), zero-filled -- see ready-reports-types.ts's own
  // comment on SalesMovementDto for why.
  async salesMovementByHour(range: ReadyReportRange): Promise<SalesMovementHourRow[]> {
    const { organizationId, workspaceId, from, to } = range

    const invoicesWhere = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    invoicesWhere.addOptional("workspace_id = ?", workspaceId)
    const invoiceRows = await this.db.query<{ created_at: string; total_amount: string }>(
      `SELECT created_at, total_amount FROM pos_invoices
       WHERE ${invoicesWhere.where} AND status != 'cancelled'`,
      invoicesWhere.values
    )

    const itemsWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    itemsWhere.addOptional("p.workspace_id = ?", workspaceId)
    const itemRows = await this.db.query<{ created_at: string; quantity: string }>(
      `SELECT p.created_at, i.quantity
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       WHERE ${itemsWhere.where} AND p.status != 'cancelled'`,
      itemsWhere.values
    )

    const buckets = new Map<
      number,
      { invoiceCount: number; totalSales: number; itemsSold: number }
    >()
    for (let hour = 0; hour < 24; hour += 1) {
      buckets.set(hour, { invoiceCount: 0, totalSales: 0, itemsSold: 0 })
    }
    for (const row of invoiceRows.rows) {
      const bucket = buckets.get(new Date(row.created_at).getUTCHours())!
      bucket.invoiceCount += 1
      bucket.totalSales += toNumber(row.total_amount)
    }
    for (const row of itemRows.rows) {
      buckets.get(new Date(row.created_at).getUTCHours())!.itemsSold += toNumber(row.quantity)
    }

    return [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([hour, bucket]) => ({
        hour,
        invoiceCount: bucket.invoiceCount,
        totalSales: bucket.totalSales,
        itemsSold: bucket.itemsSold,
        avgInvoiceValue: bucket.invoiceCount > 0 ? bucket.totalSales / bucket.invoiceCount : 0,
      }))
  }

  // ---- Sales by branch -------------------------------------------------------------------------

  // Unlike netIncomeByWorkspace, this one DOES respect the page's own branch filter (range
  // .workspaceId) -- the report's own "الفرع" dropdown is meant to narrow the comparison down to
  // one branch, not just annotate a fixed organization-wide comparison.
  async salesByBranch(range: ReadyReportRange): Promise<
    Array<{
      workspaceId: string
      workspaceName: string
      totalSales: number
      orderCount: number
      avgInvoiceValue: number
      itemsSold: number
    }>
  > {
    const { organizationId, workspaceId, from, to } = range

    const salesWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    salesWhere.addOptional("p.workspace_id = ?", workspaceId)
    const salesRows = await this.db.query<{
      workspace_id: string
      workspace_name: string
      order_count: string
      total_sales: string
    }>(
      `SELECT p.workspace_id, w.name AS workspace_name, count(*) AS order_count,
              coalesce(sum(p.total_amount),0) AS total_sales
       FROM pos_invoices p
       JOIN workspaces w ON w.id = p.workspace_id
       WHERE ${salesWhere.where} AND p.status != 'cancelled'
       GROUP BY p.workspace_id, w.name`,
      salesWhere.values
    )

    const itemsWhere = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    itemsWhere.addOptional("p.workspace_id = ?", workspaceId)
    const itemsRows = await this.db.query<{ workspace_id: string; items_sold: string }>(
      `SELECT p.workspace_id, coalesce(sum(i.quantity),0) AS items_sold
       FROM pos_invoice_items i
       JOIN pos_invoices p ON p.id = i.invoice_id
       WHERE ${itemsWhere.where} AND p.status != 'cancelled'
       GROUP BY p.workspace_id`,
      itemsWhere.values
    )

    const branches = new Map<
      string,
      { workspaceName: string; totalSales: number; orderCount: number; itemsSold: number }
    >()
    const ensure = (id: string, name?: string) => {
      const existing = branches.get(id)
      if (existing) {
        if (name) existing.workspaceName = name
        return existing
      }
      const created = {
        workspaceName: name ?? "غير معروف",
        totalSales: 0,
        orderCount: 0,
        itemsSold: 0,
      }
      branches.set(id, created)
      return created
    }
    for (const row of salesRows.rows) {
      const branch = ensure(row.workspace_id, row.workspace_name)
      branch.totalSales = toNumber(row.total_sales)
      branch.orderCount = Number(row.order_count)
    }
    for (const row of itemsRows.rows) {
      ensure(row.workspace_id).itemsSold = toNumber(row.items_sold)
    }

    return [...branches.entries()]
      .map(([branchWorkspaceId, figures]) => ({
        workspaceId: branchWorkspaceId,
        workspaceName: figures.workspaceName,
        totalSales: figures.totalSales,
        orderCount: figures.orderCount,
        avgInvoiceValue: figures.orderCount > 0 ? figures.totalSales / figures.orderCount : 0,
        itemsSold: figures.itemsSold,
      }))
      .sort((left, right) => right.totalSales - left.totalSales)
  }

  // ---- POS summary (home dashboard) ----------------------------------------------------------

  async posSummaryTotals(
    range: ReadyReportRange
  ): Promise<{ invoiceCount: number; totalSales: number }> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    where.addOptional("workspace_id = ?", workspaceId)
    const result = await this.db.query<{ invoice_count: string; total_sales: string }>(
      `SELECT count(*) AS invoice_count, coalesce(sum(total_amount),0) AS total_sales
       FROM pos_invoices WHERE ${where.where} AND status != 'cancelled'`,
      where.values
    )
    const row = result.rows[0]
    return { invoiceCount: Number(row?.invoice_count ?? 0), totalSales: toNumber(row?.total_sales) }
  }

  // Same query shape as netIncomeTotals' own returns figure -- kept standalone here rather than
  // reusing netIncome() itself, since that also pulls in cogs/expenses and requires expenses:view,
  // neither of which the POS summary tab needs.
  async posSummaryReturns(range: ReadyReportRange): Promise<number> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    where.addOptional("workspace_id = ?", workspaceId)
    const result = await this.db.query<{ returns: string }>(
      `SELECT coalesce(sum(total_amount),0) AS returns FROM pos_invoice_returns WHERE ${where.where}`,
      where.values
    )
    return toNumber(result.rows[0]?.returns)
  }

  async posSummaryCustomerCount(range: ReadyReportRange): Promise<number> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    const result = await this.db.query<{ customer_count: string }>(
      `SELECT count(DISTINCT c.id) AS customer_count
       FROM pos_invoices p
       JOIN customers c ON c.id = p.customer_id
       WHERE ${where.where} AND p.status != 'cancelled'`,
      where.values
    )
    return Number(result.rows[0]?.customer_count ?? 0)
  }

  // Reads pos_invoice_payments directly (not pos_invoices.payment_method_code, which collapses a
  // split-tender sale into the literal string "split") -- the real per-method amounts always live
  // on the payment rows themselves, same reasoning invoices-service.ts's list() already documents.
  async posSummaryPaymentBreakdown(
    range: ReadyReportRange
  ): Promise<Array<{ paymentMethodCode: string; amount: number }>> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["p.organization_id = ?", organizationId],
      ["p.created_at >= ?", from],
      ["p.created_at < ?", to],
    ])
    where.addOptional("p.workspace_id = ?", workspaceId)
    const result = await this.db.query<{ payment_method_code: string; amount: string }>(
      `SELECT pay.payment_method_code, coalesce(sum(pay.amount),0) AS amount
       FROM pos_invoice_payments pay
       JOIN pos_invoices p ON p.id = pay.invoice_id
       WHERE ${where.where} AND p.status != 'cancelled'
       GROUP BY pay.payment_method_code
       ORDER BY amount DESC`,
      where.values
    )
    return result.rows.map((row) => ({
      paymentMethodCode: row.payment_method_code,
      amount: toNumber(row.amount),
    }))
  }

  // Always day-bucketed (unlike netIncomePeriods, which also supports week/month) -- the home
  // dashboard's sales-over-time chart is daily regardless of how wide the selected range is.
  async posSummaryDailyTrend(
    range: ReadyReportRange
  ): Promise<Array<{ date: string; totalSales: number }>> {
    const { organizationId, workspaceId, from, to } = range
    const where = new WhereBuilder([
      ["organization_id = ?", organizationId],
      ["created_at >= ?", from],
      ["created_at < ?", to],
    ])
    where.addOptional("workspace_id = ?", workspaceId)
    const result = await this.db.query<{ created_at: string; total_amount: string }>(
      `SELECT created_at, total_amount FROM pos_invoices WHERE ${where.where} AND status != 'cancelled'`,
      where.values
    )
    const buckets = new Map<string, number>()
    for (const row of result.rows) {
      const bucket = bucketKey(row.created_at, "day")
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + toNumber(row.total_amount))
    }
    return [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, totalSales]) => ({ date, totalSales }))
  }
}
