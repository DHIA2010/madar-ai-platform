import { getTranslations } from "next-intl/server"
import { CreditCard, Megaphone, Monitor, Plus, Printer, ShoppingBag, Store } from "lucide-react"

import { PlatformBadge } from "@/components/platform-badge"

// Real logo assets only exist for Shopify/Salla/Zid (see platform-badge.tsx) -- WooCommerce falls
// back to a plain icon chip rather than inventing a new brand image asset, same convention
// platform-chip.tsx already established for this exact gap.
function WooCommerceBadge() {
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-border/50">
      <ShoppingBag className="size-4 text-[#96588a]" />
    </span>
  )
}

function MoreBadge() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-border/50">
      <Plus className="size-4" />
    </span>
  )
}

function ConnectorLine() {
  return <span className="h-5 w-px border-s border-dashed border-slate-300" aria-hidden="true" />
}

function ConnectorBox({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/85 p-3.5 shadow-sm backdrop-blur">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className={tone}>
          <Icon className="size-3.5" />
        </span>
        <p className="text-[11px] font-semibold text-slate-700">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

// The richer "ecosystem" illustration shown only on the login page -- ad platforms and
// e-commerce platforms (real logos via PlatformBadge) feeding into the dashboard preview
// (`children`), with POS feeding in from below.
export async function AuthPlatformConnector({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth.login.showcase.connector")

  return (
    <div className="flex flex-col items-center gap-0">
      <div className="grid w-full grid-cols-2 gap-3">
        <ConnectorBox title={t("adPlatforms")} icon={Megaphone} tone="text-violet-600">
          <PlatformBadge platform="Google Ads" className="size-9" />
          <PlatformBadge platform="Meta" className="size-9" />
          <PlatformBadge platform="TikTok" className="size-9" />
          <PlatformBadge platform="Snapchat" className="size-9" />
          <MoreBadge />
        </ConnectorBox>
        <ConnectorBox title={t("ecommercePlatforms")} icon={Store} tone="text-emerald-600">
          <PlatformBadge platform="Shopify" className="size-9" />
          <PlatformBadge platform="Salla" className="size-9" />
          <PlatformBadge platform="Zid" className="size-9" />
          <WooCommerceBadge />
          <MoreBadge />
        </ConnectorBox>
      </div>

      <ConnectorLine />
      {children}
      <ConnectorLine />

      <div className="w-full">
        <ConnectorBox title={t("pos")} icon={Monitor} tone="text-blue-600">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Monitor className="size-4" />
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Printer className="size-4" />
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CreditCard className="size-4" />
          </span>
        </ConnectorBox>
      </div>
    </div>
  )
}
