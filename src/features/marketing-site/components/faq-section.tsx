import { Plus } from "lucide-react"

const FAQS = [
  {
    question: "ما هو مدار؟",
    answer:
      "مدار منصة سحابية سعودية تجمع الكاشير، وتحليلات المتجر الإلكتروني، والحملات الإعلانية، والمشتريات، والمخزون، والمصروفات، والتقارير، ومساعدًا ذكيًا — في نظام واحد باللغة العربية.",
  },
  {
    question: "هل أحتاج لتثبيت برامج أو أجهزة خاصة؟",
    answer:
      "لا. مدار يعمل من المتصفح على الكمبيوتر أو الجهاز اللوحي أو الجوال، ويدعم طابعات الإيصالات الحرارية وقارئات الباركود.",
  },
  {
    question: "هل الكاشير متوافق مع الفوترة الإلكترونية؟",
    answer:
      "نعم، الكاشير متوافق مع متطلبات الفوترة الإلكترونية (هيئة الزكاة والضريبة والجمارك)، وكل فاتورة تصدر برمز QR، ومعه تقرير إقرار ضريبة القيمة المضافة.",
  },
  {
    question: "هل يعمل الكاشير إذا انقطع الإنترنت؟",
    answer: "نعم، يستمر الكاشير في البيع عند انقطاع الاتصال، وتُزامن المبيعات عند عودته.",
  },
  {
    question: "هل أقدر أجرب قبل ما أدفع؟",
    answer:
      "نعم، التطبيقات المدفوعة لها تجربة مجانية لمدة ١٤ يوماً. وتطبيقا الموردين والمشتريات والمصروفات مجانيان حاليًا لمدة سنة عند تفعيلهما.",
  },
  {
    question: "هل لازم أشترك في كل التطبيقات؟",
    answer:
      "لا، تفعّل التطبيقات التي تحتاجها فقط وتدفع عليها. وإذا تبي كل شيء، اشترك في «مدار الكامل» ويشمل كل التطبيقات الحالية والمستقبلية.",
  },
  {
    question: "كيف أدفع الاشتراك؟",
    answer:
      "بالبطاقة عبر الإنترنت (مدى، فيزا، ماستركارد)، أو بالتحويل البنكي، باشتراك شهري أو سنوي. وتشاهد كل فواتيرك ومدفوعاتك من صفحة الفوترة في حسابك.",
  },
  {
    question: "أنا تاجر على سلة أو زد، كيف أبدأ؟",
    answer:
      "ابحث عن «مدار» في متجر تطبيقات سلة أو سوق تطبيقات زد وثبّته. يتجهز حسابك وربط متجرك تلقائيًا، ويصلك بريد ترحيبي تدخل منه بضغطة.",
  },
  {
    question: "هل بياناتي آمنة؟",
    answer:
      "الاتصال بمدار مشفر، وبيانات كل منشأة معزولة عن غيرها، والصلاحيات حسب أدوار فريقك. ولا نصل إلى بيانات أي منصة مربوطة إلا بموافقتك الصريحة.",
  },
]

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 bg-[#f7f9fc] py-24 sm:py-28">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-extrabold text-[#2878ff]">الأسئلة الشائعة</p>
          <h2 className="mt-3 text-3xl leading-tight font-black text-[#0b1738] sm:text-[42px]">
            عندك سؤال؟
          </h2>
        </div>
        <div className="mt-12 space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-slate-200 bg-white px-6 open:shadow-[0_16px_40px_-24px_rgba(11,23,56,0.3)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16.5px] font-extrabold text-[#0b1738] [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#0b1738] transition-transform group-open:rotate-45 group-open:bg-[#2878ff] group-open:text-white">
                  <Plus className="size-4" />
                </span>
              </summary>
              <p className="pb-6 text-[15.5px] leading-8 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
