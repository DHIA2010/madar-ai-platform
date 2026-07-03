import { describe, expect, it } from "vitest"

import { hashPassword, signJwt, verifyJwt, verifyPassword } from "../security"

describe("identity security", () => {
  it("hashes and verifies password", () => {
    const password = "VeryStrongPassword123!"
    const encoded = hashPassword(password)

    expect(verifyPassword(password, encoded)).toBe(true)
    expect(verifyPassword("invalid", encoded)).toBe(false)
  })

  it("signs and verifies jwt", () => {
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt(
      {
        sub: "user-1",
        sid: "session-1",
        org: "org-1",
        typ: "access",
        iat: now,
        exp: now + 60,
        jti: "jti-1",
      },
      "test-secret"
    )

    const payload = verifyJwt(token, "test-secret")
    expect(payload?.sub).toBe("user-1")
    expect(payload?.sid).toBe("session-1")
  })
})
