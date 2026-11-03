import Image from "next/image"
import Link from "next/link"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import {
  MADAR_CONTACT_EMAIL,
  MADAR_LOGIN_URL,
  MADAR_REGISTER_URL,
  MARKETING_NAV_LINKS,
} from "../marketing-constants"

const CURRENT_YEAR = new Date().getFullYear()

const SOLUTIONS = [
  "نقطة البيع",
  "المتاجر الإلكترونية",
  "الحملات الإعلانية",
  "الموردون والمشتريات",
  "المخزون والفروع",
  "المساعد الذكي",
]

const LINK = "text-[15px] text-slate-600 transition-colors hover:text-[#0b1738]"

export function MarketingFooter() {
  return (
    <footer dir="rtl" lang="ar" className="border-t border-slate-200 bg-[#f7f9fc]">
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Image src={ASSETS.logo} alt="مدار" width={778} height={325} className="h-11 w-auto" />
            <p className="mt-5 max-w-xs text-[15px] leading-7 text-slate-600">
              منصة سعودية تجمع الكاشير والمتاجر والإعلانات والمشتريات والمخزون في نظام واحد.
            </p>
          </div>

          <div>
            <h3 className="text-[15px] font-extrabold text-[#0b1738]">الحلول</h3>
            <ul className="mt-5 space-y-3">
              {SOLUTIONS.map((solution) => (
                <li key={solution}>
                  <a href={ROUTES.marketing.product} className={LINK}>
                    {solution}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[15px] font-extrabold text-[#0b1738]">مدار</h3>
            <ul className="mt-5 space-y-3">
              {MARKETING_NAV_LINKS.filter((link) => link.href !== ROUTES.marketing.product).map(
                (link) => (
                  <li key={link.href}>
                    <a href={link.href} className={LINK}>
                      {link.label}
                    </a>
                  </li>
                )
              )}
              <li>
                <a href={MADAR_REGISTER_URL} className={LINK}>
                  إنشاء حساب
                </a>
              </li>
              <li>
                <a href={MADAR_LOGIN_URL} className={LINK}>
                  تسجيل الدخول
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[15px] font-extrabold text-[#0b1738]">تواصل وقانوني</h3>
            <ul className="mt-5 space-y-3">
              <li>
                <a href={`mailto:${MADAR_CONTACT_EMAIL}`} className={LINK} dir="ltr">
                  {MADAR_CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <Link href={ROUTES.privacy} className={LINK}>
                  سياسة الخصوصية
                </Link>
              </li>
              <li>
                <Link href={ROUTES.terms} className={LINK}>
                  شروط الاستخدام
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <p>© {CURRENT_YEAR} مدار. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  )
}
