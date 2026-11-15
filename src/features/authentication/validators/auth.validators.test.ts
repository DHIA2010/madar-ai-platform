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

  const signup = {
    fullName: "Demo",
    companyName: "Madar",
    phone: "055 123 4567",
    email: "user@madar.ai",
    password: "password12345",
    confirmPassword: "password12345",
  }

  it("accepts a complete signup payload", () => {
    expect(signupSchema.safeParse(signup).success).toBe(true)
    // Arabic digits and an international prefix are fine too.
    expect(signupSchema.safeParse({ ...signup, phone: "+٩٦٦٥٥١٢٣٤٥٦٧" }).success).toBe(true)
  })

  it("rejects mismatched signup passwords", () => {
    const parsed = signupSchema.safeParse({ ...signup, confirmPassword: "different-password123" })
    expect(parsed.success).toBe(false)
  })

  it("rejects a signup without a company name or a real phone number", () => {
    expect(signupSchema.safeParse({ ...signup, companyName: "" }).success).toBe(false)
    expect(signupSchema.safeParse({ ...signup, phone: "abc" }).success).toBe(false)
    expect(signupSchema.safeParse({ ...signup, phone: "" }).success).toBe(false)
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
