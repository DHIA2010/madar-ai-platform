// The loyalty screens' look -- the same panels and type scale as the other back-office pages
// (each feature keeps its own copy, per this codebase's convention), with the app's own rose.
export const ACCENT = "#be185d"
export const PANEL =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"
export const HEADING = "text-[#0b1738]"
export const MUTED = "text-[#6b7b96]"
export const FIELD =
  "h-11 w-full rounded-[12px] border border-[#e1e7f0] bg-white px-3 text-[13px] text-[#0b1738] outline-none transition placeholder:text-[#a3b0c6] focus:border-[#be185d] focus:ring-2 focus:ring-[#be185d]/15 disabled:bg-[#f7f9fc] disabled:text-[#8a97ad]"
export const TEXTAREA =
  "w-full rounded-[12px] border border-[#e1e7f0] bg-white px-3 py-2.5 text-[13px] text-[#0b1738] outline-none transition placeholder:text-[#a3b0c6] focus:border-[#be185d] focus:ring-2 focus:ring-[#be185d]/15"
export const FIELD_LABEL = "mb-1.5 block text-[12.5px] font-semibold text-[#344054]"
export const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#be185d] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#9d174d] disabled:cursor-not-allowed disabled:opacity-60"
export const SECONDARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-4 text-[13px] font-semibold text-[#0b1738] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
export const DANGER_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#fecdca] bg-white px-4 text-[13px] font-semibold text-[#b42318] transition hover:bg-[#fef3f2] disabled:cursor-not-allowed disabled:opacity-60"
export const ICON_BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e1e7f0] bg-white text-[#52607a] transition hover:bg-[#f7f9fc]"
export const TH =
  "border-b border-[#e4e9f2] bg-[#f7f9fc] px-4 py-3 text-start align-middle text-[12px] font-bold whitespace-nowrap text-[#52607a]"
export const TD = "px-4 py-3.5 align-middle text-[13.5px] text-[#0b1738]"

// The colours a card can be given at a tap; any other colour can be typed.
export const CARD_COLORS = [
  "#0b1738",
  "#111827",
  "#be185d",
  "#6d28d9",
  "#1d4fd8",
  "#0e7490",
  "#137a41",
  "#b54708",
  "#b42318",
  "#f5f0e6",
]
export const TEXT_COLORS = ["#ffffff", "#0b1738", "#fde68a", "#f5f0e6"]
