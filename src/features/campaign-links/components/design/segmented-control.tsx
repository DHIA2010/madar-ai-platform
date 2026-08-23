import { cn } from "@/lib/utils"

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
}

// Two (or more) equal-width option buttons, each independently bordered -- distinct from a
// merged pill toggle. The selected option gets the primary border/background/text; unselected
// options stay neutral until hovered.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("grid gap-3", options.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isSelected}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
              isSelected
                ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
