import { cn } from "@/lib/utils"

export type IconBadgeTone = "primary" | "success" | "neutral" | "info" | "violet" | "warning"

const TONE_CLASSNAMES: Record<IconBadgeTone, string> = {
  primary: "bg-[#EEF2FF] text-[#4F46E5]",
  success: "bg-[#10B981]/10 text-[#10B981]",
  neutral: "bg-[#F8FAFC] text-[#64748B]",
  info: "bg-[#3B82F6]/10 text-[#3B82F6]",
  violet: "bg-[#8B5CF6]/10 text-[#8B5CF6]",
  warning: "bg-[#F59E0B]/10 text-[#F59E0B]",
}

interface IconBadgeProps {
  icon: React.ReactNode
  tone?: IconBadgeTone
  size?: "sm" | "md"
  className?: string
}

// The small rounded-square icon container used throughout the campaign-link dialog: section
// headers, the dialog title, the preview panel header, and the close button. Colors/radius come
// directly from the supplied design spec, not the app's default theme tokens.
export function IconBadge({ icon, tone = "primary", size = "md", className }: IconBadgeProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        size === "md" ? "size-9" : "size-7",
        TONE_CLASSNAMES[tone],
        className
      )}
    >
      {icon}
    </span>
  )
}
