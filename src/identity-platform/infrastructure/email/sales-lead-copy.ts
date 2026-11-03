import type { SalesLeadEmail } from "../../application/ports"

// The notification Madar's team gets when someone fills madar.my's "talk to sales" form.
export function salesLeadSubject(input: SalesLeadEmail) {
  return `طلب تواصل مع المبيعات: ${input.companyName}`
}

export function salesLeadText(input: SalesLeadEmail) {
  return [
    "طلب جديد للتواصل مع فريق المبيعات من موقع madar.my:",
    "",
    `اسم الشركة: ${input.companyName}`,
    `رقم الجوال: ${input.phone}`,
    `البريد الإلكتروني: ${input.email ?? "—"}`,
    `وقت الطلب: ${input.submittedAt}`,
  ].join("\n")
}
