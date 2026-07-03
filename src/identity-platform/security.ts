import { HmacTokenService, ScryptPasswordHasher } from "./infrastructure/jwt/token-service"
import { InMemoryRateLimiter } from "./infrastructure/redis/in-memory-rate-limiter"

export type JwtPayload = import("./application/ports").AccessTokenPayload

const defaultTokenService = new HmacTokenService(process.env.IDENTITY_PLATFORM_JWT_SECRET ?? "dev_identity_secret_change_me")
const defaultPasswordHasher = new ScryptPasswordHasher()

export function hashPassword(plainText: string): string {
  return defaultPasswordHasher.hash(plainText)
}

export function verifyPassword(plainText: string, encodedHash: string): boolean {
  return defaultPasswordHasher.verify(plainText, encodedHash)
}

export function hashOpaqueToken(token: string): string {
  return defaultTokenService.hashOpaqueToken(token)
}

export function generateOpaqueToken(): string {
  return defaultTokenService.generateOpaqueToken()
}

export function signJwt(payload: JwtPayload, secret: string): string {
  return new HmacTokenService(secret).signAccessToken(payload)
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  return new HmacTokenService(secret).verifyAccessToken(token)
}

export { InMemoryRateLimiter }
