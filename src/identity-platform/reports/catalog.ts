import type { CatalogApplication, ReportAggregation, ReportFilterOperator } from "./types"

export type { CatalogApplication }

// The whitelisted catalog every KPI is validated and compiled against -- table/column names in
// every generated query come ONLY from this file, never from user input. A KPI's `dataSource`,
// `field`, `filters[].field`, and `groupByDimension` are each checked against these definitions
// before query-builder.ts is allowed to touch them; only filter VALUES are ever parameterized
// from user input. This is what keeps a user-authored KPI from ever becoming arbitrary SQL.
//
// `description` is this catalog's answer to the Genie-upgrade audit's "Semantic Layer" gap: the
// same "formula / business meaning" text campaigns/metric-definitions.ts already has for
// advertising, generalized to every data source instead of being advertising-only. The AI must
// state this text when asked how a metric is calculated, never invent one from memory.
export interface CatalogField {
  key: string
  label: string
  description: string
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
  // Which activated application this data source belongs to -- lets the generic query tools
  // (ai-chat/tools.ts) filter the catalog down to the session's own single category, the same
  // server-side enforcement mechanism buildToolsForCategory already relies on for the hand-written
  // tools. Never trust the LLM to only ask about its own category's data sources.
  application: CatalogApplication
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
    application: "pos",
    fromClause: "pos_invoices p left join workspaces w on w.id = p.workspace_id",
    orgScopeExpr: "p.organization_id",
    workspaceScopeExpr: "p.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "total_revenue",
        label: "إجمالي المبيعات",
        description: "إجمالي قيمة الفواتير (شامل الضريبة، بعد الخصومات) بغض النظر عن حالتها.",
        sqlExpr: "p.total_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "subtotal",
        label: "المبيعات قبل الضريبة",
        description: "إجمالي قيمة الفواتير قبل إضافة الضريبة.",
        sqlExpr: "p.subtotal_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "discount",
        label: "الخصومات",
        description: "إجمالي قيمة الخصومات الممنوحة على الفواتير.",
        sqlExpr: "p.discount_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "tax",
        label: "الضريبة المحصلة",
        description: "إجمالي الضريبة المحصلة على الفواتير.",
        sqlExpr: "p.tax_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "invoice_count",
        label: "عدد الفواتير",
        description: "عدد الفواتير، بغض النظر عن حالتها (ما لم يُطبّق فلتر status).",
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
    application: "pos",
    fromClause:
      "pos_invoice_items i join pos_invoices p on p.id = i.invoice_id left join products pr on pr.id::text = i.product_id",
    orgScopeExpr: "p.organization_id",
    workspaceScopeExpr: "p.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "quantity_sold",
        label: "الكمية المباعة",
        description: "إجمالي الكمية المباعة لكل سطر فاتورة.",
        sqlExpr: "i.quantity",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "revenue",
        label: "إيرادات المنتج",
        description: "إجمالي قيمة المبيعات لكل سطر فاتورة (الكمية × سعر الوحدة).",
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
    application: "pos",
    fromClause: "products pr",
    orgScopeExpr: "pr.organization_id",
    workspaceScopeExpr: "pr.workspace_id",
    dateExpr: "pr.created_at",
    fields: [
      {
        key: "stock_quantity",
        label: "الكمية في المخزون",
        description: "الكمية الحالية المتوفرة في المخزون لكل منتج (ليست تاريخية).",
        sqlExpr: "pr.stock_quantity",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "product_count",
        label: "عدد المنتجات",
        description: "عدد المنتجات المسجّلة في الكتالوج.",
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
    application: "pos",
    fromClause: "customers c left join pos_invoices p on p.customer_id = c.id",
    orgScopeExpr: "c.organization_id",
    workspaceScopeExpr: "c.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "total_spend",
        label: "إجمالي إنفاق العملاء",
        description: "إجمالي قيمة الفواتير المرتبطة بالعميل.",
        sqlExpr: "p.total_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "visit_count",
        label: "عدد الزيارات",
        description: "عدد الفواتير المرتبطة بالعميل (كمؤشر على عدد مرات الشراء).",
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
    application: "pos",
    fromClause: "pos_invoices p left join workspaces w on w.id = p.workspace_id",
    orgScopeExpr: "p.organization_id",
    workspaceScopeExpr: "p.workspace_id",
    dateExpr: "p.created_at",
    fields: [
      {
        key: "revenue",
        label: "الإيرادات",
        description: "إجمالي قيمة الفواتير (شامل الضريبة، بعد الخصومات).",
        sqlExpr: "p.total_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "tax_collected",
        label: "الضريبة المحصلة",
        description: "إجمالي الضريبة المحصلة على الفواتير.",
        sqlExpr: "p.tax_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "discounts_given",
        label: "الخصومات الممنوحة",
        description: "إجمالي قيمة الخصومات الممنوحة على الفواتير.",
        sqlExpr: "p.discount_amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "margin",
        // Revenue minus estimated cost of goods sold (line item quantity * the product's current
        // cost_price) -- an estimate from real sales/cost data, not true accounting P&L (no
        // expense ledger exists in this app), which is why this is labeled "مقدّر" (estimated).
        label: "هامش الربح (مقدّر)",
        description:
          "تقدير للهامش: قيمة الفاتورة ناقص تكلفة البضاعة المباعة المقدّرة (الكمية × سعر التكلفة الحالي للمنتج). ليس ربحًا محاسبيًا دقيقًا -- لا يوجد دفتر مصروفات في النظام.",
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
    application: "advertising",
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
        description: "عدد مرات ظهور الإعلان (من بيانات Google Ads المتزامنة).",
        sqlExpr: "m.impressions",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "clicks",
        label: "النقرات",
        description: "عدد النقرات على الإعلان (من بيانات Google Ads المتزامنة).",
        sqlExpr: "m.clicks",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "spend",
        label: "الإنفاق الإعلاني",
        description: "إجمالي المبلغ المنفق على الإعلانات في Google Ads خلال الفترة المحددة.",
        sqlExpr: "(m.cost_micros / 1000000.0)",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "conversions",
        label: "التحويلات",
        description: "عدد التحويلات المنسوبة للإعلان حسب نافذة الإسناد الخاصة بـ Google Ads.",
        sqlExpr: "m.conversions",
        allowedAggregations: SUM_AVG,
      },
    ],
    dimensions: [{ key: "campaign", label: "الحملة", sqlExpr: "m.campaign_id" }],
    filterFields: [],
  },
  {
    key: "orders",
    label: "الطلبات",
    category: "sales",
    application: "ecommerce",
    // Unions the three connected e-commerce providers (Salla/Shopify/Zid) into one normalized
    // projection -- each provider stores orders as a jsonb payload with a different shape (see
    // orders/service.ts's normalizeSallaOrder/normalizeShopifyOrder/normalizeZidOrder, the
    // existing, already-tested source of truth for these exact field paths; this reproduces only
    // the handful of fields that map cleanly to flat SQL expressions -- amount/date/platform/
    // customer name/raw status text -- deliberately NOT the bucketed orderStatus/paymentStatus
    // those functions compute in JS, since reimplementing that branching in SQL would be a second,
    // divergence-prone copy of the same business rule). `status_text` is each provider's own raw
    // status string, not a unified bucket -- grouping by it mixes platform-specific vocabulary,
    // which is the honest tradeoff for not duplicating orderStatus's bucketing logic here.
    fromClause: `(
      select
        'Salla' as platform, o.connection_id, c.organization_id, c.workspace_id,
        o.record_date, o.entity_id,
        (o.payload -> 'total' ->> 'amount')::numeric as amount,
        coalesce(o.payload -> 'status' ->> 'name', o.payload -> 'status' ->> 'slug', '') as status_text,
        coalesce(o.payload -> 'customer' ->> 'full_name', '') as customer_name
      from salla_records o
      join salla_oauth_connections c on c.id = o.connection_id
      where o.entity_type = 'orders' and c.deleted_at is null and c.status = 'connected'
      union all
      select
        'Shopify' as platform, o.connection_id, c.organization_id, c.workspace_id,
        o.record_date, o.entity_id,
        (o.payload ->> 'total_price')::numeric as amount,
        coalesce(o.payload ->> 'fulfillment_status', o.payload ->> 'financial_status', '') as status_text,
        (coalesce(o.payload -> 'customer' ->> 'first_name', '') || ' ' || coalesce(o.payload -> 'customer' ->> 'last_name', '')) as customer_name
      from shopify_records o
      join shopify_oauth_connections c on c.id = o.connection_id
      where o.entity_type = 'orders' and c.deleted_at is null and c.status = 'connected'
      union all
      select
        'Zid' as platform, o.connection_id, c.organization_id, c.workspace_id,
        o.record_date, o.entity_id,
        (o.payload ->> 'order_total')::numeric as amount,
        coalesce(o.payload -> 'order_status' ->> 'name', o.payload -> 'order_status' ->> 'code', '') as status_text,
        coalesce(o.payload -> 'customer' ->> 'name', '') as customer_name
      from zid_records o
      join zid_oauth_connections c on c.id = o.connection_id
      where o.entity_type = 'orders' and c.deleted_at is null and c.status = 'connected'
    ) o`,
    orgScopeExpr: "o.organization_id",
    workspaceScopeExpr: "o.workspace_id",
    dateExpr: "o.record_date",
    fields: [
      {
        key: "revenue",
        label: "إيرادات الطلبات",
        description:
          "إجمالي قيمة الطلبات من جميع المتاجر الإلكترونية المتصلة (Salla/Shopify/Zid)، كما وردت من كل منصة.",
        sqlExpr: "o.amount",
        allowedAggregations: SUM_AVG,
      },
      {
        key: "order_count",
        label: "عدد الطلبات",
        description: "عدد الطلبات من جميع المتاجر الإلكترونية المتصلة.",
        sqlExpr: "o.entity_id",
        allowedAggregations: COUNT_ONLY,
      },
    ],
    dimensions: [
      { key: "platform", label: "المنصة", sqlExpr: "o.platform" },
      { key: "status", label: "الحالة (كما وردت من المنصة)", sqlExpr: "o.status_text" },
      { key: "customer_name", label: "العميل", sqlExpr: "o.customer_name" },
    ],
    filterFields: [
      { key: "platform", label: "المنصة", sqlExpr: "o.platform", allowedOperators: ["eq", "neq"] },
      {
        key: "status",
        label: "الحالة",
        sqlExpr: "o.status_text",
        allowedOperators: ["eq", "neq", "contains"],
      },
    ],
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
