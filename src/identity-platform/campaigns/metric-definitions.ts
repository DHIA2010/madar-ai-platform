// Single source of truth for "how is this metric calculated and where does it come from" -- so
// every part of the system (tool descriptions, the LLM's answers when asked "how is ROAS
// calculated?", future UI tooltips) states the exact same formula instead of each place
// describing it slightly differently. The formulas themselves are not re-implemented here --
// they're already implemented once, in analytics-engine.ts's snapshotFromSummary/snapshotFromRow
// and campaigns/performance-service.ts's finalizeRow -- this registry is documentation of what
// that code already does, not a second implementation of it.
export interface MetricDefinition {
  key: string
  name: string
  description: string
  formula: string
  source: string
  nullHandling: string
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "spend",
    name: "الإنفاق الإعلاني (Spend)",
    description: "إجمالي المبلغ المنفق على الإعلانات في الفترة المحددة.",
    formula: "مجموع الإنفاق الفعلي من كل منصة إعلانية متصلة (Google/Meta/TikTok/Snapchat).",
    source: "campaigns/performance-service.ts (بيانات مزامنة حقيقية لكل منصة)",
    nullHandling: "لا توجد بيانات = 0، وليس قيمة مفقودة أو تقديرية.",
  },
  {
    key: "revenue",
    name: "الإيرادات المنسوبة (Revenue)",
    description: "إجمالي الإيرادات المنسوبة للإعلانات حسب نافذة الإسناد الخاصة بكل منصة.",
    formula: "مجموع قيمة التحويلات المنسوبة من كل منصة إعلانية.",
    source: "campaigns/performance-service.ts",
    nullHandling: "لا توجد تحويلات منسوبة = 0.",
  },
  {
    key: "roas",
    name: "العائد على الإنفاق الإعلاني (ROAS)",
    description: "كم ريال إيراد تم تحقيقه مقابل كل ريال إنفاق إعلاني.",
    formula: "الإيرادات ÷ الإنفاق",
    source: "محسوب من spend و revenue أعلاه.",
    nullHandling: "عند الإنفاق = 0: تُعرض القيمة كـ 0 (وليست لانهاية أو خطأ).",
  },
  {
    key: "cpa",
    name: "تكلفة الاكتساب (CPA)",
    description: "متوسط تكلفة الحصول على تحويل واحد.",
    formula: "الإنفاق ÷ عدد التحويلات",
    source: "محسوب من spend و conversions.",
    nullHandling: "عند عدد التحويلات = 0: تُعرض القيمة كـ 0، وتُذكر صراحة قلة/انعدام التحويلات.",
  },
  {
    key: "ctr",
    name: "معدل النقر إلى الظهور (CTR)",
    description: "نسبة من شاهد الإعلان ثم نقر عليه.",
    formula: "(النقرات ÷ مرات الظهور) × 100",
    source: "محسوب من clicks و impressions.",
    nullHandling: "عند مرات الظهور = 0: تُعرض القيمة كـ 0.",
  },
  {
    key: "cpc",
    name: "تكلفة النقرة (CPC)",
    description: "متوسط تكلفة كل نقرة على الإعلان.",
    formula: "الإنفاق ÷ النقرات",
    source:
      "مشتق من spend و clicks (غير متوفر مباشرة في ملخص الحساب الإجمالي، يُحسب عند كل استعلام).",
    nullHandling: "عند النقرات = 0: تُعرض القيمة كـ 0.",
  },
  {
    key: "cpm",
    name: "تكلفة الألف ظهور (CPM)",
    description: "متوسط تكلفة كل 1000 مرة ظهور للإعلان.",
    formula: "(الإنفاق ÷ مرات الظهور) × 1000",
    source:
      "مشتق من spend و impressions (غير متوفر مباشرة في ملخص الحساب الإجمالي، يُحسب عند كل استعلام).",
    nullHandling: "عند مرات الظهور = 0: تُعرض القيمة كـ 0.",
  },
  {
    key: "conversionRate",
    name: "معدل التحويل (Conversion Rate)",
    description: "نسبة النقرات التي أدت إلى تحويل.",
    formula: "(عدد التحويلات ÷ النقرات) × 100",
    source: "محسوب من conversions و clicks.",
    nullHandling: "عند النقرات = 0: تُعرض القيمة كـ 0.",
  },
  {
    key: "activeCampaigns",
    name: "عدد الحملات النشطة",
    description: "عدد الحملات ذات حالة نشطة (Active) خلال الفترة المحددة.",
    formula: "عدّ مباشر لحالة الحملة من بيانات المنصة.",
    source: "campaigns/performance-service.ts",
    nullHandling: "لا يوجد — يُعرض 0 إذا لم توجد حملات نشطة.",
  },
]

export const UNAVAILABLE_METRICS_NOTE =
  "غير متوفر حاليًا في بيانات مدار: Reach (الوصول)، Frequency (التكرار)، AOV على مستوى الإعلانات، CAC، بيانات الجمهور/الموقع الجغرافي/نوع الجهاز/الإبداع الإعلاني، ونوافذ الإسناد المخصصة. لا تخترع قيمة لأي منها -- صرّح بأنها غير متوفرة."
