import { Building2, Languages, Layers, Lock, ReceiptText, Users } from "lucide-react"

const REASONS = [
  {
    icon: Layers,
    title: "نظام واحد بدل خمسة",
    description:
      "الكاشير وتحليلات المتجر والإعلانات والمشتريات والمخزون والتقارير بدخول واحد واشتراك واحد.",
  },
  {
    icon: ReceiptText,
    title: "مصمم للسوق السعودي",
    description:
      "متوافق مع متطلبات الفوترة الإلكترونية (هيئة الزكاة)، وتقرير إقرار ضريبة القيمة المضافة، والريال السعودي، والدفع بمدى.",
  },
  {
    icon: Languages,
    title: "عربي أولًا",
    description: "واجهة عربية بالكامل، ومساعد ذكي يفهم أسئلتك باللهجة اليومية، مع دعم الإنجليزية.",
  },
  {
    icon: Building2,
    title: "فروع ومنشآت متعددة",
    description: "أدِر أكثر من فرع، وكل فرع بإعداداته ومخزونه وأجهزته وطرق دفعه.",
  },
  {
    icon: Users,
    title: "فريقك بصلاحيات",
    description: "أضف موظفيك وحدد لكل دور ما يقدر يشوفه ويعدّله.",
  },
  {
    icon: Lock,
    title: "بياناتك محمية",
    description: "اتصال مشفر، وبيانات كل منشأة معزولة عن غيرها، ولا نصل لمنصاتك إلا بموافقتك.",
  },
]

export function WhyMadarSection() {
  return (
    <section className="bg-[#f7f9fc] py-24 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.4fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-extrabold text-[#2878ff]">لماذا مدار</p>
            <h2 className="mt-3 text-3xl leading-tight font-black text-[#0b1738] sm:text-[42px]">
              صُنع للتاجر السعودي، من أول فاتورة لآخر تقرير
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              سواء عندك محل واحد أو سلسلة فروع، أو متجر على سلة أو زد، أو تبيع في الاثنين — مدار
              يجمع كل شيء في مكان واحد ويعطيك الصورة كاملة.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {REASONS.map((reason) => (
              <div
                key={reason.title}
                className="rounded-3xl border border-slate-200/80 bg-white p-7 transition-shadow hover:shadow-[0_20px_50px_-24px_rgba(11,23,56,0.3)]"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2878ff]">
                  <reason.icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-[#0b1738]">{reason.title}</h3>
                <p className="mt-2 text-[15px] leading-7 text-slate-600">{reason.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
