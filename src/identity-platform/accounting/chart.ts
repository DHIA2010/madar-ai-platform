// The chart of accounts every organization starts with: a compact one that suits a Saudi shop,
// restaurant or services business. The accounts with a `systemKey` are the ones the posting pass
// writes to (see postings.ts); the rest are there so a manual entry has somewhere sensible to go.
// An organization can rename, renumber and add to all of it.

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

// Where an account sits inside its type on the statements.
export const ACCOUNT_SECTIONS = [
  "current_asset",
  "fixed_asset",
  "current_liability",
  "long_term_liability",
  "equity",
  "revenue",
  "other_income",
  "cost_of_sales",
  "operating_expense",
] as const
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number]

export const SECTIONS_BY_TYPE: Record<AccountType, readonly AccountSection[]> = {
  asset: ["current_asset", "fixed_asset"],
  liability: ["current_liability", "long_term_liability"],
  equity: ["equity"],
  revenue: ["revenue", "other_income"],
  expense: ["cost_of_sales", "operating_expense"],
}

// Debits raise assets and expenses; credits raise liabilities, equity and revenue.
export const isDebitNormal = (type: AccountType) => type === "asset" || type === "expense"

// The accounts the posting pass needs to exist.
export const SYSTEM_ACCOUNT_KEYS = [
  "cash",
  "bank",
  "card_clearing",
  "receivable",
  "retention_receivable",
  "inventory",
  "vat_input",
  "payable",
  "vat_output",
  "customer_advances",
  "opening_equity",
  "sales",
  "sales_returns",
  "sales_discounts",
  "shipping_income",
  "cogs",
  "inventory_adjustments",
  "general_expenses",
  "rounding",
] as const
export type SystemAccountKey = (typeof SYSTEM_ACCOUNT_KEYS)[number]

export interface ChartAccount {
  code: string
  nameAr: string
  nameEn: string
  type: AccountType
  section: AccountSection
  systemKey?: SystemAccountKey
}

export const DEFAULT_CHART: ChartAccount[] = [
  // Assets
  {
    code: "1110",
    nameAr: "النقدية بالصندوق",
    nameEn: "Cash on hand",
    type: "asset",
    section: "current_asset",
    systemKey: "cash",
  },
  {
    code: "1120",
    nameAr: "البنك",
    nameEn: "Bank",
    type: "asset",
    section: "current_asset",
    systemKey: "bank",
  },
  {
    code: "1130",
    nameAr: "مدفوعات إلكترونية تحت التسوية",
    nameEn: "Card and e-payments in settlement",
    type: "asset",
    section: "current_asset",
    systemKey: "card_clearing",
  },
  {
    code: "1200",
    nameAr: "ذمم العملاء",
    nameEn: "Accounts receivable",
    type: "asset",
    section: "current_asset",
    systemKey: "receivable",
  },
  {
    code: "1250",
    nameAr: "محتجزات ضمان لدى العملاء",
    nameEn: "Retention receivable",
    type: "asset",
    section: "current_asset",
    systemKey: "retention_receivable",
  },
  {
    code: "1300",
    nameAr: "المخزون",
    nameEn: "Inventory",
    type: "asset",
    section: "current_asset",
    systemKey: "inventory",
  },
  {
    code: "1400",
    nameAr: "ضريبة القيمة المضافة على المشتريات",
    nameEn: "Input VAT",
    type: "asset",
    section: "current_asset",
    systemKey: "vat_input",
  },
  {
    code: "1450",
    nameAr: "مصروفات مدفوعة مقدمًا",
    nameEn: "Prepaid expenses",
    type: "asset",
    section: "current_asset",
  },
  {
    code: "1500",
    nameAr: "الأصول الثابتة",
    nameEn: "Fixed assets",
    type: "asset",
    section: "fixed_asset",
  },
  {
    code: "1590",
    nameAr: "مجمع الإهلاك",
    nameEn: "Accumulated depreciation",
    type: "asset",
    section: "fixed_asset",
  },
  // Liabilities
  {
    code: "2100",
    nameAr: "ذمم الموردين",
    nameEn: "Accounts payable",
    type: "liability",
    section: "current_liability",
    systemKey: "payable",
  },
  {
    code: "2200",
    nameAr: "ضريبة القيمة المضافة على المبيعات",
    nameEn: "Output VAT",
    type: "liability",
    section: "current_liability",
    systemKey: "vat_output",
  },
  {
    code: "2300",
    nameAr: "دفعات مقدمة من العملاء",
    nameEn: "Customer advances",
    type: "liability",
    section: "current_liability",
    systemKey: "customer_advances",
  },
  {
    code: "2400",
    nameAr: "رواتب ومستحقات الموظفين",
    nameEn: "Salaries payable",
    type: "liability",
    section: "current_liability",
  },
  {
    code: "2500",
    nameAr: "القروض",
    nameEn: "Loans",
    type: "liability",
    section: "long_term_liability",
  },
  // Equity
  {
    code: "3100",
    nameAr: "رأس المال",
    nameEn: "Owner's capital",
    type: "equity",
    section: "equity",
  },
  {
    code: "3200",
    nameAr: "مسحوبات المالك",
    nameEn: "Owner's drawings",
    type: "equity",
    section: "equity",
  },
  {
    code: "3300",
    nameAr: "الأرباح المبقاة",
    nameEn: "Retained earnings",
    type: "equity",
    section: "equity",
  },
  {
    code: "3900",
    nameAr: "الأرصدة الافتتاحية",
    nameEn: "Opening balances",
    type: "equity",
    section: "equity",
    systemKey: "opening_equity",
  },
  // Revenue
  {
    code: "4100",
    nameAr: "إيرادات المبيعات",
    nameEn: "Sales revenue",
    type: "revenue",
    section: "revenue",
    systemKey: "sales",
  },
  {
    code: "4200",
    nameAr: "مردودات المبيعات",
    nameEn: "Sales returns",
    type: "revenue",
    section: "revenue",
    systemKey: "sales_returns",
  },
  {
    code: "4300",
    nameAr: "خصومات المبيعات",
    nameEn: "Sales discounts",
    type: "revenue",
    section: "revenue",
    systemKey: "sales_discounts",
  },
  {
    code: "4400",
    nameAr: "إيرادات الشحن والتوصيل",
    nameEn: "Shipping income",
    type: "revenue",
    section: "revenue",
    systemKey: "shipping_income",
  },
  {
    code: "4900",
    nameAr: "إيرادات أخرى",
    nameEn: "Other income",
    type: "revenue",
    section: "other_income",
  },
  // Cost of sales
  {
    code: "5100",
    nameAr: "تكلفة البضاعة المباعة",
    nameEn: "Cost of goods sold",
    type: "expense",
    section: "cost_of_sales",
    systemKey: "cogs",
  },
  {
    code: "5200",
    nameAr: "تسويات المخزون",
    nameEn: "Inventory adjustments",
    type: "expense",
    section: "cost_of_sales",
    systemKey: "inventory_adjustments",
  },
  // Operating expenses
  {
    code: "6000",
    nameAr: "مصروفات عامة",
    nameEn: "General expenses",
    type: "expense",
    section: "operating_expense",
    systemKey: "general_expenses",
  },
  {
    code: "6100",
    nameAr: "الرواتب والأجور",
    nameEn: "Salaries and wages",
    type: "expense",
    section: "operating_expense",
  },
  {
    code: "6200",
    nameAr: "الإيجار",
    nameEn: "Rent",
    type: "expense",
    section: "operating_expense",
  },
  {
    code: "6300",
    nameAr: "الكهرباء والماء والاتصالات",
    nameEn: "Utilities and telecom",
    type: "expense",
    section: "operating_expense",
  },
  {
    code: "6400",
    nameAr: "التسويق والإعلان",
    nameEn: "Marketing and advertising",
    type: "expense",
    section: "operating_expense",
  },
  {
    code: "6500",
    nameAr: "الإهلاك",
    nameEn: "Depreciation",
    type: "expense",
    section: "operating_expense",
  },
  {
    code: "6600",
    nameAr: "رسوم بنكية ورسوم الدفع الإلكتروني",
    nameEn: "Bank and payment fees",
    type: "expense",
    section: "operating_expense",
  },
  {
    code: "6990",
    nameAr: "فروقات تقريب",
    nameEn: "Rounding differences",
    type: "expense",
    section: "operating_expense",
    systemKey: "rounding",
  },
]

// An expense category from the Expenses app gets its own account, so the income statement shows
// rent, salaries and the rest on their own lines. Its key ties it to the category for good.
export const expenseCategoryKey = (categoryId: string): `expense_category:${string}` =>
  `expense_category:${categoryId}`
export const EXPENSE_CATEGORY_CODE_START = 6700
