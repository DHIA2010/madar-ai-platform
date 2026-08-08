import { describe, expect, it } from "vitest"

import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "./"

describe("auth validators", () => {
  it("accepts valid login payload", () => {
    const parsed = loginSchema.safeParse({
      email: "user@madar.ai",
      password: "password12345",
      rememberMe: true,
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects invalid login payload", () => {
    const parsed = loginSchema.safeParse({
      email: "invalid-email",
      password: "123",
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts a complete signup payload", () => {
    const parsed = signupSchema.safeParse({
      fullName: "Demo",
      email: "user@madar.ai",
      password: "password12345",
      confirmPassword: "password12345",
      jobRole: "marketing-manager",
      acceptTerms: true,
      companyName: "Madar",
      industry: "ecommerce",
      companySize: "1-10",
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects mismatched signup passwords", () => {
    const parsed = signupSchema.safeParse({
      fullName: "Demo",
      email: "user@madar.ai",
      password: "password12345",
      confirmPassword: "different-password123",
      jobRole: "marketing-manager",
      acceptTerms: true,
      companyName: "Madar",
      industry: "ecommerce",
      companySize: "1-10",
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects signup payload missing required onboarding fields", () => {
    const parsed = signupSchema.safeParse({
      fullName: "Demo",
      email: "user@madar.ai",
      password: "password12345",
      confirmPassword: "password12345",
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts forgot password payload", () => {
    const parsed = forgotPasswordSchema.safeParse({
      email: "user@madar.ai",
    })

    expect(parsed.success).toBe(true)
  })

  it("validates reset password payload", () => {
    const parsed = resetPasswordSchema.safeParse({
      token: "reset-token",
      password: "password12345",
      confirmPassword: "password12345",
    })

    expect(parsed.success).toBe(true)
  })
})
