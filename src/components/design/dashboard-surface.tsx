import { cn } from "@/lib/utils"

// Shared surface primitives for the dashboard design (the live-visitors Figma). Extracted here
// rather than duplicated per page so the two screens built on it -- live visitors and
// integrations -- can't drift on a border colour or a shadow. Deliberately not in
// src/components/ui: features are barred from importing that directory
// (.dependency-cruiser.cjs "feature-no-ui-primitives"), and the integrations page lives in
// src/features.
//
// Colours are literal rather than theme tokens because the design specifies them directly, the
// same way src/features/campaign-links/components/design already does for its own spec.
export const SURFACE = {
  navy: "#0d1b3e",
  body: "#334155",
  muted: "#8098b4",
  mutedLight: "#b0c0d4",
  border: "#e8edf3",
  page: "#f1f5f9",
  subtle: "#f8fafc",
} as const

export const SURFACE_CARD_CLASS =
  "rounded-xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

interface KpiCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: React.ReactNode
  /** Background utility for the 42px icon tile, e.g. "bg-[#f5f3ff]". */
  iconClassName: string
  /** Widens the card relative to its siblings, for long values like money totals. */
  wide?: boolean
  className?: string
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  iconClassName,
  wide,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        SURFACE_CARD_CLASS,
        "flex min-h-[100px] min-w-0 shrink flex-col gap-1.5 px-[18px] py-4",
        className
      )}
      style={{ flexGrow: wide ? 1.6 : 1, flexBasis: 0 }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 text-xs font-medium text-[#8098b4]">{label}</div>
          <div className="text-[26px] font-extrabold leading-[1.1] text-[#0d1b3e]" dir="ltr">
            {value}
          </div>
        </div>
        <div
          className={cn(
            "flex size-[42px] shrink-0 items-center justify-center rounded-[10px]",
            iconClassName
          )}
        >
          {icon}
        </div>
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-[#8098b4]">{hint}</div> : null}
    </div>
  )
}

interface SurfaceCardProps {
  title: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

// A titled white panel: header row with a bottom rule, then arbitrary content.
export function SurfaceCard({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: SurfaceCardProps) {
  return (
    <div className={cn(SURFACE_CARD_CLASS, "flex flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[#e8edf3] px-[18px] py-4">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-sm font-bold text-[#0d1b3e]">{title}</span>
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

interface PageHeadingProps {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeading({ title, subtitle, badge, actions }: PageHeadingProps) {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold leading-[1.3] text-[#0d1b3e]">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="text-[12.5px] text-[#8098b4]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

// The green "live" pill from the design. Only meaningful where something really is updating on
// its own -- it animates, and a static page wearing it would be lying.
export function LivePill({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-[20px] border border-[#d1fae5] bg-[#ecfdf5] px-2.5 py-[3px]">
      <span className="size-[7px] animate-pulse rounded-full bg-[#10b981]" />
      <span className="text-xs font-semibold text-[#10b981]">{label}</span>
    </div>
  )
}
