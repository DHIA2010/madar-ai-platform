import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

import type { AccessTokenPayload, PasswordHasher, TokenService } from "../../application/ports"

const PASSWORD_SALT_BYTES = 16
const PASSWORD_KEY_LENGTH = 64

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + pad, "base64")
}

export class ScryptPasswordHasher implements PasswordHasher {
  hash(plainText: string): string {
    const salt = randomBytes(PASSWORD_SALT_BYTES)
    const key = scryptSync(plainText, salt, PASSWORD_KEY_LENGTH)
    return `${salt.toString("hex")}:${key.toString("hex")}`
  }

  verify(plainText: string, encodedHash: string): boolean {
    const [saltHex, keyHex] = encodedHash.split(":")
    if (!saltHex || !keyHex) {
      return false
    }
    const salt = Buffer.from(saltHex, "hex")
    const expected = Buffer.from(keyHex, "hex")
    const actual = scryptSync(plainText, salt, PASSWORD_KEY_LENGTH)
    return timingSafeEqual(expected, actual)
  }
}

export class HmacTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly tokenHashSecret: string = secret
  ) {}

  generateOpaqueToken(): string {
    return base64UrlEncode(randomBytes(48))
  }

  hashOpaqueToken(token: string): string {
    return createHmac("sha256", this.tokenHashSecret).update(token).digest("hex")
  }

  signAccessToken(payload: AccessTokenPayload): string {
    const header = { alg: "HS256", typ: "JWT" }
    const encodedHeader = base64UrlEncode(JSON.stringify(header))
    const encodedPayload = base64UrlEncode(JSON.stringify(payload))
    const signingInput = `${encodedHeader}.${encodedPayload}`
    const signature = base64UrlEncode(
      createHmac("sha256", this.secret).update(signingInput).digest()
    )
    return `${signingInput}.${signature}`
  }

  verifyAccessToken(token: string): AccessTokenPayload | null {
    const segments = token.split(".")
    if (segments.length !== 3) {
      return null
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments
    const signingInput = `${encodedHeader}.${encodedPayload}`
    const expectedSignature = createHmac("sha256", this.secret).update(signingInput).digest()
    const actualSignature = base64UrlDecode(encodedSignature)
    if (expectedSignature.length !== actualSignature.length) {
      return null
    }
    if (!timingSafeEqual(expectedSignature, actualSignature)) {
      return null
    }
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload).toString("utf8")
    ) as AccessTokenPayload
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }
    return payload
  }
}
