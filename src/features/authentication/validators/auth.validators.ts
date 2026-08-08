import { z } from "zod"

export const loginSchema = z.object({
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
  password: z.string().min(8, "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل."),
  rememberMe: z.boolean().optional(),
})

const signupBaseFields = {
  fullName: z.string().min(2, "يجب أن يتكون الاسم الكامل من حرفين على الأقل."),
  email: z.email("يرجى إدخال بريد إلكتروني صحيح."),
  password: z.string().min(12, "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل."),
  confirmPassword: z.string().min(12, "يرجى تأكيد كلمة المرور."),
  jobRole: z.string().min(1, "يرجى اختيار دورك الوظيفي."),
  acceptTerms: z.boolean().refine((value) => value === true, {
    message: "يجب الموافقة على الشروط والأحكام وسياسة الخصوصية.",
  }),
}

export const signupSchema = z
  .object({
    ...signupBaseFields,
    companyName: z.string().min(2, "يجب أن يتكون اسم الشركة من حرفين على الأقل."),
    industry: z.string().min(1, "يرجى اختيار مجال عملك."),
    companySize: z.string().min(1, "يرجى اختيار حجم الشركة."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين.",
  })

// Used when signing up via an invitation link: the account joins an existing
// organization, so company details aren't collected or required.
export const signupInvitationSchema = z
  .object({
    ...signupBaseFields,
    companyName: z.string().optional(),
    industry: z.string().optional(),
    companySize: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين.",
  })

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
