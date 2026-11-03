import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CreditCard,
  FileText,
  Home,
  LayoutGrid,
  Megaphone,
  Package,
  Receipt,
  ScanLine,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
} from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"

// Illustrations of Madar's own screens, drawn in the app's visual language with sample data --
// crisp at any size, unlike screenshots of a demo account.

const INK = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

export function WindowFrame({
  children,
  className,
  url = "app.madar.my",
}: {
  children: ReactNode
  className?: string
  url?: string
}) {
  return (
    <div
      dir="rtl"
      className={cn(
        "overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_30px_80px_-20px_rgba(11,23,56,0.28)]",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <div className="flex gap-1.5" dir="ltr">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div
          className={cn(
            "mx-auto rounded-md bg-white px-10 py-1 text-[10px] font-medium ring-1 ring-slate-200",
            MUTED
          )}
          dir="ltr"
        >
          {url}
        </div>
      </div>
      {children}
    </div>
  )
}

function Kpi({
  label,
  value,
  delta,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  delta?: string
  tone: string
  icon: typeof Home
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-semibold", MUTED)}>{label}</span>
        <span className={cn("flex size-6 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className={cn("mt-1.5 text-[15px] font-extrabold", INK)}>{value}</p>
      {delta ? <p className="text-[9.5px] font-bold text-emerald-600">{delta}</p> : null}
    </div>
  )
}

const SIDEBAR_ICONS = [Home, Store, ShoppingCart, Package, Megaphone, Sparkles]

export function DashboardMockup() {
  return (
    <WindowFrame>
      <div className="flex bg-[#f6f8fc]">
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 border-s border-slate-100 bg-white py-4 sm:flex">
          <span className="mb-2 flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#14c2b0] to-[#1d4ed8] text-[11px] font-black text-white">
            م
          </span>
          {SIDEBAR_ICONS.map((Icon, index) => (
            <span
              key={index}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                index === 0 ? "bg-[#eef4ff] text-[#2878ff]" : "text-slate-400"
              )}
            >
              <Icon className="size-4" />
            </span>
          ))}
        </aside>

        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className={cn("text-[13px] font-extrabold", INK)}>صباح الخير، متجر الريم 👋</p>
              <p className={cn("text-[10px]", MUTED)}>كل فروعك ومتاجرك وحملاتك في لوحة واحدة</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-[#0b1738] ring-1 ring-slate-200">
              آخر ٧ أيام
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi
              label="المبيعات"
              value="184,250 ر.س"
              delta="▲ 12.4%"
              tone="bg-blue-50 text-blue-600"
              icon={Wallet}
            />
            <Kpi
              label="الطلبات"
              value="2,318"
              delta="▲ 8.1%"
              tone="bg-violet-50 text-violet-600"
              icon={ShoppingBag}
            />
            <Kpi
              label="العائد الإعلاني"
              value="4.8x"
              delta="▲ 0.6x"
              tone="bg-emerald-50 text-emerald-600"
              icon={Megaphone}
            />
            <Kpi label="زوار الآن" value="128" tone="bg-amber-50 text-amber-600" icon={Users} />
          </div>

          <div className="grid gap-2 md:grid-cols-[1.6fr_1fr]">
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className={cn("text-[11px] font-bold", INK)}>المبيعات حسب القناة</p>
                <div className="flex gap-3 text-[9px] font-semibold">
                  <span className="flex items-center gap-1 text-[#2878ff]">
                    <i className="size-1.5 rounded-full bg-[#2878ff]" /> المتجر الإلكتروني
                  </span>
                  <span className="flex items-center gap-1 text-[#14b8a6]">
                    <i className="size-1.5 rounded-full bg-[#14b8a6]" /> الكاشير
                  </span>
                </div>
              </div>
              <svg viewBox="0 0 320 110" className="mt-2 h-28 w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="madar-area-blue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2878ff" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#2878ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[25, 55, 85].map((y) => (
                  <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="#eef2f7" strokeWidth="1" />
                ))}
                <path
                  d="M0,80 C30,70 50,74 80,60 C110,46 130,58 160,44 C190,30 210,40 240,26 C270,14 295,20 320,10 L320,110 L0,110 Z"
                  fill="url(#madar-area-blue)"
                />
                <path
                  d="M0,80 C30,70 50,74 80,60 C110,46 130,58 160,44 C190,30 210,40 240,26 C270,14 295,20 320,10"
                  fill="none"
                  stroke="#2878ff"
                  strokeWidth="2.5"
                />
                <path
                  d="M0,95 C30,90 55,92 80,84 C110,76 130,82 160,72 C190,64 215,70 240,58 C270,50 295,54 320,44"
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth="2.5"
                  strokeDasharray="0"
                />
              </svg>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <p className={cn("text-[11px] font-bold", INK)}>الأكثر مبيعًا</p>
              <ul className="mt-2 space-y-2">
                {[
                  ["عطر عود ملكي", "412", "w-[92%]"],
                  ["قهوة مختصة ٢٥٠غ", "355", "w-[78%]"],
                  ["بخور كمبودي", "268", "w-[60%]"],
                  ["مبخرة كهربائية", "190", "w-[42%]"],
                ].map(([name, count, width]) => (
                  <li key={name}>
                    <div className="flex justify-between text-[10px]">
                      <span className={cn("font-semibold", INK)}>{name}</span>
                      <span className={MUTED}>{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-1.5 rounded-full bg-gradient-to-l from-[#2878ff] to-[#14b8a6]",
                          width
                        )}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  )
}

const POS_PRODUCTS = [
  ["قهوة سعودية", "18", "bg-amber-100"],
  ["لاتيه", "16", "bg-orange-100"],
  ["كرواسون", "9", "bg-yellow-100"],
  ["تمر سكري", "35", "bg-rose-100"],
  ["ماء ٣٣٠مل", "2", "bg-sky-100"],
  ["كيكة تمر", "14", "bg-lime-100"],
] as const

export function PosMockup() {
  return (
    <WindowFrame url="app.madar.my/pos">
      <div className="grid grid-cols-[1.25fr_1fr] gap-3 bg-[#f6f8fc] p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <ScanLine className="size-3.5 text-[#2878ff]" />
            <span className={cn("text-[10px]", MUTED)}>امسح الباركود أو ابحث عن منتج…</span>
          </div>
          <div className="flex gap-1.5">
            {["الكل", "مشروبات", "مخبوزات", "تمور"].map((chip, index) => (
              <span
                key={chip}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[9.5px] font-bold",
                  index === 0 ? "bg-[#2878ff] text-white" : "bg-white text-[#0b1738]"
                )}
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {POS_PRODUCTS.map(([name, price, tone]) => (
              <div key={name} className="rounded-xl bg-white p-2 ring-1 ring-slate-100">
                <div className={cn("mb-1.5 h-9 rounded-lg", tone)} />
                <p className={cn("truncate text-[9.5px] font-bold", INK)}>{name}</p>
                <p className="text-[9px] font-semibold text-[#2878ff]">{price} ر.س</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <p className={cn("text-[11px] font-extrabold", INK)}>الطلب الحالي</p>
          <ul className="mt-2 flex-1 space-y-1.5 text-[10px]">
            {[
              ["قهوة سعودية × 2", "36.00"],
              ["كرواسون × 1", "9.00"],
              ["تمر سكري × 1", "35.00"],
            ].map(([line, total]) => (
              <li key={line} className="flex justify-between">
                <span className={INK}>{line}</span>
                <span className={cn("font-semibold", INK)}>{total}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-1 border-t border-dashed border-slate-200 pt-2 text-[10px]">
            <div className="flex justify-between">
              <span className={MUTED}>الضريبة ١٥٪</span>
              <span className={INK}>10.43</span>
            </div>
            <div className="flex justify-between text-[12px] font-extrabold">
              <span className={INK}>الإجمالي</span>
              <span className="text-[#2878ff]">80.00 ر.س</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] font-bold">
            <span className="flex items-center justify-center gap-1 rounded-lg bg-[#eef4ff] py-1.5 text-[#2878ff]">
              <CreditCard className="size-3" /> مدى
            </span>
            <span className="flex items-center justify-center gap-1 rounded-lg bg-emerald-50 py-1.5 text-emerald-700">
              <Wallet className="size-3" /> نقدًا
            </span>
          </div>
          <span className="mt-1.5 rounded-lg bg-[#0b1738] py-2 text-center text-[10.5px] font-bold text-white">
            إتمام البيع
          </span>
        </div>
      </div>
    </WindowFrame>
  )
}

export function ReceiptCard({ className }: { className?: string }) {
  return (
    <div
      dir="rtl"
      className={cn(
        "w-44 rounded-2xl bg-white p-3 shadow-[0_20px_50px_-12px_rgba(11,23,56,0.35)] ring-1 ring-slate-100",
        className
      )}
    >
      <p className={cn("text-center text-[11px] font-extrabold", INK)}>فاتورة ضريبية مبسطة</p>
      <p className={cn("text-center text-[9px]", MUTED)}>INV-2026-004182</p>
      <div className="my-2 border-t border-dashed border-slate-200" />
      <div className="flex justify-between text-[10px] font-bold">
        <span className={INK}>الإجمالي</span>
        <span className={INK}>80.00 ر.س</span>
      </div>
      <div className="mx-auto mt-2 grid size-16 grid-cols-5 gap-0.5 rounded-md bg-white p-1 ring-1 ring-slate-200">
        {Array.from({ length: 25 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "rounded-[1px]",
              [0, 1, 3, 5, 7, 9, 10, 12, 14, 16, 17, 19, 20, 21, 23, 24].includes(index)
                ? "bg-[#0b1738]"
                : "bg-transparent"
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 flex items-center justify-center gap-1 text-[9px] font-bold text-emerald-600">
        <CheckCircle2 className="size-3" /> متوافقة مع الفوترة الإلكترونية
      </p>
    </div>
  )
}

export function LiveVisitorsMockup() {
  return (
    <WindowFrame url="app.madar.my/live-visitors">
      <div className="space-y-3 bg-[#f6f8fc] p-4">
        <div className="flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <div>
            <p className={cn("text-[10px] font-semibold", MUTED)}>الزوار في متجرك الآن</p>
            <p className={cn("text-2xl font-black", INK)}>128</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            مباشر
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["أضافوا للسلة", "34", "text-violet-600"],
            ["بدأوا الدفع", "12", "text-amber-600"],
            ["طلبات", "7", "text-emerald-600"],
          ].map(([label, value, tone]) => (
            <div
              key={label}
              className="rounded-xl bg-white p-2.5 text-center ring-1 ring-slate-100"
            >
              <p className={cn("text-lg font-black", tone)}>{value}</p>
              <p className={cn("text-[9.5px] font-semibold", MUTED)}>{label}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <p className={cn("mb-2 text-[11px] font-bold", INK)}>يحدث الآن</p>
          <ul className="space-y-2 text-[10px]">
            {[
              ["طلب جديد من الرياض", "سناب شات • 245 ر.س", "bg-emerald-500"],
              ["أضاف «عطر عود ملكي» للسلة", "جدة • من تيك توك", "bg-violet-500"],
              ["بدأ إتمام الشراء", "الدمام • بحث جوجل", "bg-amber-500"],
            ].map(([event, meta, dot]) => (
              <li key={event} className="flex items-start gap-2">
                <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", dot)} />
                <div>
                  <p className={cn("font-bold", INK)}>{event}</p>
                  <p className={MUTED}>{meta}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </WindowFrame>
  )
}

export function AdsMockup() {
  const rows = [
    [ASSETS.platforms.snapchat, "Snapchat", "12,400", "5.6x", "w-[88%]"],
    [ASSETS.platforms.googleAds, "Google Ads", "18,900", "4.9x", "w-[76%]"],
    [ASSETS.platforms.meta, "Meta", "9,750", "3.8x", "w-[60%]"],
    [ASSETS.platforms.tiktok, "TikTok", "7,200", "3.1x", "w-[48%]"],
  ] as const
  return (
    <WindowFrame url="app.madar.my/campaigns">
      <div className="space-y-3 bg-[#f6f8fc] p-4">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="الإنفاق" value="48,250 ر.س" tone="bg-blue-50 text-blue-600" icon={Wallet} />
          <Kpi
            label="الإيرادات"
            value="231,600 ر.س"
            tone="bg-emerald-50 text-emerald-600"
            icon={BarChart3}
          />
          <Kpi
            label="العائد (ROAS)"
            value="4.8x"
            tone="bg-violet-50 text-violet-600"
            icon={Megaphone}
          />
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <div
            className={cn("mb-2 grid grid-cols-[1.4fr_1fr_1.6fr] text-[9.5px] font-bold", MUTED)}
          >
            <span>المنصة</span>
            <span>الإنفاق</span>
            <span>العائد على الإنفاق</span>
          </div>
          <ul className="space-y-2.5">
            {rows.map(([logo, name, spend, roas, width]) => (
              <li key={name} className="grid grid-cols-[1.4fr_1fr_1.6fr] items-center text-[10px]">
                <span className={cn("flex items-center gap-1.5 font-bold", INK)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="" className="size-4 rounded object-contain" />
                  {name}
                </span>
                <span className={INK}>{spend}</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 rounded-full bg-slate-100">
                    <span
                      className={cn(
                        "block h-1.5 rounded-full bg-gradient-to-l from-[#14b8a6] to-[#2878ff]",
                        width
                      )}
                    />
                  </span>
                  <b className={INK}>{roas}</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </WindowFrame>
  )
}

export function InvoiceScanMockup() {
  return (
    <WindowFrame url="app.madar.my/purchases">
      <div className="grid grid-cols-[0.8fr_1.3fr] gap-3 bg-[#f6f8fc] p-4">
        <div className="relative rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <p className={cn("text-[10px] font-extrabold", INK)}>فاتورة المورد</p>
          <div className="mt-2 space-y-1.5">
            {[90, 70, 80, 60, 75, 50].map((width, index) => (
              <div
                key={index}
                className="h-1.5 rounded bg-slate-200"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-[#2878ff] shadow-[0_0_12px_#2878ff]" />
          <span className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-[#eef4ff] py-1.5 text-[9.5px] font-bold text-[#2878ff]">
            <Sparkles className="size-3" /> يقرأ الذكاء الاصطناعي…
          </span>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <p className={cn("text-[10px] font-extrabold", INK)}>البنود المستخرجة</p>
          <ul className="mt-2 space-y-1.5 text-[9.5px]">
            {[
              ["حليب طازج ١ لتر", "48", "مطابق"],
              ["سكر ناعم ٢ كجم", "20", "مطابق"],
              ["هيل حب ٥٠٠غ", "6", "منتج جديد"],
            ].map(([name, qty, state]) => (
              <li
                key={name}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
              >
                <span className={cn("font-bold", INK)}>{name}</span>
                <span className={MUTED}>× {qty}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-bold",
                    state === "مطابق"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  )}
                >
                  {state}
                </span>
              </li>
            ))}
          </ul>
          <span className="mt-2 block rounded-lg bg-[#0b1738] py-1.5 text-center text-[10px] font-bold text-white">
            إضافة إلى أمر الشراء
          </span>
        </div>
      </div>
    </WindowFrame>
  )
}

export function InventoryMockup() {
  return (
    <WindowFrame url="app.madar.my/inventory">
      <div className="space-y-3 bg-[#f6f8fc] p-4">
        <div className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ArrowLeftRight className="size-4" />
          </span>
          <div className="flex-1">
            <p className={cn("text-[10.5px] font-extrabold", INK)}>TRF-0012 • تحويل مخزون</p>
            <p className={cn("text-[9.5px]", MUTED)}>٢٤ منتجًا • ٣١٠ وحدة</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9.5px] font-bold text-amber-700">
            الرياض
          </span>
          <ArrowLeftRight className="size-3 text-slate-400" />
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
            جدة
          </span>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <p className={cn("text-[11px] font-bold", INK)}>جرد المخزون — فرع الرياض</p>
            <span className="flex items-center gap-1 text-[9.5px] font-bold text-[#2878ff]">
              <ScanLine className="size-3" /> مسح بالباركود
            </span>
          </div>
          <div className={cn("mt-2 grid grid-cols-4 text-[9.5px] font-bold", MUTED)}>
            <span>المنتج</span>
            <span>النظام</span>
            <span>المعدود</span>
            <span>الفرق</span>
          </div>
          <ul className="mt-1.5 space-y-1.5 text-[10px]">
            {[
              ["زيت زيتون ١ لتر", "40", "40", "0"],
              ["أرز بسمتي ٥ كجم", "26", "24", "-2"],
              ["عسل سدر", "12", "13", "+1"],
            ].map(([name, system, counted, diff]) => (
              <li key={name} className="grid grid-cols-4 items-center">
                <span className={cn("font-bold", INK)}>{name}</span>
                <span className={INK}>{system}</span>
                <span className={INK}>{counted}</span>
                <span
                  className={cn(
                    "w-fit rounded-full px-2 py-0.5 font-bold",
                    diff === "0"
                      ? "bg-slate-100 text-slate-600"
                      : diff.startsWith("-")
                        ? "bg-rose-50 text-rose-600"
                        : "bg-emerald-50 text-emerald-700"
                  )}
                  dir="ltr"
                >
                  {diff}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </WindowFrame>
  )
}

export function AiChatMockup() {
  return (
    <WindowFrame url="app.madar.my/ai">
      <div className="space-y-3 bg-[#f6f8fc] p-4">
        <div className="ms-auto w-fit max-w-[80%] rounded-2xl rounded-tl-md bg-[#2878ff] px-3 py-2 text-[11px] font-semibold text-white">
          كم بعت أمس في فرع جدة؟ وأي حملة جابت أكثر طلبات هذا الأسبوع؟
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-tr-md bg-white p-3 ring-1 ring-slate-100">
          <p className="flex items-center gap-1 text-[10px] font-bold text-[#2878ff]">
            <Sparkles className="size-3" /> مساعد مدار
          </p>
          <p className={cn("mt-1 text-[11px] leading-5", INK)}>
            مبيعات فرع جدة أمس <b>12,840 ر.س</b> من <b>164</b> فاتورة. وأكثر حملة جابت طلبات هذا
            الأسبوع هي <b>«عروض الويكند» على سناب شات</b> بـ <b>212</b> طلبًا.
          </p>
          <div className="mt-2 flex h-16 items-end gap-1.5">
            {[40, 55, 35, 70, 62, 85, 100].map((height, index) => (
              <span
                key={index}
                className={cn("flex-1 rounded-t-md", index === 6 ? "bg-[#2878ff]" : "bg-[#dbe7ff]")}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </WindowFrame>
  )
}

export const APP_ICONS = {
  pos: Receipt,
  ecommerce: Store,
  advertising: Megaphone,
  procurement: Truck,
  inventory: Boxes,
  products: Package,
  expenses: Wallet,
  reports: FileText,
  ai: Sparkles,
  all: LayoutGrid,
} as const
