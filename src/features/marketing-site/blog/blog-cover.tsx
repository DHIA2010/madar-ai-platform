import { Boxes, Megaphone, ReceiptText, Store } from "lucide-react"

import { cn } from "@/lib/utils"

import type { BlogCategory } from "./posts"

export const CATEGORY_ICON = {
  campaigns: Megaphone,
  invoicing: ReceiptText,
  ecommerce: Store,
  inventory: Boxes,
} as const

const COVERS: Record<
  BlogCategory,
  { icon: (typeof CATEGORY_ICON)[BlogCategory]; gradient: string; chips: readonly string[] }
> = {
  campaigns: {
    icon: Megaphone,
    gradient: "from-[#7c3aed] via-[#2563eb] to-[#0b1738]",
    chips: ["4.8x", "ROAS", "+212", "CTR", "UTM", "3.1x"],
  },
  invoicing: {
    icon: ReceiptText,
    gradient: "from-[#0f766e] via-[#0e7490] to-[#0b1738]",
    chips: ["QR", "15٪", "B2C", "VAT", "B2B", "ZATCA"],
  },
  ecommerce: {
    icon: Store,
    gradient: "from-[#0284c7] via-[#0d9488] to-[#0b1738]",
    chips: ["2.4٪", "+34", "SAR", "128", "AOV", "+7"],
  },
  inventory: {
    icon: Boxes,
    gradient: "from-[#ea580c] via-[#db2777] to-[#0b1738]",
    chips: ["-2", "+1", "TRF", "0", "TRF-0012", "+5"],
  },
}

// Brand artwork standing in for a photo: the post's theme icon over a gradient, with a few
// floating "data" chips.
export function BlogCover({
  category,
  variant = 0,
  size = "card",
  className,
}: {
  category: BlogCategory
  // Varies the artwork between posts of the same section (see coverVariant).
  variant?: number
  size?: "card" | "hero"
  className?: string
}) {
  const { icon: Icon, gradient, chips: pool } = COVERS[category]
  const chips = pool
    .slice(variant * 2, variant * 2 + 3)
    .concat(pool)
    .slice(0, 3)
  const hero = size === "hero"
  return (
    <div
      aria-hidden
      className={cn(
        "relative isolate overflow-hidden",
        ["bg-gradient-to-br", "bg-gradient-to-bl", "bg-gradient-to-tr"][variant],
        gradient,
        hero ? "aspect-[21/9]" : "aspect-[16/9]",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.14)_1px,transparent_0)] bg-[size:22px_22px]" />
      <div className="absolute -top-16 -end-10 size-56 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-20 -start-10 size-64 rounded-full bg-white/10 blur-3xl" />

      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "flex items-center justify-center rounded-[28px] bg-white/15 text-white shadow-[0_20px_50px_-10px_rgba(0,0,0,0.35)] ring-1 ring-white/25 backdrop-blur",
            hero ? "size-28" : "size-20"
          )}
        >
          <Icon className={hero ? "size-14" : "size-10"} strokeWidth={1.75} />
        </span>
      </div>

      {chips.map((chip, index) => (
        <span
          key={chip}
          dir="ltr"
          className={cn(
            "absolute rounded-xl bg-white/90 px-3 py-1.5 font-black text-[#0b1738] shadow-lg",
            hero ? "text-[15px]" : "text-[12px]",
            index === 0 && "top-[18%] start-[14%] rotate-[-6deg]",
            index === 1 && "bottom-[20%] start-[22%] rotate-[4deg]",
            index === 2 && "top-[24%] end-[14%] rotate-[5deg]"
          )}
        >
          {chip}
        </span>
      ))}
    </div>
  )
}
