import { LayoutGrid, Link2, Rocket } from "lucide-react"

const STEPS = [
  {
    icon: Rocket,
    title: "أنشئ حسابك",
    description:
      "سجّل في دقيقة بالبريد أو بحساب جوجل. وتجار سلة وزد يقدرون يثبتون مدار مباشرة من متجر التطبيقات.",
  },
  {
    icon: LayoutGrid,
    title: "فعّل ما تحتاجه",
    description:
      "اختر التطبيقات من متجر مدار: الكاشير أو المتاجر أو الإعلانات أو غيرها، وجرّب التطبيقات المدفوعة مجانًا ١٤ يوماً.",
  },
  {
    icon: Link2,
    title: "اربط وابدأ",
    description:
      "أضف فروعك ومنتجاتك، واربط متجرك ومنصاتك الإعلانية، وابدأ البيع ومتابعة أرقامك من أول يوم.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-24 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-[#2878ff]">كيف تبدأ</p>
          <h2 className="mt-3 text-3xl leading-tight font-black text-[#0b1738] sm:text-[42px]">
            جاهز خلال دقائق، بدون تعقيد
          </h2>
        </div>

        <ol className="relative mt-16 grid gap-6 md:grid-cols-3">
          <div
            aria-hidden
            className="absolute inset-x-[16%] top-10 hidden h-px bg-gradient-to-l from-transparent via-slate-300 to-transparent md:block"
          />
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-3xl border border-slate-200/80 bg-white p-8 text-center"
            >
              <span className="relative mx-auto flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#12b5a6] to-[#2563eb] text-white shadow-[0_16px_40px_-10px_rgba(37,99,235,0.55)]">
                <step.icon className="size-8" />
                <span className="absolute -top-2 -end-2 flex size-7 items-center justify-center rounded-full bg-[#0b1738] text-[13px] font-black text-white ring-4 ring-white">
                  {index + 1}
                </span>
              </span>
              <h3 className="mt-6 text-xl font-extrabold text-[#0b1738]">{step.title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-slate-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
