# GOOGLE_OAUTH_ENCRYPTION_KEY_AUDIT

Date: 2026-06-29
Mode: Read-only runtime investigation

## Goal
Resolve contradiction between:
- report A: encryption key exists but invalid format
- report B: runtime value length is 0

Both are correct for different inputs in the same resolution path.

## 1) Inspect .env.local

Findings:
- .env.local contains IDENTITY_PLATFORM_TOKEN_HASH_SECRET at line 25
- .env.local does not contain IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY

References:
- [.env.local](.env.local#L25)
- [.env.example](.env.example#L38)

## 2) Exact variable name expected by code

Expected primary variable:
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY

From config builder in service:
- tokenEncryptionKey resolves from:
  1. process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY
  2. fallback process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET
  3. fallback empty string

Reference:
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L58)

## 3) Exact variable name currently present in .env.local

Present related variable:
- IDENTITY_PLATFORM_TOKEN_HASH_SECRET

Missing expected primary variable:
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY

Reference:
- [.env.local](.env.local#L25)

## 4) Do names match exactly?

No.

Expected:
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY

Present in .env.local:
- IDENTITY_PLATFORM_TOKEN_HASH_SECRET

These are different names.

## 5) Runtime value length

Primary expected variable runtime value:
- process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY = undefined
- length = undefined (missing)

Effective key passed to normalizeEncryptionKey after fallback:
- falls back to IDENTITY_PLATFORM_TOKEN_HASH_SECRET
- effective length = 42

## 6) Runtime value status

For expected variable:
- missing: YES
- empty: NO
- whitespace: NO

For effective value actually validated:
- missing: NO
- empty: NO
- whitespace: NO
- invalid format: YES
- valid: NO

## 7) normalizeEncryptionKey implementation and accepted formats

Implementation source:
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L65)

Implementation:

function normalizeEncryptionKey(input: string) {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex")
  }

  try {
    const decoded = Buffer.from(trimmed, "base64")
    if (decoded.length === 32) {
      return decoded
    }
  } catch {
    // Ignore and fallback.
  }

  if (trimmed.length === 32) {
    return Buffer.from(trimmed, "utf8")
  }

  throw new Error("GOOGLE_OAUTH_CONFIGURATION_ERROR")
}

Accepted key formats:
- 64 hex characters (matches regex ^[0-9a-fA-F]{64}$)
- Base64 string that decodes to exactly 32 bytes
- Plain UTF-8 string of exactly 32 characters

Rejected format:
- Any other length/encoding, including current 42-char fallback value

## 8) Why service.ts:95 throws GOOGLE_OAUTH_CONFIGURATION_ERROR

During ensureConfigured, service validates tokenEncryptionKey by calling normalizeEncryptionKey.

Runtime resolution path currently is:
1. IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is missing
2. fallback to IDENTITY_PLATFORM_TOKEN_HASH_SECRET from .env.local
3. fallback value length is 42
4. 42-char value fails all accepted normalizeEncryptionKey formats
5. normalizeEncryptionKey throws GOOGLE_OAUTH_CONFIGURATION_ERROR at line 95

References:
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L187)
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L95)

## Final

Expected env variable:
IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY

Actual env variable:
IDENTITY_PLATFORM_TOKEN_HASH_SECRET

Runtime length:
Expected variable: missing (undefined)
Effective validated value: 42

Runtime status:
Expected variable is missing; effective fallback value is invalid format

Accepted formats:
64 hex chars OR base64 decoding to 32 bytes OR UTF-8 length 32

Root cause:
Primary Google OAuth encryption key variable is not configured in .env.local, so runtime falls back to token hash secret (length 42), which fails normalizeEncryptionKey format validation

File:
src/identity-platform/google-oauth/service.ts

Line:
95
