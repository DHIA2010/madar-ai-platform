import { z } from "zod"

export const loginSchema = z.object({
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
  password: z.string().min(8, "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل."),
  rememberMe: z.boolean().optional(),
})

const signupBaseFields = {
  fullName: z.string().trim().min(2, "يجب أن يتكون الاسم الكامل من حرفين على الأقل."),
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
  password: z.string().min(12, "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل."),
  confirmPassword: z.string().min(1, "يرجى تأكيد كلمة المرور."),
}

// The number as it is sent: Arabic digits turned into Latin ones, spaces and dashes dropped.
export function normalizePhone(value: string): string {
  return value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s-]/g, "")
}

const passwordsMatch = {
  path: ["confirmPassword"],
  message: "كلمتا المرور غير متطابقتين.",
}

// The whole sign-up form, one step: who you are, your company, and a password.
export const signupSchema = z
  .object({
    ...signupBaseFields,
    companyName: z.string().trim().min(2, "يجب أن يتكون اسم الشركة من حرفين على الأقل."),
    phone: z
      .string()
      .refine((value) => /^\+?\d{7,15}$/.test(normalizePhone(value)), "يرجى إدخال رقم جوال صحيح."),
  })
  .refine((value) => value.password === value.confirmPassword, passwordsMatch)

// Used when signing up via an invitation link: the account joins an existing organization, so
// the company and its contact number aren't asked for.
export const signupInvitationSchema = z
  .object({
    ...signupBaseFields,
    companyName: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, passwordsMatch)

export const forgotPasswordSchema = z.object({
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
})

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "رمز إعادة التعيين مطلوب."),
    password: z.string().min(12, "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل."),
    confirmPassword: z.string().min(12, "يرجى تأكيد كلمة المرور."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين.",
  })

export type LoginFormValues = z.infer<typeof loginSchema>
export type SignupFormValues = z.infer<typeof signupSchema>
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
