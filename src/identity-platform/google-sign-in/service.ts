import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"

import type { Role } from "../types"
import {
  MembershipEntity,
  OrganizationEntity,
  UserEntity,
  WorkspaceEntity,
} from "../domain/entities"
import type {
  MembershipRepository,
  OrganizationRepository,
  UserRepository,
  WorkspaceRepository,
} from "../domain/repositories"
import type { Clock, PasswordHasher } from "../application/ports"
import type { GoogleIdentityCredentialsProvider } from "../google-oauth/google-identity-credentials"

const STATE_TTL_MS = 10 * 60 * 1000
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"

export interface GoogleSignInDeps {
  users: UserRepository
  organizations: OrganizationRepository
  workspaces: WorkspaceRepository
  memberships: MembershipRepository
  hasher: PasswordHasher
  clock: Clock
  credentials: GoogleIdentityCredentialsProvider
  // Signs the round-trip state, so a callback can't be forged or replayed after it expires.
  stateSecret: string
  // A short-lived, single-use sign-in link for the account (see LoginLinkService).
  createSignInLink: (input: { userId: string; organizationId: string }) => Promise<string>
}

interface GoogleProfile {
  email: string
  name: string
}

export type GoogleSignInResult =
  | { status: "ok"; signInUrl: string; created: boolean }
  | { status: "error"; reason: "state" | "google" | "unverified_email" | "no_membership" }

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url")
}

// "Continue with Google" on the sign-in and register pages. Google confirms who the person is;
// an email that already has a Madar account is signed into it, and a new one gets an account --
// owner of a new organization with one branch, email already verified -- then signed in.
export class GoogleSignInService {
  constructor(private readonly deps: GoogleSignInDeps) {}

  // Google sends the person back here; it is registered in the Google Cloud OAuth client next to
  // the Google Ads connection's own callback, on the same API host.
  private async redirectUri() {
    const credentials = await this.deps.credentials.load()
    return {
      credentials,
      redirectUri: `${new URL(credentials.redirectUri).origin}/v1/auth/google/callback`,
    }
  }

  private sign(payload: string) {
    return createHmac("sha256", this.deps.stateSecret).update(payload).digest("base64url")
  }

  private createState() {
    const payload = base64url(
      JSON.stringify({ nonce: randomBytes(12).toString("hex"), exp: Date.now() + STATE_TTL_MS })
    )
    return `${payload}.${this.sign(payload)}`
  }

  private verifyState(state: string): boolean {
    const [payload, signature] = state.split(".")
    if (!payload || !signature) return false
    const expected = Buffer.from(this.sign(payload))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
    try {
      const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        exp: number
      }
      return typeof exp === "number" && exp > Date.now()
    } catch {
      return false
    }
  }

  // Where the browser goes when the person presses "Continue with Google".
  async startUrl(): Promise<string> {
    const { credentials, redirectUri } = await this.redirectUri()
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: this.createState(),
      prompt: "select_account",
    })
    return `${AUTHORIZE_URL}?${params.toString()}`
  }

  private async profileFromCode(code: string): Promise<GoogleProfile | "unverified_email" | null> {
    const { credentials, redirectUri } = await this.redirectUri()
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    })
    if (!tokenResponse.ok) {
      console.error("google_sign_in.token_failed", { status: tokenResponse.status })
      return null
    }
    const { id_token: idToken } = (await tokenResponse.json()) as { id_token?: string }
    if (!idToken) return null

    // Google checks the token's signature and expiry; we check it was issued to Madar.
    const infoResponse = await fetch(`${TOKEN_INFO_URL}?id_token=${encodeURIComponent(idToken)}`)
    if (!infoResponse.ok) return null
    const info = (await infoResponse.json()) as {
      aud?: string
      iss?: string
      email?: string
      email_verified?: string | boolean
      name?: string
    }
    if (
      info.aud !== credentials.clientId ||
      !["accounts.google.com", "https://accounts.google.com"].includes(info.iss ?? "") ||
      !info.email
    ) {
      return null
    }
    if (info.email_verified !== true && info.email_verified !== "true") return "unverified_email"
    const email = info.email.trim().toLowerCase()
    return { email, name: info.name?.trim() || email.split("@")[0] }
  }

  async callback(input: {
    code: string | null
    state: string | null
  }): Promise<GoogleSignInResult> {
    if (!input.state || !this.verifyState(input.state)) return { status: "error", reason: "state" }
    if (!input.code) return { status: "error", reason: "google" }

    const profile = await this.profileFromCode(input.code).catch((error: unknown) => {
      console.error("google_sign_in.profile_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })
    if (profile === null) return { status: "error", reason: "google" }
    if (profile === "unverified_email") return { status: "error", reason: "unverified_email" }

    const existing = await this.deps.users.findByEmail(profile.email)
    if (existing) {
      const membership = await this.deps.memberships.findFirstByUserId(existing.id)
      if (!membership || membership.status !== "active") {
        return { status: "error", reason: "no_membership" }
      }
      return {
        status: "ok",
        created: false,
        signInUrl: await this.deps.createSignInLink({
          userId: existing.id,
          organizationId: membership.organizationId,
        }),
      }
    }

    const { userId, organizationId } = await this.createAccount(profile)
    console.log("google_sign_in.account_created", { organizationId })
    return {
      status: "ok",
      created: true,
      signInUrl: await this.deps.createSignInLink({ userId, organizationId }),
    }
  }

  // Same shape as a normal registration (and the Salla install's account): the person owns a new
  // organization with one branch. No password is set that anyone knows -- they sign in with
  // Google, or set one later with "forgot password".
  private async createAccount(profile: GoogleProfile) {
    const now = this.deps.clock.nowIso()
    const userId = randomUUID()
    const organizationId = randomUUID()
    const workspaceId = randomUUID()

    const user = UserEntity.register({
      id: userId,
      email: profile.email,
      passwordHash: this.deps.hasher.hash(randomBytes(32).toString("hex")),
      fullName: profile.name,
      timezone: "Asia/Riyadh",
      language: "ar",
      organizationId,
      workspaceId,
      now,
    })
    // Google has already confirmed the email.
    user.verifyEmail(now)
    const organization = OrganizationEntity.create({
      id: organizationId,
      ownerUserId: userId,
      name: profile.name,
      settings: {},
      now,
    })
    const workspace = WorkspaceEntity.create({
      id: workspaceId,
      organizationId,
      name: `${profile.name} - الفرع الرئيسي`,
      now,
    })
    const membership = MembershipEntity.create({
      id: randomUUID(),
      organizationId,
      workspaceId,
      userId,
      role: "owner" as Role,
      now,
    })

    // users and organizations reference each other: insert the user without those links, then
    // re-save it once the organization and workspace exist (same as register()).
    await this.deps.users.save({
      ...user.toState(),
      primaryOrganizationId: null,
      activeWorkspaceId: null,
    })
    await this.deps.organizations.save(organization.toState())
    await this.deps.workspaces.save(workspace.toState())
    await this.deps.users.save(user.toState())
    await this.deps.memberships.save(membership.toState())
    return { userId, organizationId }
  }
}
