"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Menu, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { MADAR_LOGIN_URL, MADAR_REGISTER_URL, MARKETING_NAV_LINKS } from "../marketing-constants"

export function MarketingHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8)
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isMenuOpen])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-transparent bg-white/75 backdrop-blur-xl transition-all duration-300",
        isScrolled && "border-slate-200/70 bg-white/90 shadow-[0_8px_30px_rgba(11,23,56,0.06)]"
      )}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href={ROUTES.home} className="flex shrink-0 items-center" aria-label="مدار">
          <Image
            src={ASSETS.logo}
            alt="مدار"
            width={778}
            height={325}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="التنقل الرئيسي">
          {MARKETING_NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-[15px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#0b1738]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={MADAR_LOGIN_URL}
            className="rounded-full px-4 py-2.5 text-[15px] font-semibold text-[#0b1738] transition-colors hover:bg-slate-100"
          >
            تسجيل الدخول
          </a>
          <a
            href={MADAR_REGISTER_URL}
            className="group inline-flex items-center gap-2 rounded-full bg-[#0b1738] px-5 py-2.5 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(11,23,56,0.22)] transition-all hover:-translate-y-px hover:bg-[#13245a]"
          >
            ابدأ مجانًا
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </a>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          className="flex size-11 items-center justify-center rounded-full text-[#0b1738] hover:bg-slate-100 lg:hidden"
          aria-label={isMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {isMenuOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 pt-3 pb-6 lg:hidden">
          <nav className="flex flex-col" aria-label="التنقل الرئيسي">
            {MARKETING_NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold text-[#0b1738] hover:bg-slate-50"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              href={MADAR_LOGIN_URL}
              className="rounded-full border border-slate-200 py-3 text-center text-[15px] font-semibold text-[#0b1738]"
            >
              تسجيل الدخول
            </a>
            <a
              href={MADAR_REGISTER_URL}
              className="rounded-full bg-[#0b1738] py-3 text-center text-[15px] font-bold text-white"
            >
              ابدأ مجانًا
            </a>
          </div>
        </div>
      ) : null}
    </header>
  )
}
