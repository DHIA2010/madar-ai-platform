# GOOGLE_ENV_FINAL_AUDIT

Date: 2026-06-29
Scope: Google OAuth runtime configuration only (read-only)

## 1) IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID present in project env files?

YES.

Found in:
- [ .env.local ](.env.local#L31): IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID=
- [ .env.example ](.env.example#L34): IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID=

Value state:
- Empty string in both files (no configured value).

## 2) IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET present in project env files?

YES.

Found in:
- [ .env.local ](.env.local#L32): IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET=
- [ .env.example ](.env.example#L35): IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET=

Value state:
- Empty string in both files (no configured value).

## 3) If present, which file/line and why runtime reads empty?

Files and lines:
- Client ID:
  - [ .env.local ](.env.local#L31)
  - [ .env.example ](.env.example#L34)
- Client Secret:
  - [ .env.local ](.env.local#L32)
  - [ .env.example ](.env.example#L35)

Why runtime is empty:
- Backend startup loads env files in [ src/identity-platform/server.ts ](src/identity-platform/server.ts#L7).
- Loading sequence is implemented as:
  1. load .env.local first if it exists ([ src/identity-platform/server.ts ](src/identity-platform/server.ts#L12))
  2. then load .env if it exists ([ src/identity-platform/server.ts ](src/identity-platform/server.ts#L16))
- In this workspace, .env.local exists and sets both variables to blank values.
- .env does not exist, so no later override occurs.
- Runtime check using same load order shows:
  - IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID=""
  - IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET=""

## 4) If absent, confirm never configured

Not applicable, because both keys are present.

Additional historical check:
- Git history search for non-empty assignments returned no matches:
  - ^IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID=.+$
  - ^IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET=.+$
- This indicates no tracked non-empty value in audited env-file history.

## 5) Environment loading order

For backend startup command node --import tsx src/identity-platform/server.ts:
- Order defined in [ src/identity-platform/server.ts ](src/identity-platform/server.ts#L7):
  1. .env.local (if exists)
  2. .env (if exists)
- Note in code comment: process.loadEnvFile does not overwrite existing variables ([ src/identity-platform/server.ts ](src/identity-platform/server.ts#L11)).

## 6) Exactly which env files are loaded during backend startup

Command audited:
- node --import tsx src/identity-platform/server.ts

Workspace file presence:
- .env.local: present
- .env: missing

Therefore loaded during startup:
- Loaded: .env.local
- Skipped: .env (missing)

## Final

CLIENT_ID found:
YES

CLIENT_SECRET found:
YES

Loaded into runtime:
YES (as empty strings)

Root cause:
Google OAuth client credentials are defined but blank in .env.local, and .env is missing, so backend runtime receives empty values for IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID and IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET.