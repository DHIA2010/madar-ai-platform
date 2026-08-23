import { IconBadge } from "./icon-badge"

interface SectionHeaderProps {
  icon: React.ReactNode
  title: React.ReactNode
}

// Icon badge + title, meant as the `title` prop content for AppFormSection so each section
// gets the same "title on the reading-start side, icon badge on the far edge" header used
// throughout the design spec. AppFormSection renders its own `description` prop below this.
export function SectionHeader({ icon, title }: SectionHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <IconBadge icon={icon} />
        <h3 className="text-[16px] font-semibold leading-6 text-[#172033]">{title}</h3>
      </div>
    </div>
  )
}
