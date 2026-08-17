import Image from "next/image"
import Link from "next/link"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { MADAR_APP_URL, MADAR_CONTACT_EMAIL, MARKETING_NAV_LINKS } from "../marketing-constants"

const CURRENT_YEAR = new Date().getFullYear()

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Image src={ASSETS.logo} alt="MADAR" width={778} height={325} className="h-8 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-600">
              AI-Powered Marketing Intelligence for E-commerce.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Product</h3>
            <ul className="mt-4 space-y-3">
              {MARKETING_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href={ROUTES.marketing.contact}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Legal</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href={ROUTES.privacy} className="text-sm text-slate-600 hover:text-slate-900">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href={ROUTES.terms} className="text-sm text-slate-600 hover:text-slate-900">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Get Started</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={MADAR_APP_URL}
                  rel="noopener"
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  Login to MADAR
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${MADAR_CONTACT_EMAIL}`}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  {MADAR_CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row">
          <p className="text-xs text-slate-500">
            &copy; {CURRENT_YEAR} MADAR. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href={ROUTES.privacy} className="text-xs text-slate-500 hover:text-slate-800">
              Privacy Policy
            </Link>
            <Link href={ROUTES.terms} className="text-xs text-slate-500 hover:text-slate-800">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
