"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Menu, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton } from "@/components/app"

import { MADAR_APP_URL, MARKETING_NAV_LINKS } from "../marketing-constants"

export function MarketingHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8)
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isMobileMenuOpen])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-transparent bg-white/80 backdrop-blur-md transition-all duration-300",
        isScrolled && "border-slate-200/80 shadow-[0_1px_0_0_rgba(15,23,42,0.04)]"
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href={ROUTES.home}
          className="flex shrink-0 items-center gap-2"
          aria-label="MADAR home"
        >
          <Image
            src={ASSETS.logo}
            alt="MADAR"
            width={778}
            height={325}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
          {MARKETING_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 rounded-sm"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <AppButton variant="ghost" asChild>
            <Link href={ROUTES.marketing.contact}>Contact Us</Link>
          </AppButton>
          <AppButton asChild>
            <a href={MADAR_APP_URL} rel="noopener">
              Login
            </a>
          </AppButton>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 lg:hidden"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          {isMobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {isMobileMenuOpen ? (
        <div
          id="mobile-nav-panel"
          className="border-t border-slate-200 bg-white px-4 pb-6 pt-2 shadow-lg lg:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {MARKETING_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={ROUTES.marketing.contact}
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              Contact Us
            </Link>
          </nav>
          <AppButton asChild fullWidth className="mt-4">
            <a href={MADAR_APP_URL} rel="noopener">
              Login
            </a>
          </AppButton>
        </div>
      ) : null}
    </header>
  )
}
