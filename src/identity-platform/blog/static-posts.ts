// The articles written in the website's code (src/features/marketing-site/blog/posts.ts), so the
// blog agent knows what's already covered. The backend can't import the website's files; a test
// keeps this list in step with posts.ts.
export const STATIC_BLOG_POSTS: Array<{ slug: string; title: string; category: string }> = [
  {
    slug: "know-which-ad-really-sells",
    title: "كيف تعرف أي إعلان يجيب لك مبيعات فعلًا؟ دليل التاجر لقياس العائد على الإنفاق الإعلاني",
    category: "campaigns",
  },
  {
    slug: "e-invoicing-saudi-merchants-guide",
    title: "الفوترة الإلكترونية في السعودية: دليل مبسّط لأصحاب المتاجر والمحلات",
    category: "invoicing",
  },
  {
    slug: "stock-take-without-mistakes",
    title: "جرد المخزون بدون أخطاء: خطوات عملية لمتجرك وفروعك",
    category: "inventory",
  },
  {
    slug: "utm-tags-guide",
    title: "وسوم UTM: الطريقة الأسهل لتعرف من أين جاء كل عميل",
    category: "campaigns",
  },
  {
    slug: "vat-return-preparation",
    title: "إقرار ضريبة القيمة المضافة: كيف تجهّز أرقامك بدون توتر آخر الفترة",
    category: "invoicing",
  },
  {
    slug: "five-numbers-every-store-owner-should-watch",
    title: "خمسة أرقام لازم تتابعها في متجرك الإلكتروني كل أسبوع",
    category: "ecommerce",
  },
  {
    slug: "reduce-abandoned-carts",
    title: "السلات المتروكة: لماذا يترك العميل السلة وكيف تقلل ذلك",
    category: "ecommerce",
  },
  {
    slug: "stock-transfers-between-branches",
    title: "تحويل المخزون بين الفروع: كيف تنظّمه بدون فوضى",
    category: "inventory",
  },
]
