import { CheckCircle2 } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import {
  AdsMockup,
  AiChatMockup,
  InventoryMockup,
  InvoiceScanMockup,
  LiveVisitorsMockup,
  PosMockup,
} from "./mockups"

interface Showcase {
  eyebrow: string
  title: string
  description: string
  points: string[]
  visual: ReactNode
}

const SHOWCASES: Showcase[] = [
  {
    eyebrow: "نقطة البيع",
    title: "كاشير سريع ومتوافق، حتى لو انقطع الإنترنت",
    description:
      "بيع بالباركود أو البحث أو التصنيفات، واقبل الدفع بأكثر من طريقة في نفس الفاتورة. كل فاتورة إلكترونية برمز QR وفق متطلبات هيئة الزكاة.",
    points: [
      "الورديات: فتح وإغلاق وإيداع وسحب النقدية ومجاميع كل كاشير",
      "حسابات العملاء: البيع الآجل والرصيد المدفوع مسبقًا",
      "منتجات بالوزن والخيارات (مقاس ولون) والباقات",
      "المرتجعات والإشعارات الدائنة وطباعة الإيصالات",
    ],
    visual: <PosMockup />,
  },
  {
    eyebrow: "المتاجر الإلكترونية",
    title: "شاهد متجرك يتحرك الآن",
    description:
      "من يتصفح متجرك الآن، ومن أين جاء، ومن أضاف للسلة، ومن بدأ الدفع، ومن اشترى — لحظة بلحظة. ومدار يربط كل طلب بالإعلان الذي جاء منه.",
    points: [
      "ربط سلة وزد وشوبيفاي بضغطات",
      "مزامنة تلقائية للمنتجات والطلبات والعملاء بجدول تتحكم فيه",
      "خريطة مباشرة للزوار ومصادر الزيارات",
      "طلبات المتجر الإلكتروني ومبيعات المحل في مكان واحد",
    ],
    visual: <LiveVisitorsMockup />,
  },
  {
    eyebrow: "الحملات الإعلانية",
    title: "اعرف أي إعلان جاب لك مبيعات فعلًا",
    description:
      "بدل التنقل بين أربع لوحات إعلانية، شاهد الإنفاق والنقرات والعائد على الإنفاق الإعلاني لكل المنصات جنبًا إلى جنب، بجانب الطلبات الحقيقية من متجرك.",
    points: [
      "إعلانات جوجل وميتا (فيسبوك وإنستغرام) وسناب شات وتيك توك",
      "العائد على الإنفاق الإعلاني (ROAS) وتكلفة النقرة ونسبة النقر",
      "مقارنة الحملات والمنصات والأداء حسب هدف الحملة",
      "توصيات مبنية على بيانات أدائك أنت",
    ],
    visual: <AdsMockup />,
  },
  {
    eyebrow: "المشتريات بالذكاء الاصطناعي",
    title: "صوّر فاتورة المورد… ومدار يدخلها عنك",
    description:
      "ارفع فاتورة المورد (PDF أو صورة من جوالك، بالعربي أو الإنجليزي) ويقرأ مدار كل بند: المنتج والكمية والسعر والضريبة، ويطابقه مع منتجاتك.",
    points: [
      "يتعلم أكواد منتجات كل مورد، فالفاتورة التالية تتعبأ وحدها",
      "إنشاء المنتجات الناقصة من الفاتورة بضغطة",
      "أمر الشراء يضيف المخزون للفرع ويحدّث التكلفة",
      "سندات صرف وقبض للموردين ومرتجعات المشتريات",
    ],
    visual: <InvoiceScanMockup />,
  },
  {
    eyebrow: "المخزون والفروع",
    title: "كل فرع بمخزونه، والجرد بالباركود",
    description:
      "المبيعات والمشتريات والمرتجعات تحرك مخزون فرعها. حوّل البضاعة بين الفروع برقم مرجعي، واجرد بمسح الباركود وشاهد الفروقات وقيمتها فورًا.",
    points: [
      "مخزون مستقل لكل فرع وسجل كامل للتحويلات",
      "جرد بالمسح أو الإدخال، مع حفظ كمسودة واعتماد لاحق",
      "تنبيهات عند انخفاض المخزون أو نفاده",
      "قيمة المخزون لكل فرع",
    ],
    visual: <InventoryMockup />,
  },
  {
    eyebrow: "المساعد الذكي",
    title: "اسأل عن تجارتك… بالعربي",
    description:
      "بدل البحث في التقارير، اسأل المساعد الذكي سؤالك كما تقوله لموظفك، ويرد عليك بالأرقام والرسوم البيانية من بيانات كل تطبيقاتك.",
    points: [
      "«كم بعت أمس في فرع جدة؟»",
      "«أي حملة جابت أكثر طلبات هذا الأسبوع؟»",
      "يجيب من بيانات الكاشير والمتاجر والإعلانات معًا",
    ],
    visual: <AiChatMockup />,
  },
]

export function ShowcaseSection() {
  return (
    <section id="features" className="scroll-mt-20 overflow-hidden bg-white py-24 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-[#2878ff]">المزايا</p>
          <h2 className="mt-3 text-3xl leading-tight font-black text-[#0b1738] sm:text-[42px]">
            أدوات حقيقية لمشاكل يومية
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            كل ميزة في مدار جاءت من سؤال يسأله التاجر كل يوم.
          </p>
        </div>

        <div className="mt-20 space-y-24 sm:space-y-32">
          {SHOWCASES.map((showcase, index) => (
            <div key={showcase.title} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <div className={cn(index % 2 === 1 && "lg:order-2")}>
                <span className="inline-flex rounded-full bg-[#eef4ff] px-3.5 py-1 text-[13px] font-extrabold text-[#2878ff]">
                  {showcase.eyebrow}
                </span>
                <h3 className="mt-4 text-[28px] leading-snug font-black text-[#0b1738] sm:text-[34px]">
                  {showcase.title}
                </h3>
                <p className="mt-4 text-[17px] leading-8 text-slate-600">{showcase.description}</p>
                <ul className="mt-7 space-y-3.5">
                  {showcase.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-3 text-[15.5px] font-semibold text-[#0b1738]"
                    >
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#12b5a6]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute -inset-6 -z-10 rounded-[36px] bg-gradient-to-br from-[#e6f7f5] via-[#eef4ff] to-transparent"
                />
                {showcase.visual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
