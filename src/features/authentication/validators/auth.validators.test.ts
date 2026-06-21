import { describe, expect, it } from "vitest"

import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from "./"

describe("auth validators", () => {
  it("accepts valid login payload", () => {
    const parsed = loginSchema.safeParse({
      email: "user@madar.ai",
      password: "password123",
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

  it("rejects mismatched signup passwords", () => {
    const parsed = signupSchema.safeParse({
      fullName: "Demo",
      email: "user@madar.ai",
      password: "password123",
      confirmPassword: "different-password",
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
      password: "password123",
      confirmPassword: "password123",
    })

    expect(parsed.success).toBe(true)
  })
})
