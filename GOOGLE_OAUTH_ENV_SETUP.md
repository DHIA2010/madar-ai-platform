# GOOGLE_OAUTH_ENV_SETUP

Date: 2026-06-28
Purpose: Production-ready local runtime configuration for Google OAuth without changing application code.

## 1. Required Environment Variables

Use these variables in .env.local for local runtime.

1. Variable name: IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID
- Required format: Non-empty Google OAuth Web Client ID string.
- Example (safe placeholder): YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
- Required or optional: Required

2. Variable name: IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET
- Required format: Non-empty Google OAuth client secret string.
- Example (safe placeholder): YOUR_GOOGLE_CLIENT_SECRET
- Required or optional: Required

3. Variable name: IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI
- Required format: Valid absolute URL.
- Rule: Must be https, or http only for localhost/127.0.0.1/::1.
- Example (safe placeholder): http://localhost:4000/v1/integrations/google/oauth/callback
- Required or optional: Required

4. Variable name: IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI
- Required format: Valid absolute URL.
- Rule: Must be https, or http only for localhost/127.0.0.1/::1.
- Example (safe placeholder): http://localhost:3000/integrations/new
- Required or optional: Required

5. Variable name: IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY
- Required format: Valid key accepted by normalizeEncryptionKey.
- Example (safe placeholder): (see Section 3)
- Required or optional: Required unless fallback key below is valid.

6. Variable name: IDENTITY_PLATFORM_TOKEN_HASH_SECRET
- Required format: String secret. This is the OAuth token key fallback when IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is absent.
- Example (safe placeholder): YOUR_TOKEN_HASH_SECRET
- Required or optional: Conditionally required as fallback.

7. Variable name: IDENTITY_PLATFORM_GOOGLE_OAUTH_SCOPES
- Required format: Comma-separated scope list.
- Example (safe placeholder): https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,openid
- Required or optional: Optional (defaults exist)

8. Variable name: NEXT_PUBLIC_APP_URL
- Required format: Valid absolute URL.
- Example (safe placeholder): http://localhost:3000
- Required or optional: Optional for OAuth start when success URI is explicitly set, otherwise needed for default success redirect.

Operational note:
- Empty value counts as missing for OAuth startup checks.

## 2. Google Cloud Console Setup

Configure one OAuth 2.0 Client in Google Cloud Console:

1. OAuth Client Type
- Web application

2. Authorized Redirect URI
- Must exactly match IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI.
- Local example: http://localhost:4000/v1/integrations/google/oauth/callback

3. Authorized JavaScript Origins
- Frontend origin used to initiate connection.
- Local example: http://localhost:3000

4. Scopes required
- Required by backend scope validation: https://www.googleapis.com/auth/adwords
- Recommended full set used by default runtime: 
  - https://www.googleapis.com/auth/adwords
  - https://www.googleapis.com/auth/userinfo.email
  - https://www.googleapis.com/auth/userinfo.profile
  - openid

## 3. Encryption Key

normalizeEncryptionKey accepts exactly one of these formats:

1. Hex format
- Length: 64 hex characters
- Encoding: Hex
- Example format: 0123abcd... (64 total hex chars)

2. Base64 format
- Length rule: Must decode to exactly 32 bytes
- Encoding: Base64
- Example format: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

3. Raw UTF-8 format
- Length: Exactly 32 characters
- Encoding: Plain UTF-8 string
- Example format: Abcdefghijklmnopqrstuvwxyz123456

How to generate a valid key:

1. Hex (64 chars)
- openssl rand -hex 32

2. Base64 (32-byte key)
- openssl rand -base64 32

3. 32-char raw string
- Generate a random 32-character high-entropy value from a secure password manager.

Important:
- If IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY is set, it must be valid.
- If not set, IDENTITY_PLATFORM_TOKEN_HASH_SECRET must be valid for normalizeEncryptionKey fallback.

## 4. Runtime Verification

Run backend with local DB/Redis variables as needed:

1. Start backend
- IDENTITY_PLATFORM_POSTGRES_URL=postgresql://madar:madar_password@localhost:5432/madar IDENTITY_PLATFORM_REDIS_URL=redis://localhost:6379 npm run identity:dev

2. Verify process has required OAuth variables
- ps eww -p <BACKEND_PID> | tr ' ' '\n' | grep -E '^(IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID|IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET|IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI|IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI|IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY|IDENTITY_PLATFORM_TOKEN_HASH_SECRET)='

3. Get token and workspace id
- TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login -H 'content-type: application/json' -d '{"email":"admin@madar.local","password":"MadarAdmin123!"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const o=JSON.parse(d);process.stdout.write(o.session.accessToken);});")
- WORKSPACE_ID=$(curl -s -X GET http://localhost:4000/v1/workspaces -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const o=JSON.parse(d);process.stdout.write(o.items?.[0]?.workspace?.id ?? '');});")

4. Call OAuth start
- curl -i -s -X POST http://localhost:4000/v1/integrations/google/oauth/start -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"projectId\":null,\"connectionName\":\"Google Ads Connection\"}"

Expected result after correct configuration:
- API path: HTTP 200 with authorizationUrl containing accounts.google.com
- Browser connection flow: redirect to Google login page on accounts.google.com

If your runtime/proxy layer is configured to follow redirects directly from start endpoint, it may appear as HTTP 302.

Failure indicator to eliminate:
- GOOGLE_OAUTH_CONFIGURATION_ERROR

## 5. Final Checklist

- [ ] Google Client ID configured and non-empty
- [ ] Google Client Secret configured and non-empty
- [ ] Redirect URI configured and exactly matches Google Cloud Console
- [ ] Success Redirect URI configured and valid
- [ ] Encryption key is present and valid format for normalizeEncryptionKey
- [ ] Backend startup loads .env.local
- [ ] OAuth Start returns success (HTTP 200 with authorizationUrl, or HTTP 302 via runtime redirect setup)
- [ ] Browser opens Google login page on accounts.google.com
- [ ] Callback endpoint returns to frontend success route
- [ ] Connection is created after successful callback
