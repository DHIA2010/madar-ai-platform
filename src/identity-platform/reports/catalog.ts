import type { ReportAggregation, ReportFilterOperator } from "./types"

// The whitelisted catalog every KPI is validated and compiled against -- table/column names in
// every generated query come ONLY from this file, never from user input. A KPI's `dataSource`,
// `field`, `filters[].field`, and `groupByDimension` are each checked against these definitions
// before query-builder.ts is allowed to touch them; only filter VALUES are ever parameterized
// from user input. This is what keeps a user-authored KPI from ever becoming arbitrary SQL.
export interface CatalogField {
  key: string
  label: string
  sqlExpr: string
  allowedAggregations: ReportAggregation[]
}

export interface CatalogDimension {
  key: string
  label: string
  sqlExpr: string
}

export interface CatalogFilterField {
  key: string
  label: string
  sqlExpr: string
  allowedOperators: ReportFilterOperator[]
}

export interface CatalogDataSource {
  key: string
  label: string
  category: string
  // FROM ... [JOIN ...] -- always ends with the joins needed for org scope, the date column, and
  // every dimension/filter this data source declares.
  fromClause: string
  orgScopeExpr: string
  workspaceScopeExpr: string | null
  dateExpr: string | null
  fields: CatalogField[]
  dimensions: CatalogDimension[]
  filterFields: CatalogFilterField[]
}

export const REPORT_CATEGORIES = [
  { key: "sales", label: "المبيعات" },
  { key: "products", label: "المنتجات" },
  { key: "inventory", label: "المخزون" },
  { key: "customers", label: "العملاء" },
  { key: "financial", label: "المالية" },
  { key: "marketing", label: "التسويق" },
] as const

const SUM_AVG: ReportAggregation[] = ["sum", "avg"]
const COUNT_ONLY: ReportAggregation[] = ["count"]

export const REPORT_CATALOG: CatalogDataSource[] = [
  {
    key: "sales",
    label: "المبيعات",
    category: "sales",
    fromClause: "pos_invoices p left join workspaces w on w.id = p.workspace_id",
    orgScopeExpr: "p.organization_id",
    workspaceScopeExpr: "p.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "total_revenue",
        label: "إجمالي المبيعات",
        sqlExpr: "p.total_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "subtotal",
        label: "المبيعات قبل الضريبة",
        sqlExpr: "p.subtotal_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "discount",
        label: "الخصومات",
        sqlExpr: "p.discount_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "tax",
        label: "الضريبة المحصلة",
        sqlExpr: "p.tax_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "invoice_count",
        label: "عدد الفواتير",
        sqlExpr: "p.id",
        allowedAggregations: COUNT_ONLY,
      },
    ],
    dimensions: [
      { key: "payment_method", label: "طريقة الدفع", sqlExpr: "p.payment_method_code" },
      { key: "status", label: "حالة الفاتورة", sqlExpr: "p.status" },
      { key: "branch", label: "الفرع", sqlExpr: "coalesce(w.name, 'غير محدد')" },
    ],
    filterFields: [
      {
        key: "status",
        label: "حالة الفاتورة",
        sqlExpr: "p.status",
        allowedOperators: ["eq", "neq"],
      },
      {
        key: "payment_method",
        label: "طريقة الدفع",
        sqlExpr: "p.payment_method_code",
        allowedOperators: ["eq", "neq"],
      },
    ],
  },
  {
    key: "products",
    label: "المنتجات",
    category: "products",
    fromClause:
      "pos_invoice_items i join pos_invoices p on p.id = i.invoice_id left join products pr on pr.id::text = i.product_id",
    orgScopeExpr: "p.organization_id",
    workspaceScopeExpr: "p.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "quantity_sold",
        label: "الكمية المباعة",
        sqlExpr: "i.quantity",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "revenue",
        label: "إيرادات المنتج",
        sqlExpr: "i.line_total",
        allowedAggregations: SUM_AVG,
      },
    ],
    dimensions: [
      { key: "product_name", label: "المنتج", sqlExpr: "i.product_name" },
      { key: "category", label: "الفئة", sqlExpr: "coalesce(pr.category, 'غير مصنف')" },
    ],
    filterFields: [
      {
        key: "product_name",
        label: "اسم المنتج",
        sqlExpr: "i.product_name",
        allowedOperators: ["eq", "neq", "contains", "not_contains"],
      },
      {
        key: "category",
        label: "الفئة",
        sqlExpr: "coalesce(pr.category, 'غير مصنف')",
        allowedOperators: ["eq", "neq", "contains", "not_contains"],
      },
    ],
  },
  {
    key: "inventory",
    label: "المخزون",
    category: "inventory",
    fromClause: "products pr",
    orgScopeExpr: "pr.organization_id",
    workspaceScopeExpr: "pr.workspace_id",
    dateExpr: "pr.created_at",
    fields: [
      {
        key: "stock_quantity",
        label: "الكمية في المخزون",
        sqlExpr: "pr.stock_quantity",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "product_count",
        label: "عدد المنتجات",
        sqlExpr: "pr.id",
        allowedAggregations: COUNT_ONLY,
      },
    ],
    dimensions: [{ key: "category", label: "الفئة", sqlExpr: "pr.category" }],
    filterFields: [
      {
        key: "category",
        label: "الفئة",
        sqlExpr: "pr.category",
        allowedOperators: ["eq", "neq", "contains", "not_contains"],
      },
      { key: "status", label: "الحالة", sqlExpr: "pr.status", allowedOperators: ["eq", "neq"] },
    ],
  },
  {
    key: "customers",
    label: "العملاء",
    category: "customers",
    fromClause: "customers c left join pos_invoices p on p.customer_id = c.id",
    orgScopeExpr: "c.organization_id",
    workspaceScopeExpr: "c.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "total_spend",
        label: "إجمالي إنفاق العملاء",
        sqlExpr: "p.total_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "visit_count",
        label: "عدد الزيارات",
        sqlExpr: "p.id",
        allowedAggregations: COUNT_ONLY,
      },
    ],
    dimensions: [{ key: "customer_name", label: "العميل", sqlExpr: "c.name" }],
    filterFields: [
      {
        key: "customer_name",
        label: "اسم العميل",
        sqlExpr: "c.name",
        allowedOperators: ["eq", "neq", "contains", "not_contains"],
      },
    ],
  },
  {
    key: "financial",
    label: "المالية",
    category: "financial",
    fromClause: "pos_invoices p left join workspaces w on w.id = p.workspace_id",
    orgScopeExpr: "p.organization_id",
    workspaceScopeExpr: "p.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "revenue",
        label: "الإيرادات",
        sqlExpr: "p.total_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "tax_collected",
        label: "الضريبة المحصلة",
        sqlExpr: "p.tax_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "discounts_given",
        label: "الخصومات الممنوحة",
        sqlExpr: "p.discount_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "margin",
        // Revenue minus estimated cost of goods sold (line item quantity * the product's current
        // cost_price) -- an estimate from real sales/cost data, not true accounting P&L (no
        // expense ledger exists in this app), which is why this is labeled "مقدّر" (estimated).
        label: "هامش الربح (مقدّر)",
        sqlExpr: `(p.total_amount - coalesce((
          select sum(i.quantity * coalesce(pr.cost_price, 0))
          from pos_invoice_items i
          left join products pr on pr.id::text = i.product_id
          where i.invoice_id = p.id
        ), 0))`,
        allowedAggregations: SUM_AVG,
      },
    ],
    dimensions: [{ key: "branch", label: "الفرع", sqlExpr: "coalesce(w.name, 'غير محدد')" }],
    filterFields: [
      {
        key: "status",
        label: "حالة الفاتورة",
        sqlExpr: "p.status",
        allowedOperators: ["eq", "neq"],
      },
    ],
  },
  {
    key: "marketing",
    label: "التسويق",
    category: "marketing",
    // Google Ads only in v1 -- the one connected ad platform with clean structured metric
    // columns; Meta/TikTok/Snapchat store metrics inside a jsonb payload per sync run and are a
    // natural fast-follow rather than part of this SQL-aggregatable catalog.
    fromClause:
      "google_ads_daily_metrics m join google_oauth_connections gc on gc.id = m.connection_id",
    orgScopeExpr: "gc.organization_id",
    workspaceScopeExpr: "gc.workspace_id",
    dateExpr: "m.metric_date",
    fields: [
      {
        key: "impressions",
        label: "مرات الظهور",
        sqlExpr: "m.impressions",
        allowedAggregations: SUM_AVG,
      },
      { key: "clicks", label: "النقرات", sqlExpr: "m.clicks", allowedAggregations: SUM_AVG },
      {
        key: "spend",
        label: "الإنفاق الإعلاني",
        sqlExpr: "(m.cost_micros / 1000000.0)",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "conversions",
        label: "التحويلات",
        sqlExpr: "m.conversions",
        allowedAggregations: SUM_AVG,
      },
    ],
    dimensions: [{ key: "campaign", label: "الحملة", sqlExpr: "m.campaign_id" }],
    filterFields: [],
  },
]

export function findDataSource(key: string): CatalogDataSource | undefined {
  return REPORT_CATALOG.find((source) => source.key === key)
}

export function findField(dataSource: CatalogDataSource, key: string): CatalogField | undefined {
  return dataSource.fields.find((field) => field.key === key)
}

export function findDimension(
  dataSource: CatalogDataSource,
  key: string
): CatalogDimension | undefined {
  return dataSource.dimensions.find((dimension) => dimension.key === key)
}

export function findFilterField(
  dataSource: CatalogDataSource,
  key: string
): CatalogFilterField | undefined {
  return dataSource.filterFields.find((filterField) => filterField.key === key)
}

const AGGREGATION_SQL: Record<ReportAggregation, string> = {
  sum: "sum",
  avg: "avg",
  count: "count",
  min: "min",
  max: "max",
}

export function aggregationSqlFn(aggregation: ReportAggregation): string {
  return AGGREGATION_SQL[aggregation]
}
