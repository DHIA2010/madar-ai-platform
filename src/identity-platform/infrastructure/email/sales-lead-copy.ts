import type { SalesLeadEmail } from "../../application/ports"

// The notification Madar's team gets about a new lead: someone filled madar.my's "talk to sales"
// form, or created an account.
const isSignup = (input: SalesLeadEmail) => input.leadKind === "signup"

export function salesLeadSubject(input: SalesLeadEmail) {
  return isSignup(input)
    ? `حساب جديد في مدار: ${input.companyName}`
    : `طلب تواصل مع المبيعات: ${input.companyName}`
}

export function salesLeadHeading(input: SalesLeadEmail) {
  return isSignup(input) ? "تسجيل حساب جديد في مدار" : "طلب جديد للتواصل مع فريق المبيعات"
}

// The lead's details, one label and value per line.
export function salesLeadRows(input: SalesLeadEmail): [string, string][] {
  return [
    [isSignup(input) ? "الاسم" : "اسم الشركة", input.companyName],
    ["رقم الجوال", input.phone ?? "—"],
    ["البريد الإلكتروني", input.email ?? "—"],
    ["المصدر", input.source ?? "—"],
  ]
}

export function salesLeadText(input: SalesLeadEmail) {
  return [
    isSignup(input)
      ? "تم تسجيل حساب جديد في مدار:"
      : "طلب جديد للتواصل مع فريق المبيعات من موقع madar.my:",
    "",
    ...salesLeadRows(input).map(([label, value]) => `${label}: ${value}`),
    `وقت الطلب: ${input.submittedAt}`,
  ].join("\n")
}
