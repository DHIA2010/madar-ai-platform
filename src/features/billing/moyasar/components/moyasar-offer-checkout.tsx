"use client"

// Checking out one of Madar Admin's offers (purpose=offer on the checkout page). The price shown is
// for information; what's charged is priced server-side from the offer.

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { AlertCircle, ArrowLeft, BadgePercent, Check } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { formatRiyals, type MarketplaceOffer, offersService } from "@/features/applications"

import { MoyasarPaymentPanel } from "./moyasar-payment-panel"

import { type Locale, localeDirection } from "@/i18n/locales"

export function MoyasarOfferCheckout({ offerId }: { offerId: string }) {
  const locale = useLocale() as Locale
  const ar = locale === "ar"
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const router = useRouter()
  const [offer, setOffer] = useState<MarketplaceOffer | null | undefined>(undefined)
  const back = `${ROUTES.marketplace}?section=offers`

  useEffect(() => {
    offersService
      .list()
      .then((items) => setOffer(items.find((item) => item.id === offerId) ?? null))
      .catch(() => setOffer(null))
  }, [offerId])

  if (offer === null) {
    return (
      <div
        dir={localeDirection(locale)}
        className="flex min-h-[70vh] items-center justify-center p-6"
      >
        <div className="w-full max-w-[26rem] rounded-[16px] border border-[#e1e7f0] bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto size-12 text-[#d97706]" />
          <p className="mt-4 text-[15px] font-extrabold text-[#0b1738]">
            {tx("هذا العرض غير متاح حاليًا.", "This offer isn't available right now.")}
          </p>
          <AppButton
            className="mt-5 h-11 w-full rounded-[10px] text-[13.5px] font-bold"
            onClick={() => router.push(ROUTES.marketplace)}
          >
            {tx("العودة للتطبيقات", "Back to apps")}
          </AppButton>
        </div>
      </div>
    )
  }

  return (
    <div dir={localeDirection(locale)} className="mx-auto max-w-[32rem] p-6">
      <button
        type="button"
        onClick={() => router.push(back)}
        className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6b7b96] hover:text-[#0b1738]"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
        {tx("العروض", "Offers")}
      </button>
      <div className="rounded-[16px] border border-[#e1e7f0] bg-white p-6 shadow-sm">
        {offer ? (
          <>
            <div className="mb-5 flex items-start gap-3 border-b border-[#eef1f6] pb-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
                <BadgePercent className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-extrabold text-[#0b1738]">{offer.title}</p>
                <p className="text-[12.5px] text-[#6b7b96]">
                  {offer.package
                    ? tx(
                        `كاشير مدار (${offer.package.name}) لمدة ${offer.years === 2 ? "سنتين" : `${offer.years} سنوات`}`,
                        `Madar cashier (${offer.package.name}) for ${offer.years} years`
                      )
                    : offer.subtitle}
                </p>
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {offer.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-1.5 text-[12px] text-[#475467]"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[#1a9e55]" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mb-4 flex items-end justify-between">
              <span className="text-[13px] font-semibold text-[#6b7b96]">
                {tx("المبلغ للمدة كاملة", "Total for the whole period")}
              </span>
              <span className="text-[24px] font-extrabold text-[#0b1738]">
                {formatRiyals(offer.priceHalalas)}{" "}
                <span className="text-[13px]">{tx("ريال", "SAR")}</span>
              </span>
            </div>
            <p className="mb-4 rounded-[10px] bg-[#f7f9fc] px-3.5 py-2.5 text-[11.5px] leading-5 text-[#6b7b96]">
              {tx(
                "إن كان لديك اشتراك قائم، تبدأ مدة العرض بعد نهايته. بعد انتهاء المدة يتجدد الكاشير بسعره السنوي المعتاد، وتنتهي التطبيقات المجانية ما لم تشترك فيها. لا يُجمع العرض مع كوبون.",
                "If you have a running subscription, the offer starts after it ends. Afterwards the cashier renews at its normal yearly price and the free apps end unless you subscribe to them. No coupon on top."
              )}
            </p>
            <MoyasarPaymentPanel
              purchase={{
                application: offer.application,
                packageId: offer.package?.id ?? "",
                interval: "yearly",
                bundleOffer: offer.id,
              }}
              applicationName={offer.title}
            />
          </>
        ) : (
          <p className="py-10 text-center text-[13px] text-[#6b7b96]">…</p>
        )}
        <p className="mt-3 text-center text-[11.5px] text-[#95a4bd]">
          {tx("الدفع آمن عبر ميسر.", "Secure payment through Moyasar.")}
        </p>
      </div>
    </div>
  )
}
