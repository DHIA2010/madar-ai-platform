import type { AccountActivatedEmail } from "../../application/ports"

// The welcome a customer gets when Madar's sales team activates their account.
export function accountActivatedSubject(input: AccountActivatedEmail) {
  return input.newAccount
    ? `مرحبًا بك في مدار — تم تفعيل حساب ${input.companyName}`
    : `تم تفعيل اشتراكك في مدار — ${input.companyName}`
}

export function accountActivatedText(input: AccountActivatedEmail) {
  return [
    `مرحبًا ${input.fullName}،`,
    "",
    input.newAccount
      ? `تم إنشاء حساب ${input.companyName} في مدار وتفعيل اشتراكك.`
      : `تم تفعيل اشتراكك في مدار لـ ${input.companyName}.`,
    input.applications.length ? `التطبيقات المفعّلة: ${input.applications.join("، ")}` : "",
    "",
    input.newAccount ? `بريد الدخول: ${input.email}` : "",
    input.newAccount
      ? `اضغط الرابط لتعيين كلمة المرور والدخول إلى حسابك (صالح لمدة 7 أيام): ${input.actionUrl}`
      : `ادخل إلى حسابك من هنا: ${input.actionUrl}`,
    "",
    "فريق مدار",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
}
