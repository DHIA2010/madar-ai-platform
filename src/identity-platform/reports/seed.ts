import type { ReportsRepository } from "./repository"
import type { SaveCustomReportInput, SaveKpiInput } from "./types"

// The 8 ready-made reports every organization gets, one KPI each -- built from the exact same
// whitelisted catalog and engine a user's own custom report uses, just marked is_system so they
// show up read-only under "التقارير الجاهزة" instead of "التقارير المخصصة". "تقرير الماركات" is
// renamed "تقرير الفئات" (categories) since products only has a free-text category, no brand
// field; "تقرير الأرباح والخسائر" is an estimated revenue-minus-COGS margin, not real accounting
// P&L (this app has no expense ledger) -- both are called out in their own description text.
const SYSTEM_REPORTS: Array<{ kpi: SaveKpiInput; report: Omit<SaveCustomReportInput, "widgets"> }> =
  [
    {
      kpi: {
        name: "إجمالي المبيعات",
        description: "عرض تفاصيل المبيعات والإيرادات حسب الفترة الزمنية",
        category: "sales",
        dataSource: "sales",
        field: "total_revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "month",
        groupByDimension: null,
        compareEnabled: true,
        displayType: "line",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير المبيعات",
        description: "عرض تفاصيل المبيعات والإيرادات حسب الفترة الزمنية",
        category: "sales",
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: true },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "المنتجات الأكثر مبيعاً",
        description: "قائمة المنتجات الأكثر مبيعاً مع الكمية والإيرادات",
        category: "products",
        dataSource: "products",
        field: "revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: "product_name",
        compareEnabled: false,
        displayType: "table",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير المنتجات الأكثر مبيعاً",
        description: "قائمة المنتجات الأكثر مبيعاً مع الكمية والإيرادات",
        category: "products",
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: false },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "حالة المخزون",
        description: "حالة المخزون الحالية للمنتجات مصنفة حسب الفئة",
        category: "inventory",
        dataSource: "inventory",
        field: "stock_quantity",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: "category",
        compareEnabled: false,
        displayType: "table",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير المخزون",
        description: "حالة المخزون الحالية والتنبيهات للمنتجات منخفضة الكمية",
        category: "inventory",
        defaultFilters: {},
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: false },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "إنفاق العملاء",
        description: "تحليل العملاء، المشتريات والولاء",
        category: "customers",
        dataSource: "customers",
        field: "total_spend",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: "customer_name",
        compareEnabled: false,
        displayType: "table",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير العملاء",
        description: "تحليل العملاء، المشتريات والولاء",
        category: "customers",
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: false },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "هامش الربح (مقدّر)",
        description:
          "تحليل الإيرادات والتكلفة التقديرية للبضاعة المباعة -- تقدير وليس محاسبة فعلية",
        category: "financial",
        dataSource: "financial",
        field: "margin",
        aggregation: "sum",
        filters: [],
        timeGrouping: "month",
        groupByDimension: null,
        compareEnabled: true,
        displayType: "line",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير الأرباح والخسائر",
        description:
          "تحليل الإيرادات والتكاليف والهامش التقديري (مبني على تكلفة المنتجات، وليس محاسبة مصروفات فعلية)",
        category: "financial",
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: true },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "نشاط المبيعات اليومي",
        description: "نشاط المبيعات خلال اليوم",
        category: "sales",
        dataSource: "sales",
        field: "total_revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "day",
        groupByDimension: null,
        compareEnabled: true,
        displayType: "bar",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير الحركة اليومية",
        description: "نشاط المبيعات والمشتريات خلال اليوم",
        category: "sales",
        defaultFilters: { dateRange: "last_30_days" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: true },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "المبيعات حسب الفرع",
        description: "مقارنة أداء المبيعات بين الفروع",
        category: "sales",
        dataSource: "sales",
        field: "total_revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: "branch",
        compareEnabled: false,
        displayType: "bar",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير المبيعات حسب الفرع",
        description: "مقارنة أداء المبيعات بين الفروع",
        category: "sales",
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: false },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
    {
      kpi: {
        name: "المبيعات حسب الفئة",
        description: "تحليل أداء المبيعات حسب فئات المنتجات",
        category: "products",
        dataSource: "products",
        field: "revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: "category",
        compareEnabled: false,
        displayType: "pie",
        status: "active",
        workspaceId: null,
      },
      report: {
        name: "تقرير الفئات",
        description: "تحليل أداء المبيعات حسب فئات المنتجات",
        category: "products",
        defaultFilters: { dateRange: "last_12_months" },
        displayOptions: { showFilterBar: true, allowExport: true, showComparison: false },
        sharing: "organization",
        status: "active",
        workspaceId: null,
      },
    },
  ]

// Lazily seeds the 8 system reports the first time an organization asks for its ready-made
// reports tab -- self-healing (works for organizations created before this feature existed) and
// avoids needing a migration-time script that would have no organization rows to seed against.
export async function ensureSystemReportsSeeded(
  repository: ReportsRepository,
  organizationId: string,
  actorUserId: string
): Promise<void> {
  const existing = await repository.listCustomReports(organizationId, true)
  if (existing.length > 0) {
    return
  }

  for (const { kpi, report } of SYSTEM_REPORTS) {
    const savedKpi = await repository.createKpi(organizationId, actorUserId, kpi, true)
    await repository.createCustomReport(
      organizationId,
      actorUserId,
      { ...report, widgets: [{ kpiId: savedKpi.id, order: 0 }] },
      true
    )
  }
}
