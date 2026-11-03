import { ShieldCheck } from "lucide-react"

import { INTEGRATION_CATEGORY_LABEL, MARKETING_INTEGRATIONS } from "../marketing-constants"

export function IntegrationsSection() {
  return (
    <section id="integrations" className="scroll-mt-20 bg-[#0b1738] py-24 text-white sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-[#5eead4]">التكاملات</p>
          <h2 className="mt-3 text-3xl leading-tight font-black sm:text-[42px]">
            يرتبط بالمنصات التي تعمل عليها
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            اربط متاجرك ومنصاتك الإعلانية في دقائق، وخلّ مدار يجمع بياناتها في مكان واحد ويحدّثها
            تلقائيًا.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETING_INTEGRATIONS.map((integration) => (
            <div
              key={integration.name}
              className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={integration.logo}
                      alt={integration.name}
                      className="size-full object-contain"
                    />
                  </span>
                  <span className="text-lg font-extrabold">{integration.name}</span>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-bold text-slate-300">
                  {INTEGRATION_CATEGORY_LABEL[integration.category]}
                </span>
              </div>
              <p className="text-[14.5px] leading-7 text-slate-300">{integration.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 rounded-3xl border border-white/10 bg-gradient-to-l from-[#12b5a6]/15 to-[#2563eb]/15 p-6 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#5eead4]">
            <ShieldCheck className="size-6" />
          </span>
          <p className="text-[15px] leading-7 text-slate-200">
            لا يصل مدار إلى بيانات أي منصة إلا بعد موافقتك الصريحة عبر واجهاتها الرسمية، ويستخدمها
            فقط لعرض التحليلات والتقارير داخل حسابك. يمكنك فصل أي تكامل في أي وقت.
          </p>
        </div>
      </div>
    </section>
  )
}
