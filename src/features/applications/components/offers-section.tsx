"use client"

import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { BadgePercent, CheckCircle2, Gift, Monitor, Timer } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import type { MarketplaceOffer } from "../services/offers.service"
import { formatRiyals } from "../services/pricing.service"

// The apps page's «العروض» tab: Madar Admin's offers on sale right now, each bought in one go.
export function OffersSection({ offers }: { offers: MarketplaceOffer[] }) {
  const ar = useLocale() === "ar"
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const router = useRouter()

  if (offers.length === 0) {
    return (
      <div className="rounded-[14px] border border-[#e1e7f0] bg-white px-5 py-12 text-center text-[13px] text-[#6b7b96]">
        {tx("لا توجد عروض حاليًا. تابعنا قريبًا!", "No offers right now. Check back soon!")}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {offers.map((offer) => {
        const saving = Math.max(0, offer.regularHalalas - offer.priceHalalas)
        const endsOn = offer.endsOn
          ? new Intl.DateTimeFormat(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", {
              day: "numeric",
              month: "long",
            }).format(new Date(`${offer.endsOn}T12:00:00`))
          : null
        return (
          <div
            key={offer.id}
            className="overflow-hidden rounded-[20px] border border-[#dbe6ff] bg-white shadow-[0_8px_24px_rgba(37,99,235,0.08)]"
          >
            <div className="relative bg-gradient-to-br from-[#0b1f5c] via-[#1d3fa8] to-[#2563eb] px-6 pt-6 pb-16 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-[12px] bg-white/15">
                    <Monitor className="size-6" />
                  </span>
                  <div>
                    <p className="text-[20px] leading-7 font-extrabold">{offer.title}</p>
                    {offer.subtitle ? (
                      <p className="text-[12.5px] text-white/80">{offer.subtitle}</p>
                    ) : null}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#ef4444] px-3 py-1 text-[11.5px] font-bold">
                  <Timer className="size-3.5" />
                  {endsOn
                    ? tx(`حتى ${endsOn}`, `Until ${endsOn}`)
                    : tx("لفترة محدودة", "Limited time")}
                </span>
              </div>
              {offer.years === 2 ? (
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="rounded-[14px] border border-white/25 bg-white/10 px-3 py-3 text-center">
                    <p className="text-[11.5px] text-white/75">{tx("السنة الأولى", "Year one")}</p>
                    <p className="text-[18px] font-extrabold">{tx("مدفوعة", "Paid")}</p>
                  </div>
                  <span className="text-[22px] font-extrabold text-[#5eead4]">+</span>
                  <div className="relative rounded-[14px] bg-[#5eead4] px-3 py-3 text-center text-[#0b1738]">
                    <span className="absolute -top-2.5 start-2 flex items-center gap-1 rounded-full bg-[#ef4444] px-2 py-0.5 text-[10.5px] font-bold text-white">
                      <Gift className="size-3" />
                      {tx("هدية", "Gift")}
                    </span>
                    <p className="text-[11.5px] text-[#0b1738]/70">
                      {tx("السنة الثانية", "Year two")}
                    </p>
                    <p className="text-[18px] font-extrabold">{tx("مجاناً", "Free")}</p>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="relative -mt-10 px-6">
              <div className="flex flex-wrap items-end justify-between gap-2 rounded-[16px] border border-[#e1e7f0] bg-white px-5 py-4 shadow-sm">
                <div>
                  <p className="text-[12px] font-semibold text-[#6b7b96]">
                    {tx(
                      `${offer.years === 2 ? "السنتين" : `${offer.years} سنوات`} كاملة بـ`,
                      `All ${offer.years} years for`
                    )}
                  </p>
                  <p className="text-[32px] leading-10 font-extrabold text-[#dc2626]">
                    {formatRiyals(offer.priceHalalas)}{" "}
                    <span className="text-[15px] text-[#0b1738]">{tx("ريال", "SAR")}</span>
                  </p>
                </div>
                {saving > 0 ? (
                  <div className="text-end">
                    <p className="text-[12px] text-[#98a2b3] line-through">
                      {formatRiyals(offer.regularHalalas)} {tx("ريال", "SAR")}
                    </p>
                    <p className="flex items-center gap-1 text-[12.5px] font-bold text-[#16a34a]">
                      <BadgePercent className="size-3.5" />
                      {tx(`وفّر ${formatRiyals(saving)} ريال`, `Save SAR ${formatRiyals(saving)}`)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="px-6 pt-4 pb-6">
              <p className="mb-2.5 text-[14px] font-extrabold text-[#0b1738]">
                {offer.package
                  ? tx(
                      `كاشير مدار (${offer.package.name}) ويجيك معه `,
                      `Madar cashier (${offer.package.name}), plus `
                    )
                  : tx("ويجيك معه ", "Plus ")}
                <span className="rounded-full bg-[#16a34a] px-2 py-0.5 text-[12px] text-white">
                  {tx("مجاناً", "free")}
                </span>
              </p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {offer.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 rounded-[10px] border border-[#eef1f6] bg-[#f8fafd] px-3 py-2 text-[12.5px] font-semibold text-[#344054]"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-[#16a34a]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `${ROUTES.marketplaceBillingCheckout}?purpose=offer&offerId=${encodeURIComponent(offer.id)}`
                  )
                }
                className="mt-5 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#0b1738] text-[15px] font-extrabold text-white transition hover:bg-[#1e2a4a]"
              >
                {tx("اشترك الحين", "Subscribe now")}
              </button>
              <p className="mt-2 text-center text-[11.5px] text-[#98a2b3]">
                {tx(
                  "بعد انتهاء المدة يتجدد الكاشير بسعره السنوي المعتاد.",
                  "Afterwards the cashier renews at its normal yearly price."
                )}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
