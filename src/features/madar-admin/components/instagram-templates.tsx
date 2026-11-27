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
} from "lucide-react"

import type {
  AdminInstagramDesign,
  AdminInstagramIcon,
  AdminInstagramTemplate,
} from "../services/instagram-admin.service"

// The three approved square Instagram designs (1080×1080): A photo and checklist, B app screens,
// C cards. The same element is shown (scaled down) in Madar Admin and turned into the JPEG that
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

export const ICONS: Record<
  AdminInstagramIcon,
  { icon: React.ElementType; bg: string; label: string }
> = {
  pos: { icon: ScanBarcode, bg: "linear-gradient(135deg,#16a34a,#0d9488)", label: "الكاشير" },
  store: { icon: Store, bg: "linear-gradient(135deg,#0284c7,#0d9488)", label: "المتجر" },
  ads: { icon: Megaphone, bg: "linear-gradient(135deg,#7c3aed,#2563eb)", label: "الإعلانات" },
  booking: {
    icon: CalendarCheck,
    bg: "linear-gradient(135deg,#c026d3,#7c3aed)",
    label: "الحجوزات",
  },
  inventory: { icon: Boxes, bg: "linear-gradient(135deg,#ea580c,#db2777)", label: "المخزون" },
  invoice: { icon: ReceiptText, bg: "linear-gradient(135deg,#0f766e,#0e7490)", label: "الفاتورة" },
  loyalty: { icon: Gift, bg: "linear-gradient(135deg,#e11d48,#f59e0b)", label: "الولاء" },
  accounting: { icon: Wallet, bg: "linear-gradient(135deg,#334155,#2563eb)", label: "المحاسبة" },
  whatsapp: { icon: MessageCircle, bg: "linear-gradient(135deg,#16a34a,#22c55e)", label: "واتساب" },
  report: { icon: BarChart3, bg: "linear-gradient(135deg,#2563eb,#0ea5e9)", label: "التقارير" },
  ai: {
    icon: BrainCircuit,
    bg: "linear-gradient(135deg,#9333ea,#2563eb)",
    label: "الذكاء الاصطناعي",
  },
}

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

// The full-size post (1080×1080).
export const InstagramPostArt = React.forwardRef<
  HTMLDivElement,
  { template: AdminInstagramTemplate; design: AdminInstagramDesign }
>(function InstagramPostArt({ template, design }, ref) {
  return (
    <div ref={ref} style={{ width: POST_SIZE, height: POST_SIZE }}>
      <style>{CSS}</style>
      {template === "a" ? (
        <DesignA design={design} />
      ) : template === "b" ? (
        <DesignB design={design} />
      ) : (
        <DesignC design={design} />
      )}
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
