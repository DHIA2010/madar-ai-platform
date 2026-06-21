import { createHmac } from "node:crypto"

import type {
  TrackingAuthenticationConfig,
  TrackingAuthenticationMode,
  TrackingRequest,
} from "./tracking-api.contracts"

export interface TrackingAuthenticationResult {
  allowed: boolean
  mode: TrackingAuthenticationMode
  reason?: string
}

function getMode(request: TrackingRequest): TrackingAuthenticationMode {
  const raw = request.headers["x-tracking-auth-mode"]
  if (raw === "public" || raw === "private" || raw === "signed" || raw === "anonymous") {
    return raw
  }
  return "anonymous"
}

export class TrackingAuthentication {
  constructor(private readonly config: TrackingAuthenticationConfig) {}

  authenticate(request: TrackingRequest): TrackingAuthenticationResult {
    const mode = getMode(request)

    if (mode === "anonymous") {
      return { allowed: true, mode }
    }

    const workspaceId = request.body.workspaceId
    const trackingKey = request.body.trackingKey

    if (!trackingKey) {
      return { allowed: false, mode, reason: "tracking_key_required" }
    }

    if (mode === "public") {
      const keys = this.config.publicKeysByWorkspace[workspaceId] ?? []
      const valid = keys.includes(trackingKey)
      return { allowed: valid, mode, reason: valid ? undefined : "invalid_public_key" }
    }

    if (mode === "private") {
      const keys = this.config.privateKeysByWorkspace[workspaceId] ?? []
      const valid = keys.includes(trackingKey)
      return { allowed: valid, mode, reason: valid ? undefined : "invalid_private_key" }
    }

    const secret = this.config.signatureSecretsByWorkspace[workspaceId]
    if (!secret) {
      return { allowed: false, mode, reason: "signature_secret_missing" }
    }

    const provided = request.headers["x-tracking-signature"]
    if (!provided) {
      return { allowed: false, mode, reason: "signature_required" }
    }

    const signedBody = JSON.stringify(request.body)
    const expected = createHmac("sha256", secret).update(signedBody).digest("hex")
    const valid = provided === expected

    return { allowed: valid, mode, reason: valid ? undefined : "invalid_signature" }
  }
}
