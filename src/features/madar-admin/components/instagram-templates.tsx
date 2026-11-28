"use client"

import * as React from "react"
import {
  BarChart3,
  Boxes,
  BrainCircuit,
  CalendarCheck,
  Check,
  Gift,
  Megaphone,
  MessageCircle,
  ReceiptText,
  ScanBarcode,
  Search,
  Store,
  Wallet,
  X,
} from "lucide-react"

import type {
  AdminInstagramDesign,
  AdminInstagramIcon,
  AdminInstagramScene,
  AdminInstagramTemplate,
} from "../services/instagram-admin.service"

// The approved square Instagram designs (1080×1080), all in Madar's identity: A photo and
// checklist, B app screens, C cards, D big number, E question, F old way vs Madar, G numbered tips,
// H phone screen, I one bold line, J cinematic scene. The same element is shown (scaled down) in Madar Admin and turned into the JPEG that
// is published, so what's approved is exactly what goes out.

export const POST_SIZE = 1080

// Public files; built with a join to satisfy the no-literal-route lint rule.
const asset = (...parts: string[]) => ["", ...parts].join(String.fromCharCode(47))
const LOGO = asset("images", "madar-logo.png")
const PERSON = asset("instagram", "person-perfume-shop.jpg")
const PHONE = asset("instagram", "phone-report.png")
const SCREENS: Record<string, string> = {
  cashier: asset("instagram", "screen-cashier.png"),
  products: asset("instagram", "screen-products.png"),
  close: asset("instagram", "screen-close.png"),
}

// Madar's identity colours only (navy, blue, teal) -- the cards shouldn't turn into a rainbow.
const BRAND_BLUE = "linear-gradient(135deg,#2563eb,#12b5a6)"
const BRAND_NAVY = "linear-gradient(135deg,#1e3a8a,#2563eb)"
const BRAND_TEAL = "linear-gradient(135deg,#0f766e,#12b5a6)"

export const ICONS: Record<
  AdminInstagramIcon,
  { icon: React.ElementType; bg: string; label: string }
> = {
  pos: { icon: ScanBarcode, bg: BRAND_BLUE, label: "الكاشير" },
  store: { icon: Store, bg: BRAND_NAVY, label: "المتجر" },
  ads: { icon: Megaphone, bg: BRAND_TEAL, label: "الإعلانات" },
  booking: { icon: CalendarCheck, bg: BRAND_BLUE, label: "الحجوزات" },
  inventory: { icon: Boxes, bg: BRAND_NAVY, label: "المخزون" },
  invoice: { icon: ReceiptText, bg: BRAND_TEAL, label: "الفاتورة" },
  loyalty: { icon: Gift, bg: BRAND_BLUE, label: "الولاء" },
  accounting: { icon: Wallet, bg: BRAND_NAVY, label: "المحاسبة" },
  whatsapp: { icon: MessageCircle, bg: BRAND_TEAL, label: "واتساب" },
  report: { icon: BarChart3, bg: BRAND_BLUE, label: "التقارير" },
  ai: { icon: BrainCircuit, bg: BRAND_NAVY, label: "الذكاء الاصطناعي" },
}

// The scene photos for design J, and where each one leaves room for the words.
export const SCENES: Record<AdminInstagramScene, { label: string; layout: "top" | "side" }> = {
  "shop-night": { label: "صاحب محل ليلاً", layout: "side" },
  "cafe-cashier": { label: "كاشير مقهى", layout: "top" },
  "phone-stock": { label: "المخزون بالجوال", layout: "top" },
  salon: { label: "استقبال صالون", layout: "top" },
  laundry: { label: "مغسلة", layout: "top" },
  "online-store": { label: "متجر إلكتروني", layout: "top" },
  supermarket: { label: "سوبرماركت", layout: "top" },
  boutique: { label: "محل عبايات", layout: "top" },
  ads: { label: "مدير تسويق", layout: "top" },
  stocktake: { label: "جرد بالباركود", layout: "top" },
  ramadan: { label: "شارع رمضاني", layout: "top" },
  payment: { label: "دفع بالجوال", layout: "top" },
}
const sceneUrl = (scene: string) => asset("instagram", "scenes", `${scene}.jpg`)

const CSS = `
.igp { position: relative; width: 1080px; height: 1080px; overflow: hidden; direction: rtl; font-family: var(--font-cairo), "Cairo", sans-serif; }
.igp * { box-sizing: border-box; margin: 0; padding: 0; }
.igp .wordmark { background: url("${LOGO}") no-repeat top left; background-size: 100% auto; aspect-ratio: 778 / 258; }
.igp .check { flex: none; width: 40px; height: 40px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; }

.igp-a { background: #0f1c44; color: #fff; }
.igp-a .photo { position: absolute; left: 0; right: 0; top: 190px; height: 440px; background: url("${PERSON}") center 75% / cover no-repeat; }
.igp-a .photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, #0f1c44 0%, rgba(15,28,68,.55) 22%, rgba(15,28,68,0) 45%, rgba(15,28,68,0) 70%, #0f1c44 100%); }
.igp-a .search { position: absolute; top: 40px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; background: #fff; color: #0b1738; border-radius: 999px; padding: 13px 36px; font-size: 36px; font-weight: 800; white-space: nowrap; box-shadow: 0 20px 50px -20px rgba(0,0,0,.6); }
.igp-a .search i { width: 4px; height: 40px; background: #2563eb; border-radius: 2px; }
.igp-a h1 { position: absolute; top: 128px; left: 0; right: 0; text-align: center; font-size: 78px; line-height: 1.12; font-weight: 900; text-shadow: 0 6px 30px rgba(0,0,0,.35); }
.igp-a h1 span { color: #60a5fa; display: block; }
.igp-a .card { position: absolute; bottom: 152px; left: 60px; right: 60px; background: #fff; border-radius: 28px; padding: 4px 34px; color: #0b1738; box-shadow: 0 30px 60px -30px rgba(0,0,0,.7); }
.igp-a .row { display: flex; align-items: center; gap: 18px; padding: 10px 0; font-size: 28px; font-weight: 800; border-bottom: 1.5px solid #eef2f8; }
.igp-a .row:last-child { border-bottom: 0; }
.igp-a .bottom { position: absolute; bottom: 38px; left: 60px; right: 60px; display: flex; gap: 22px; height: 92px; }
.igp-a .cta { flex: 1; background: #2563eb; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 38px; font-weight: 900; box-shadow: 0 0 50px rgba(37,99,235,.55); }
.igp-a .logo { width: 250px; background: #fff; border-radius: 28px; display: flex; align-items: center; justify-content: center; }
.igp-a .logo .wordmark { width: 196px; }

.igp-b { background: radial-gradient(110% 70% at 50% 75%, #1d4ed8 0%, #12286b 45%, #0b1738 100%); color: #fff; }
.igp-b .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 60px 60px; }
.igp-b .top { position: absolute; top: 48px; left: 70px; right: 70px; display: flex; justify-content: space-between; align-items: center; }
.igp-b .top .wl { background: #fff; border-radius: 22px; padding: 10px 20px; } .igp-b .top .wl .wordmark { width: 160px; }
.igp-b .tag { border: 2px solid rgba(255,255,255,.35); border-radius: 999px; padding: 8px 24px; font-size: 26px; font-weight: 800; direction: ltr; }
.igp-b h1 { position: absolute; top: 150px; right: 70px; left: 70px; font-size: 86px; line-height: 1.1; font-weight: 900; }
.igp-b h1 span { display: block; color: #7dd3fc; }
.igp-b .sub { position: absolute; top: 362px; right: 70px; left: 70px; font-size: 30px; font-weight: 700; color: #c7d4ee; line-height: 1.5; }
.igp-b .laptop { position: absolute; top: 470px; left: 50px; width: 740px; }
.igp-b .screen { border-radius: 22px 22px 0 0; border: 14px solid #0b0f1c; border-bottom-width: 18px; overflow: hidden; background: #fff; aspect-ratio: 16 / 10; box-shadow: 0 40px 80px -20px rgba(0,0,0,.6); }
.igp-b .screen img { width: 100%; display: block; }
.igp-b .base { height: 26px; margin: 0 -40px; background: linear-gradient(#c9d2e3, #8e9ab3); border-radius: 0 0 26px 26px; }
.igp-b .phone { position: absolute; top: 520px; right: 50px; width: 230px; height: 470px; border-radius: 38px; background: #0b0f1c; padding: 12px; box-shadow: 0 40px 80px -20px rgba(0,0,0,.7); transform: rotate(4deg); }
.igp-b .phone div { width: 100%; height: 100%; border-radius: 28px; background: url("${PHONE}") center top / cover; }
.igp-b .chip { position: absolute; display: flex; align-items: center; gap: 12px; background: #fff; color: #0b1738; border-radius: 22px; padding: 11px 20px; font-size: 25px; font-weight: 800; box-shadow: 0 20px 40px -18px rgba(0,0,0,.6); white-space: nowrap; }
.igp-b .chip .check { width: 34px; height: 34px; }
.igp-b .chip.one { top: 440px; left: 60px; } .igp-b .chip.two { top: 500px; right: 30px; transform: rotate(4deg); }
.igp-b .cta { position: absolute; bottom: 40px; left: 70px; background: #fff; color: #1d4ed8; border-radius: 999px; padding: 16px 38px; font-size: 32px; font-weight: 900; }

.igp-c { background: linear-gradient(180deg, #f4f8ff 0%, #e8f0fe 100%); color: #0b1738; }
.igp-c .blob { position: absolute; border-radius: 50%; filter: blur(80px); width: 500px; height: 500px; }
.igp-c .logo { position: absolute; top: 44px; left: 0; right: 0; display: flex; justify-content: center; } .igp-c .logo .wordmark { width: 200px; }
.igp-c h1 { position: absolute; top: 122px; left: 0; right: 0; text-align: center; font-size: 78px; line-height: 1.1; font-weight: 900; }
.igp-c h1 span { display: block; padding-bottom: 18px; margin-bottom: -18px; background: linear-gradient(90deg, #2563eb, #12b5a6); -webkit-background-clip: text; background-clip: text; color: transparent; }
.igp-c .cards { position: absolute; top: 352px; left: 54px; right: 54px; display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.igp-c .c { background: #fff; border-radius: 26px; padding: 28px; box-shadow: 0 18px 40px -26px rgba(11,23,56,.35); border: 1.5px solid #e3ebf8; }
.igp-c .ic { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; color: #fff; }
.igp-c .c b { display: block; margin-top: 12px; font-size: 32px; font-weight: 900; }
.igp-c .c p { margin-top: 4px; font-size: 23px; font-weight: 700; color: #5b6b85; line-height: 1.45; }
.igp-c .wide { grid-column: span 2; display: flex; align-items: center; gap: 26px; background: #0b1738; color: #fff; border: 0; padding: 24px 30px; }
.igp-c .wide b { margin: 0; } .igp-c .wide p { color: #a9b8d6; direction: ltr; text-align: right; }
.igp .grad { background: linear-gradient(90deg, #5eead4, #60a5fa); -webkit-background-clip: text; background-clip: text; color: transparent; padding-bottom: 30px; margin-bottom: -18px; display: block; }
.igp .grad-dark { background: linear-gradient(90deg, #2563eb, #12b5a6); -webkit-background-clip: text; background-clip: text; color: transparent; padding-bottom: 30px; margin-bottom: -18px; display: block; }
.igp .white-logo { filter: brightness(0) invert(1); }

.igp-d { background: #0b1738; color: #fff; }
.igp-d .g1 { position: absolute; width: 700px; height: 700px; border-radius: 50%; filter: blur(120px); background: #2563eb; opacity: .45; top: -260px; left: -200px; }
.igp-d .g2 { position: absolute; width: 600px; height: 600px; border-radius: 50%; filter: blur(120px); background: #12b5a6; opacity: .35; bottom: -260px; right: -180px; }
.igp-d .logo { position: absolute; top: 56px; right: 64px; } .igp-d .logo .wordmark { width: 190px; }
.igp-d .kicker { position: absolute; top: 210px; right: 64px; font-size: 36px; font-weight: 800; color: #5eead4; }
.igp-d .num { position: absolute; top: 250px; right: 40px; padding: 0 16px 0 60px; font-size: 300px; font-weight: 900; line-height: 1; background: linear-gradient(90deg, #60a5fa, #5eead4); -webkit-background-clip: text; background-clip: text; color: transparent; }
.igp-d h1 { position: absolute; top: 600px; right: 64px; left: 64px; font-size: 64px; font-weight: 900; line-height: 1.3; }
.igp-d .chips { position: absolute; bottom: 150px; right: 64px; left: 64px; display: flex; flex-wrap: wrap; gap: 16px; }
.igp-d .chips span { background: rgba(255,255,255,.1); border: 1.5px solid rgba(255,255,255,.18); border-radius: 999px; padding: 12px 26px; font-size: 28px; font-weight: 800; }
.igp .foot { position: absolute; bottom: 56px; right: 64px; left: 64px; display: flex; justify-content: space-between; align-items: center; font-size: 30px; font-weight: 800; }
.igp-d .foot { color: #a9b8d6; }

.igp-e { background: #eef4ff; color: #0b1738; }
.igp-e .logo { position: absolute; top: 56px; left: 0; right: 0; display: flex; justify-content: center; } .igp-e .logo .wordmark { width: 190px; }
.igp-e .tag { position: absolute; top: 170px; left: 0; right: 0; text-align: center; }
.igp-e .tag span { background: #dbeafe; color: #1d4ed8; border-radius: 999px; padding: 10px 30px; font-size: 30px; font-weight: 900; }
.igp-e h1 { position: absolute; top: 245px; left: 70px; right: 70px; text-align: center; font-size: 76px; font-weight: 900; line-height: 1.22; }
.igp-e .opts { position: absolute; top: 490px; left: 90px; right: 90px; display: grid; gap: 18px; }
.igp-e .o { display: flex; align-items: center; gap: 22px; background: #fff; border: 2px solid #dbe6fb; border-radius: 26px; padding: 16px 28px; font-size: 36px; font-weight: 800; box-shadow: 0 14px 30px -24px rgba(29,78,216,.45); }
.igp-e .o b { flex: none; width: 62px; height: 62px; border-radius: 18px; background: linear-gradient(135deg, #2563eb, #12b5a6); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 34px; }
.igp-e .ask { position: absolute; bottom: 44px; left: 0; right: 0; text-align: center; font-size: 34px; font-weight: 900; color: #1d4ed8; }

.igp-f { background: #f8fafc; color: #0b1738; }
.igp-f .logo { position: absolute; top: 50px; left: 0; right: 0; display: flex; justify-content: center; } .igp-f .logo .wordmark { width: 190px; }
.igp-f h1 { position: absolute; top: 150px; left: 0; right: 0; text-align: center; font-size: 66px; font-weight: 900; }
.igp-f .cols { position: absolute; top: 280px; left: 56px; right: 56px; bottom: 150px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.igp-f .col { border-radius: 34px; padding: 36px 32px; }
.igp-f .old { background: #f1f5f9; border: 2px solid #e2e8f0; } .igp-f .new { background: #ecfeff; border: 2px solid #a5f3fc; }
.igp-f .h { display: flex; align-items: center; gap: 16px; font-size: 42px; font-weight: 900; }
.igp-f .h i { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; }
.igp-f .old .h i { background: #64748b; } .igp-f .new .h i { background: linear-gradient(135deg, #2563eb, #12b5a6); }
.igp-f ul { list-style: none; margin-top: 40px; display: grid; gap: 34px; }
.igp-f li { font-size: 37px; font-weight: 800; line-height: 1.4; color: #334155; }
.igp-f .bar { position: absolute; bottom: 50px; left: 56px; right: 56px; background: #0b1738; color: #fff; border-radius: 999px; padding: 22px 36px; display: flex; justify-content: space-between; font-size: 34px; font-weight: 900; }

.igp-g { background: linear-gradient(160deg, #0f766e 0%, #0b1738 100%); color: #fff; }
.igp-g .logo { position: absolute; top: 56px; right: 64px; } .igp-g .logo .wordmark { width: 190px; }
.igp-g .kicker { position: absolute; top: 180px; right: 64px; background: rgba(255,255,255,.12); border-radius: 999px; padding: 10px 28px; font-size: 30px; font-weight: 800; color: #99f6e4; }
.igp-g h1 { position: absolute; top: 250px; right: 64px; left: 64px; font-size: 70px; font-weight: 900; line-height: 1.2; }
.igp-g .list { position: absolute; top: 450px; right: 64px; left: 64px; display: grid; gap: 18px; }
.igp-g .t { display: flex; gap: 24px; align-items: center; background: rgba(255,255,255,.07); border: 1.5px solid rgba(255,255,255,.14); border-radius: 26px; padding: 20px 28px; }
.igp-g .t b { flex: none; width: 74px; height: 74px; border-radius: 22px; background: #5eead4; color: #0b1738; display: flex; align-items: center; justify-content: center; font-size: 42px; font-weight: 900; }
.igp-g .t h3 { font-size: 37px; font-weight: 900; } .igp-g .t p { margin-top: 4px; font-size: 27px; font-weight: 700; color: #c7d2e5; }
.igp-g .foot { bottom: 40px; color: #99f6e4; }

.igp-h { background: linear-gradient(180deg, #eef4ff, #dbe7ff); color: #0b1738; }
.igp-h .logo { position: absolute; top: 56px; right: 64px; } .igp-h .logo .wordmark { width: 190px; }
.igp-h h1 { position: absolute; top: 170px; right: 64px; width: 440px; font-size: 74px; font-weight: 900; line-height: 1.2; }
.igp-h .sub { position: absolute; top: 480px; right: 64px; width: 420px; font-size: 32px; font-weight: 700; color: #475569; line-height: 1.5; }
.igp-h .cta { position: absolute; bottom: 80px; right: 64px; background: #2878ff; color: #fff; border-radius: 999px; padding: 20px 44px; font-size: 34px; font-weight: 900; }
.igp-h .phone { position: absolute; left: 60px; top: 80px; width: 480px; height: 920px; border-radius: 64px; background: #0b1738; padding: 16px; box-shadow: 0 40px 80px -30px rgba(11,23,56,.55); }
.igp-h .phone div { width: 100%; height: 100%; border-radius: 50px; background: #fff url("${PHONE}") center top / cover no-repeat; }
.igp-h .badge { position: absolute; left: 430px; top: 660px; background: #fff; border-radius: 24px; padding: 18px 24px; box-shadow: 0 20px 40px -20px rgba(11,23,56,.4); font-size: 28px; font-weight: 900; }
.igp-h .badge small { display: block; font-size: 22px; color: #0f766e; }

.igp-i { background: linear-gradient(135deg, #2563eb 0%, #12b5a6 100%); color: #fff; }
.igp-i .q { position: absolute; top: 110px; right: 80px; font-size: 260px; font-weight: 900; opacity: .25; line-height: 1; }
.igp-i h1 { position: absolute; top: 330px; right: 80px; left: 80px; font-size: 92px; font-weight: 900; line-height: 1.25; }
.igp-i .u { position: absolute; top: 690px; right: 80px; width: 160px; height: 12px; border-radius: 999px; background: #fff; }
.igp-i .sub { position: absolute; top: 740px; right: 80px; left: 80px; font-size: 38px; font-weight: 700; line-height: 1.5; color: #e0f2fe; }
.igp-i .foot { bottom: 60px; right: 80px; left: 80px; } .igp-i .foot .wordmark { width: 190px; }

.igp-j { background: #0b1738; color: #fff; }
.igp-j .bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
.igp-j .shade { position: absolute; inset: 0; }
.igp-j.top .shade { background: linear-gradient(180deg, rgba(11,23,56,.9) 0%, rgba(11,23,56,.5) 36%, rgba(11,23,56,0) 58%, rgba(11,23,56,0) 78%, rgba(11,23,56,.8) 100%); }
.igp-j.side .shade { background: linear-gradient(270deg, rgba(11,23,56,.92) 0%, rgba(11,23,56,.6) 40%, rgba(11,23,56,0) 64%), linear-gradient(0deg, rgba(11,23,56,.7) 0%, rgba(11,23,56,0) 25%); }
.igp-j h1 { position: absolute; font-size: 96px; font-weight: 900; line-height: 1.08; }
.igp-j.top h1 { top: 70px; right: 64px; left: 64px; }
.igp-j.side h1 { top: 250px; right: 64px; width: 600px; font-size: 84px; }
.igp-j .sub { position: absolute; font-size: 34px; font-weight: 800; line-height: 1.45; color: #e2e8f0; }
.igp-j.top .sub { top: 330px; right: 64px; width: 640px; }
.igp-j.side .sub { top: 640px; right: 64px; width: 440px; }
.igp-j .foot { bottom: 52px; } .igp-j .foot .wordmark { width: 190px; } .igp-j .foot span { color: #cbd5e1; }
.igp-c .wide .go { margin-inline-start: auto; background: linear-gradient(90deg, #12b5a6, #2563eb); border-radius: 999px; padding: 14px 32px; font-size: 30px; font-weight: 900; white-space: nowrap; }
`

function Tick() {
  return (
    <span className="check">
      <Check size={22} strokeWidth={3} />
    </span>
  )
}

function DesignA({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-a">
      <div className="photo" />
      {design.search ? (
        <div className="search">
          <Search size={36} color="#5b6b85" strokeWidth={2.4} />
          {design.search}
          <i />
        </div>
      ) : null}
      <h1>
        {design.titleTop}
        <span>{design.titleBottom}</span>
      </h1>
      <div className="card">
        {(design.points ?? []).map((point) => (
          <div key={point} className="row">
            <Tick />
            {point}
          </div>
        ))}
      </div>
      <div className="bottom">
        <div className="cta">{design.cta}</div>
        <div className="logo">
          <div className="wordmark" />
        </div>
      </div>
    </div>
  )
}

function DesignB({ design }: { design: AdminInstagramDesign }) {
  const [one, two] = design.chips ?? []
  return (
    <div className="igp igp-b">
      <div className="grid" />
      <div className="top">
        <div className="wl">
          <div className="wordmark" />
        </div>
        <div className="tag">Madar One</div>
      </div>
      <h1>
        {design.titleTop}
        <span>{design.titleBottom}</span>
      </h1>
      {design.sub ? <p className="sub">{design.sub}</p> : null}
      <div className="laptop">
        <div className="screen">
          {/* eslint-disable-next-line @next/next/no-img-element -- captured into the post image */}
          <img src={SCREENS[design.screen ?? "cashier"] ?? SCREENS.cashier} alt="" />
        </div>
        <div className="base" />
      </div>
      <div className="phone">
        <div />
      </div>
      {one ? (
        <div className="chip one">
          <Tick />
          {one}
        </div>
      ) : null}
      {two ? (
        <div className="chip two">
          <Tick />
          {two}
        </div>
      ) : null}
      <div className="cta">{design.cta}</div>
    </div>
  )
}

function DesignC({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-c">
      <div
        className="blob"
        style={{ background: "#bfe9e3", top: -200, right: -160, opacity: 0.7 }}
      />
      <div
        className="blob"
        style={{ background: "#c7d7fb", bottom: -200, left: -160, opacity: 0.8 }}
      />
      <div className="logo">
        <div className="wordmark" />
      </div>
      <h1>
        {design.titleTop}
        <span>{design.titleBottom}</span>
      </h1>
      <div className="cards">
        {(design.cards ?? []).map((card, index) => {
          const meta = ICONS[card.icon] ?? ICONS.pos
          const Icon = meta.icon
          return (
            <div key={index} className="c">
              <div className="ic" style={{ background: meta.bg }}>
                <Icon size={34} strokeWidth={1.8} />
              </div>
              <b>{card.title}</b>
              <p>{card.text}</p>
            </div>
          )
        })}
        <div className="c wide">
          <div>
            <b>{design.cta}</b>
            <p>madar.my</p>
          </div>
          <div className="go">ابدأ الآن</div>
        </div>
      </div>
    </div>
  )
}

function Foot({ light = false, label }: { light?: boolean; label?: string }) {
  return (
    <div className="foot">
      {label ? (
        <span>{label}</span>
      ) : (
        <div className={light ? "wordmark white-logo" : "wordmark"} />
      )}
      <span dir="ltr">madar.my</span>
    </div>
  )
}

function DesignD({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-d">
      <div className="g1" />
      <div className="g2" />
      <div className="logo">
        <div className="wordmark white-logo" />
      </div>
      {design.kicker ? <div className="kicker">{design.kicker}</div> : null}
      <div className="num">{design.number}</div>
      <h1>
        {design.titleTop}
        <br />
        {design.titleBottom}
      </h1>
      <div className="chips">
        {(design.chips ?? []).map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
      <Foot label={design.cta} />
    </div>
  )
}

function DesignE({ design }: { design: AdminInstagramDesign }) {
  const letters = ["أ", "ب", "ج", "د"]
  return (
    <div className="igp igp-e">
      <div className="logo">
        <div className="wordmark" />
      </div>
      <div className="tag">
        <span>{design.kicker || "سؤال اليوم"}</span>
      </div>
      <h1>
        {design.titleTop}
        <br />
        {design.titleBottom}
      </h1>
      <div className="opts">
        {(design.options ?? []).map((option, index) => (
          <div key={index} className="o">
            <b>{letters[index]}</b>
            {option}
          </div>
        ))}
      </div>
      <div className="ask">{design.cta || "جاوبنا في التعليقات 👇"}</div>
    </div>
  )
}

function DesignF({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-f">
      <div className="logo">
        <div className="wordmark" />
      </div>
      <h1>{[design.titleTop, design.titleBottom].filter(Boolean).join(" ")}</h1>
      <div className="cols">
        <div className="col old">
          <div className="h">
            <i>
              <X size={36} strokeWidth={2.4} />
            </i>
            الطريقة القديمة
          </div>
          <ul>
            {(design.wrong ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="col new">
          <div className="h">
            <i>
              <Check size={36} strokeWidth={2.4} />
            </i>
            مع مدار
          </div>
          <ul>
            {(design.right ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="bar">
        <span>{design.cta}</span>
        <span dir="ltr">madar.my</span>
      </div>
    </div>
  )
}

function DesignG({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-g">
      <div className="logo">
        <div className="wordmark white-logo" />
      </div>
      {design.kicker ? <div className="kicker">{design.kicker}</div> : null}
      <h1>
        {design.titleTop}
        <br />
        {design.titleBottom}
      </h1>
      <div className="list">
        {(design.steps ?? []).map((step, index) => (
          <div key={index} className="t">
            <b>{index + 1}</b>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </div>
        ))}
      </div>
      <Foot label={design.cta || "احفظ المنشور 🔖"} />
    </div>
  )
}

function DesignH({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-h">
      <div className="logo">
        <div className="wordmark" />
      </div>
      <h1>
        {design.titleTop}
        <span className="grad-dark">{design.titleBottom}</span>
      </h1>
      {design.sub ? <p className="sub">{design.sub}</p> : null}
      <div className="cta">{design.cta}</div>
      <div className="phone">
        <div />
      </div>
      <div className="badge">
        تقرير أمس
        <small>وصل على واتساب ✓</small>
      </div>
    </div>
  )
}

function DesignI({ design }: { design: AdminInstagramDesign }) {
  return (
    <div className="igp igp-i">
      <div className="q">“</div>
      <h1>
        {design.titleTop}
        <br />
        {design.titleBottom}
      </h1>
      <div className="u" />
      {design.sub ? <p className="sub">{design.sub}</p> : null}
      <Foot light />
    </div>
  )
}

function DesignJ({ design }: { design: AdminInstagramDesign }) {
  const scene = design.scene && SCENES[design.scene] ? design.scene : "shop-night"
  return (
    <div className={`igp igp-j ${SCENES[scene].layout}`}>
      <div className="bg" style={{ backgroundImage: `url("${sceneUrl(scene)}")` }} />
      <div className="shade" />
      <h1>
        {design.titleTop}
        <span className="grad">{design.titleBottom}</span>
      </h1>
      {design.sub ? <p className="sub">{design.sub}</p> : null}
      <Foot light />
    </div>
  )
}

const DESIGNS: Record<
  AdminInstagramTemplate,
  (props: { design: AdminInstagramDesign }) => React.ReactElement
> = {
  a: DesignA,
  b: DesignB,
  c: DesignC,
  d: DesignD,
  e: DesignE,
  f: DesignF,
  g: DesignG,
  h: DesignH,
  i: DesignI,
  j: DesignJ,
}

// The full-size post (1080×1080).
export const InstagramPostArt = React.forwardRef<
  HTMLDivElement,
  { template: AdminInstagramTemplate; design: AdminInstagramDesign }
>(function InstagramPostArt({ template, design }, ref) {
  return (
    <div ref={ref} style={{ width: POST_SIZE, height: POST_SIZE }}>
      <style>{CSS}</style>
      {React.createElement(DESIGNS[template] ?? DesignC, { design })}
    </div>
  )
})

// The post shrunk to fit `size` pixels, for lists and the editor.
export function InstagramPostPreview({
  template,
  design,
  size,
  className,
}: {
  template: AdminInstagramTemplate
  design: AdminInstagramDesign
  size: number
  className?: string
}) {
  const scale = size / POST_SIZE
  return (
    <div
      className={className}
      style={{ width: size, height: size, overflow: "hidden", position: "relative" }}
      dir="ltr"
    >
      <div
        style={{
          width: POST_SIZE,
          height: POST_SIZE,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <InstagramPostArt template={template} design={design} />
      </div>
    </div>
  )
}

// The post filling the width of its box (post cards in a grid).
export function InstagramPostFluid({
  template,
  design,
}: {
  template: AdminInstagramTemplate
  design: AdminInstagramDesign
}) {
  const box = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={box} style={{ width: "100%", aspectRatio: "1 / 1" }}>
      {width > 0 ? <InstagramPostPreview template={template} design={design} size={width} /> : null}
    </div>
  )
}
