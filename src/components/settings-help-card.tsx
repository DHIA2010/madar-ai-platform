import { ExternalLink } from "lucide-react"

import { MADAR_CONTACT_EMAIL } from "@/features/marketing-site/marketing-constants"

// Lives in the main sidebar under its الإعدادات entry (see nav-main.tsx), not inside the settings
// screens' own rail -- moved there so it reads as part of the primary navigation rather than a
// footnote on one page's sub-nav. The action goes to the contact address the product already
// publishes on its privacy and terms pages; inventing a support desk that does not exist would be
// worse than reusing the real one.
export function SettingsHelpCard() {
  return (
    <div className="rounded-[12px] border border-[#e8edf3] bg-[#eff6ff] p-3.5">
      <p className="mb-1.5 text-[12.5px] font-bold text-[#0d1b3e]">تحتاج مساعدة؟</p>
      <p className="mb-2.5 text-[11.5px] leading-[1.6] text-[#8098b4]">
        تواصل مع فريق الدعم للمساعدة في الإعدادات.
      </p>
      <a
        href={`mailto:${MADAR_CONTACT_EMAIL}`}
        className="flex items-center gap-1 text-[12px] font-semibold text-[#2563eb] hover:underline"
      >
        <ExternalLink className="size-3" />
        تواصل معنا
      </a>
    </div>
  )
}
