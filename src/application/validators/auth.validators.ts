import { z } from "zod"

export const loginRequestDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
})

export const registerRequestDtoSchema = z
  .object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(12),
    organizationName: z.string().min(2).optional(),
    invitationToken: z.string().optional(),
    rememberMe: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.organizationName) || Boolean(value.invitationToken), {
    message: "organizationName is required unless registering via an invitation",
    path: ["organizationName"],
  })

export const forgotPasswordRequestDtoSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordRequestDtoSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
})

export const verifyEmailRequestDtoSchema = z.object({
  token: z.string().min(1),
})
