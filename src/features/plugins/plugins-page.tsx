"use client"

import { useState } from "react"
import Link from "next/link"
import { useLocale } from "next-intl"
import { Check, Loader2, Puzzle, Smartphone, WashingMachine } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppSwitch } from "@/components/app"

import { usePermissions } from "@/features/authentication"

import { type PluginId, pluginsService, usePlugins } from "./plugins"

import { type Locale, localeDirection } from "@/i18n/locales"

const PANEL =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"

// الإضافات: the sector plugins that complete the cashier, each switched on or off here.
// embedded: inside the Apps page's "الإضافات" section (no title row of its own).
// hasPos: whether the organization has the cashier app (the plugins need it).
export function PluginsPage({ embedded = false, hasPos }: { embedded?: boolean; hasPos: boolean }) {
  const locale = useLocale() as Locale
  const ar = locale === "ar"
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const { can } = usePermissions()
  const plugins = usePlugins(hasPos)
  const canToggle = can("settings:edit")
  const [busy, setBusy] = useState<PluginId | null>(null)

  async function toggle(id: PluginId, enabled: boolean) {
    setBusy(id)
    try {
      await pluginsService.setEnabled(id, enabled)
      toast.success(
        enabled
          ? tx("فُعّلت الإضافة.", "Plugin switched on.")
          : tx("أُوقفت الإضافة. بياناتها محفوظة.", "Plugin switched off. Its data is kept.")
      )
    } catch {
      toast.error(tx("تعذر تغيير الإضافة.", "Couldn't change the plugin."))
    } finally {
      setBusy(null)
    }
  }

  const laundryOn = plugins?.find((plugin) => plugin.id === "laundry")?.enabled ?? false

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-10">
      {embedded ? (
        <p className="text-[13px] text-[#4c5d79]">
          {tx(
            "إضافات مجانية تكمّل نقطة البيع لنشاطك. فعّلها أو أوقفها في أي وقت، وتبقى بياناتها محفوظة.",
            "Free plugins that complete the cashier for your kind of business. Switch them on or off any time; their data is kept."
          )}
        </p>
      ) : (
        <header>
          <h1 className="flex items-center gap-2 text-[22px] leading-8 font-extrabold text-[#0b1738]">
            <Puzzle className="size-5 text-[#2563eb]" />
            {tx("الإضافات", "Plugins")}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#6b7b96]">
            {tx(
              "إضافات مجانية تكمّل نقطة البيع لنشاطك. فعّلها أو أوقفها في أي وقت، وتبقى بياناتها محفوظة.",
              "Free plugins that complete the cashier for your kind of business. Switch them on or off any time; their data is kept."
            )}
          </p>
        </header>
      )}

      {!hasPos ? (
        <div className={cn(PANEL, "p-6 text-center")}>
          <p className="text-[14px] font-bold text-[#0b1738]">
            {tx("الإضافات تعمل مع نقطة البيع", "Plugins work with the cashier")}
          </p>
          <p className="mt-1 text-[13px] text-[#6b7b96]">
            {tx(
              "اشترك في تطبيق نقطة البيع لتستخدم الإضافات.",
              "Subscribe to the POS app to use plugins."
            )}
          </p>
          <Link
            href={ROUTES.marketplaceDetails("pos")}
            className="mt-4 inline-flex h-11 items-center rounded-[12px] bg-[#2563eb] px-5 text-[13.5px] font-bold text-white hover:bg-[#1d4ed8]"
          >
            {tx("نقطة البيع", "Point of sale")}
          </Link>
        </div>
      ) : plugins === null ? (
        <div className="flex justify-center py-16 text-[#6b7b96]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className={cn(PANEL, "flex flex-col gap-3 p-5")}>
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                <WashingMachine className="size-6" />
              </span>
              <AppSwitch
                checked={laundryOn}
                disabled={!canToggle || busy === "laundry"}
                onCheckedChange={(checked) => void toggle("laundry", checked)}
                aria-label={tx("تفعيل المغسلة", "Laundry on")}
              />
            </div>
            <div>
              <h2 className="text-[16px] font-extrabold text-[#0b1738]">
                {tx("المغاسل", "Laundry")}
              </h2>
              <p className="mt-1 text-[12.5px] leading-6 text-[#6b7b96]">
                {tx(
                  "طلبات المغسلة من الاستلام حتى التسليم، مربوطة بالكاشير والورديات والفواتير.",
                  "Laundry orders from drop-off to collection, tied to the cashier, shifts and invoices."
                )}
              </p>
            </div>
            <ul className="flex flex-col gap-1.5 text-[12.5px] text-[#0b1738]">
              {[
                tx(
                  "طلبات بمراحل وموعد جاهزية وتنبيه بالمتأخر",
                  "Staged orders, ready-by times, late alerts"
                ),
                tx(
                  "قائمة أسعار بالقطعة والخدمة ورسوم الاستعجال",
                  "Price per piece and service, urgent charge"
                ),
                tx(
                  "رسالة واتساب عند الجاهزية وتذكير لمن لم يستلم",
                  "WhatsApp when ready, reminders"
                ),
                tx(
                  "ملصقات القطع، الصور، العربون، التوصيل والاشتراكات",
                  "Piece tags, photos, deposits, delivery, plans"
                ),
              ].map((line) => (
                <li key={line} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#16a34a]" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#eef2f8] pt-3">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold",
                  laundryOn ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#f1f5f9] text-[#64748b]"
                )}
              >
                {laundryOn ? tx("مفعّلة", "On") : tx("موقوفة", "Off")}
              </span>
              {laundryOn ? (
                <Link
                  href={ROUTES.laundry}
                  className="text-[13px] font-bold text-[#2563eb] hover:underline"
                >
                  {tx("افتح المغسلة", "Open laundry")}
                </Link>
              ) : (
                <span className="text-[12px] text-[#6b7b96]">
                  {tx("مجانية مع نقطة البيع", "Free with POS")}
                </span>
              )}
            </div>
          </article>

          <article className={cn(PANEL, "flex flex-col gap-3 p-5 opacity-70")}>
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#6d28d9]">
                <Smartphone className="size-6" />
              </span>
              <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-[11.5px] font-bold text-[#64748b]">
                {tx("قريبًا", "Coming soon")}
              </span>
            </div>
            <h2 className="text-[16px] font-extrabold text-[#0b1738]">
              {tx("صيانة الأجهزة", "Device repair")}
            </h2>
            <p className="text-[12.5px] leading-6 text-[#6b7b96]">
              {tx(
                "استلام الأجهزة للصيانة وتتبع حالتها وتسليمها، مربوطة بالكاشير.",
                "Taking devices in for repair, tracking and handing them back, tied to the cashier."
              )}
            </p>
          </article>
        </div>
      )}
      {!canToggle && hasPos ? (
        <p className="text-[12px] text-[#6b7b96]">
          {tx(
            "تفعيل الإضافات لمن يملك صلاحية الإعدادات.",
            "Switching plugins needs the settings permission."
          )}
        </p>
      ) : null}
    </div>
  )
}
