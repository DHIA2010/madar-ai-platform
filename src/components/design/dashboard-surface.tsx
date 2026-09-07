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

export const DONUT_COLORS = ["#2563eb", "#7c3aed", "#10b981", "#0891b2", "#f59e0b", "#64748b"]

export interface DonutEntry {
  label: string
  value: number
  share: number
  /** Overrides the positional palette, for entries whose colour carries meaning (health states). */
  color?: string
}

interface DonutBreakdownProps {
  entries: DonutEntry[]
  total: number
  /** Caption under the centre figure, e.g. "إجمالي الزوار". */
  centerLabel: string
  emptyLabel: string
}

// The design's donut: a ring of segments with the total in the middle and a legend beside it.
// Shared so the two dashboards built on this design can't drift on segment width or legend
// alignment. A zero total draws a single flat ring rather than dividing by zero.
export function DonutBreakdown({ entries, total, centerLabel, emptyLabel }: DonutBreakdownProps) {
  const radius = 65
  const circumference = 2 * Math.PI * radius
  let cumulative = 0

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <g transform="rotate(-90, 100, 100)">
            {total === 0 ? (
              <circle cx={100} cy={100} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={24} />
            ) : (
              entries.map((entry, index) => {
                const length = (entry.value / total) * circumference
                const offset = -(cumulative / total) * circumference
                cumulative += entry.value
                return (
                  <circle
                    key={entry.label || `entry-${index}`}
                    cx={100}
                    cy={100}
                    r={radius}
                    fill="none"
                    stroke={entry.color ?? DONUT_COLORS[index % DONUT_COLORS.length]}
                    strokeWidth={24}
                    strokeDasharray={`${Math.max(0, length - 2)} ${circumference - length + 2}`}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                  />
                )
              })
            )}
          </g>
          <text
            x="100"
            y="97"
            textAnchor="middle"
            className="fill-[#0d1b3e] text-2xl font-extrabold"
          >
            {total}
          </text>
          <text x="100" y="114" textAnchor="middle" className="fill-[#8098b4] text-[10px]">
            {centerLabel}
          </text>
        </svg>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {entries.length === 0 ? (
          <span className="text-xs text-[#8098b4]">{emptyLabel}</span>
        ) : (
          entries.map((entry, index) => (
            <div key={entry.label || `entry-${index}`} className="flex items-center">
              <div className="flex min-w-0 flex-1 items-center gap-[7px]">
                <div
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: entry.color ?? DONUT_COLORS[index % DONUT_COLORS.length] }}
                />
                <span className="truncate text-[12.5px] font-medium text-[#334155]">
                  {entry.label}
                </span>
              </div>
              <span
                className="min-w-[28px] shrink-0 text-center text-xs font-semibold text-[#0d1b3e]"
                dir="ltr"
              >
                {entry.value}
              </span>
              <span
                className="min-w-[54px] shrink-0 text-left text-[11.5px] text-[#8098b4]"
                dir="ltr"
              >
                ({entry.share}%)
              </span>
            </div>
          ))
        )}
      </div>
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
