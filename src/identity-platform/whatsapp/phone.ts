// A phone number in the international form WhatsApp wants (digits only, country code first).
// Saudi local forms (05XXXXXXXX, 5XXXXXXXX) become 9665XXXXXXXX. Null when it can't be one.
export function toWhatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  if (digits.startsWith("9660")) digits = `966${digits.slice(4)}`
  if (digits.startsWith("966") && !/^9665\d{8}$/.test(digits)) return null
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}
