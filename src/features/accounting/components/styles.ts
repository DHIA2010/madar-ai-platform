// The accounting screens' look -- the same panels and type scale as the other back-office pages
// (each feature keeps its own copy, per this codebase's convention).
export const PANEL =
  "rounded-[18px] border border-[#e4e9f2] bg-white shadow-[0_1px_3px_rgba(11,23,56,0.05)]"
export const HEADING = "text-[#0b1738]"
export const MUTED = "text-[#6b7b96]"
export const FIELD =
  "h-11 w-full rounded-[12px] border border-[#e1e7f0] bg-white px-3 text-[13px] text-[#0b1738] outline-none transition placeholder:text-[#a3b0c6] focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/15 disabled:bg-[#f7f9fc] disabled:text-[#8a97ad]"
export const FIELD_LABEL = "mb-1.5 block text-[12.5px] font-semibold text-[#344054]"
export const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#047857] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#065f46] disabled:cursor-not-allowed disabled:opacity-60"
export const SECONDARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#e1e7f0] bg-white px-4 text-[13px] font-semibold text-[#0b1738] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-60"
// Figures line up when every digit has the same width. No forced direction: a cell that set its
// own direction flipped which side "end" is, so the figures sat on the opposite side from their
// column heading in the Arabic layout. Left alone, a heading and its figures share one edge.
export const AMOUNT = "tabular-nums whitespace-nowrap"
export const TH =
  "border-b border-[#e4e9f2] bg-[#f7f9fc] px-4 py-3 text-start align-middle text-[12px] font-bold whitespace-nowrap text-[#52607a]"
export const TD = "px-4 py-3.5 align-middle text-[13.5px] text-[#0b1738]"
// An account's number beside its name. No forced direction here: with one, the gap lands on the
// outer side of the number in the Arabic layout, leaving it stuck to the name.
export const ACCOUNT_CODE = "me-2 inline-block text-[12px] tabular-nums text-[#6b7b96]"
