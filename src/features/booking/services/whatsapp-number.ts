// A phone number the way wa.me wants it: digits only, with Saudi mobiles given their country code.
export function whatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}
