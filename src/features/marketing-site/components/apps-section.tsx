import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

import { APP_ICONS } from "./mockups"

interface AppCard {
  icon: keyof typeof APP_ICONS
  title: string
  description: string
  points: string[]
  tone: string
}

const APPS: AppCard[] = [
  {
    icon: "pos",
    title: "نقطة البيع (الكاشير)",
    description: "كاشير سريع لمحلك وفروعك، متوافق مع متطلبات الفوترة الإلكترونية.",
    points: [
      "فواتير إلكترونية برمز QR",
      "الورديات وطرق دفع متعددة",
      "يعمل حتى بدون إنترنت",
      "طباعة إيصالات حرارية",
    ],
    tone: "from-blue-500 to-indigo-600",
  },
  {
    icon: "ecommerce",
    title: "المتاجر الإلكترونية",
    description: "اربط سلة وزد وشوبيفاي وشاهد متجرك يتحرك مباشرة.",
    points: [
      "الزوار المباشرون على الخريطة",
      "مزامنة المنتجات والطلبات",
      "مصدر كل طلب وإعلانه",
      "طلبات المتجر والمحل في قائمة واحدة",
    ],
    tone: "from-teal-500 to-emerald-600",
  },
  {
    icon: "advertising",
    title: "الحملات الإعلانية",
    description: "جوجل وميتا وسناب شات وتيك توك في لوحة واحدة.",
    points: [
      "الإنفاق والنقرات والعائد (ROAS)",
      "مقارنة الحملات والمنصات",
      "اتجاهات يومية",
      "توصيات مبنية على أدائك",
    ],
    tone: "from-violet-500 to-purple-600",
  },
  {
    icon: "procurement",
    title: "الموردون والمشتريات",
    description: "أوامر الشراء والموردون والسندات، مع قراءة فواتير الموردين بالذكاء الاصطناعي.",
    points: [
      "صوّر الفاتورة ومدار يقرأها",
      "يتذكر أكواد كل مورد",
      "تحديث المخزون والتكلفة تلقائيًا",
      "مرتجعات المشتريات",
    ],
    tone: "from-amber-500 to-orange-600",
  },
  {
    icon: "inventory",
    title: "المخزون والفروع",
    description: "مخزون كل فرع واضح، والتحويل بين الفروع بضغطة.",
    points: [
      "مخزون مستقل لكل فرع",
      "تحويلات برقم مرجعي",
      "جرد بالباركود وفروقات فورية",
      "تنبيهات انخفاض المخزون",
    ],
    tone: "from-sky-500 to-blue-600",
  },
  {
    icon: "products",
    title: "المنتجات",
    description: "كتالوج واحد لمحلك ومتاجرك الإلكترونية.",
    points: [
      "منتجات بخيارات ووزن وباقات",
      "التصنيفات والوحدات والضرائب",
      "استيراد وتصدير CSV",
      "إخفاء تصنيفات من الكاشير",
    ],
    tone: "from-pink-500 to-rose-600",
  },
  {
    icon: "invoicing",
    title: "الفواتير وعروض الأسعار",
    description: "عروض أسعار وفواتير ضريبية للمنشآت، معتمدة من هيئة الزكاة.",
    points: [
      "عرض سعر يقبله العميل برابط",
      "فواتير ضريبية معتمدة (المرحلة الثانية)",
      "مستخلصات ودفعات مقدمة للمقاولات",
      "إشعارات دائنة ومدينة ومتابعة التحصيل",
    ],
    tone: "from-emerald-500 to-teal-600",
  },
  {
    icon: "promotions",
    title: "العروض الترويجية",
    description: "خصومات تُطبَّق تلقائيًا في الكاشير، على ما تختاره ومتى تختاره.",
    points: [
      "خصم بنسبة أو مبلغ ثابت",
      "على كل المنتجات أو منتجات وفئات محددة",
      "جدولة بالأيام والساعات لكل فرع",
      "يظهر العرض على الفاتورة",
    ],
    tone: "from-rose-500 to-red-600",
  },
  {
    icon: "expenses",
    title: "المصروفات",
    description: "سجّل مصروفات كل فرع وصنّفها، واعرف صافي ربحك.",
    points: ["تصنيف المصروفات حسب الفرع", "تقارير دورية", "صافي الدخل"],
    tone: "from-lime-500 to-green-600",
  },
  {
    icon: "reports",
    title: "التقارير",
    description: "تقارير جاهزة ومنشئ تقارير مخصص بدون جداول.",
    points: [
      "المبيعات حسب المنتج والفرع والكاشير",
      "إقرار ضريبة القيمة المضافة",
      "منشئ تقارير مخصص",
      "تصدير بضغطة",
    ],
    tone: "from-cyan-500 to-teal-600",
  },
  {
    icon: "ai",
    title: "المساعد الذكي",
    description: "اسأل عن تجارتك بالعربي، واحصل على الإجابة مع الرسوم.",
    points: ["«كم بعت أمس في فرع جدة؟»", "يعمل عبر كل تطبيقاتك", "إجابات مع رسوم بيانية"],
    tone: "from-indigo-500 to-fuchsia-600",
  },
]

export function AppsSection() {
  return (
    <section id="product" className="scroll-mt-20 bg-[#f7f9fc] py-24 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-[#2878ff]">الحلول</p>
          <h2 className="mt-3 text-3xl leading-tight font-black text-[#0b1738] sm:text-[42px]">
            تطبيقات تغطي تجارتك من أولها لآخرها
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            فعّل التطبيقات التي تحتاجها فقط وادفع على قدّها، أو احصل عليها كلها في اشتراك واحد مع
            «مدار الكامل».
          </p>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {APPS.map((app) => {
            const Icon = APP_ICONS[app.icon]
            return (
              <article
                key={app.title}
                className="group relative flex flex-col rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(11,23,56,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_24px_60px_-20px_rgba(11,23,56,0.25)]"
              >
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
                    app.tone
                  )}
                >
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-5 text-xl font-extrabold text-[#0b1738]">{app.title}</h3>
                <p className="mt-2 text-[15px] leading-7 text-slate-600">{app.description}</p>
                <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
                  {app.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2.5 text-[14.5px] font-semibold text-[#0b1738]"
                    >
                      <Check className="mt-1 size-4 shrink-0 text-[#12b5a6]" strokeWidth={3} />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
