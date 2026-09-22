const PAGE_SIZE_STYLE_ID = "thermal-receipt-page-size"
const RECEIPT_WIDTH_MM = 72

// A giant fixed @page height (2000mm) was the previous approach, so a receipt would "always" fit
// one page no matter how many line items it had -- but a real printer's OS driver can silently
// clamp a custom page length down to its own advertised maximum, and once the actual content is
// taller than that clamp, the tail (almost always the QR block, being the very last element) gets
// pushed onto a second sheet. Measuring the receipt's real rendered height and asking for only
// that much page (plus a small buffer) never requests more than any driver's real limit was going
// to grant, so nothing gets clamped in the first place.
//
// The print target is normally `display:none` (Tailwind's `hidden print:block`) so it never
// affects normal page layout -- which also means its real height can't be read from the DOM as
// it sits. Forcing it visible off-screen just long enough to measure, then restoring it, gets a
// real number without ever flashing it on screen (both happen synchronously, no yield in between).
export function printThermalReceipt(targetElementId: string) {
  const target = document.getElementById(targetElementId)
  let heightMm = 2000

  if (target) {
    const previousCssText = target.style.cssText
    target.style.cssText = `${previousCssText}; display: block !important; position: fixed !important; left: -99999px !important; top: 0 !important; width: ${RECEIPT_WIDTH_MM}mm !important; visibility: hidden !important;`
    const heightPx = target.scrollHeight
    target.style.cssText = previousCssText

    if (heightPx > 0) {
      // 96 CSS px/inch, 25.4mm/inch; +8mm covers rounding and keeps the last element from ever
      // landing exactly on the page boundary.
      heightMm = Math.ceil((heightPx / 96) * 25.4) + 8
    }
  }

  let pageSizeStyle = document.getElementById(PAGE_SIZE_STYLE_ID) as HTMLStyleElement | null
  if (!pageSizeStyle) {
    pageSizeStyle = document.createElement("style")
    pageSizeStyle.id = PAGE_SIZE_STYLE_ID
    document.head.appendChild(pageSizeStyle)
  }
  pageSizeStyle.textContent = `@page { size: ${RECEIPT_WIDTH_MM}mm ${heightMm}mm; margin: 0; }`

  window.print()
}
