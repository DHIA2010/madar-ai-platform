import type { StoreWelcomeEmail } from "../../application/ports"

// Shared subject/plain-text for the store welcome email (Resend renders its own HTML around it).
export function storeWelcomeSubject(input: StoreWelcomeEmail): string {
  return input.password
    ? `مرحباً بك في مدار -- حسابك لمتجر ${input.storeName} جاهز`
    : `تم ربط متجر ${input.storeName} بحسابك في مدار`
}

export function storeWelcomeText(input: StoreWelcomeEmail): string {
  const intro = `تم ربط متجرك ${input.storeName} على ${input.platformName} بمدار وتفعيل تطبيق المتاجر الإلكترونية.`
  return input.password
    ? [
        intro,
        `البريد الإلكتروني: ${input.email}`,
        `كلمة المرور: ${input.password}`,
        `رابط مدار: ${input.loginUrl}`,
        "يمكنك تغيير كلمة المرور في أي وقت من الإعدادات.",
        "",
        `Your MADAR account for ${input.storeName} is ready. Email: ${input.email} / Password: ${input.password}. Sign in: ${input.loginUrl}`,
      ].join("\n")
    : [
        intro,
        `تمت إضافة المتجر إلى حسابك الحالي (${input.email}). سجّل الدخول من: ${input.loginUrl}`,
        "",
        `${input.storeName} was connected to your existing MADAR account. Sign in: ${input.loginUrl}`,
      ].join("\n")
}
