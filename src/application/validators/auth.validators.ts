import { z } from "zod"

export const loginRequestDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
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
