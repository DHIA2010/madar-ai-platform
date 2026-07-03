import { randomUUID } from "node:crypto"

import { createWebhookRegistration, revokeWebhookRegistration } from "../../domain/entities"
import type { WebhookRegistrationRepository } from "../../domain/repositories"
import type { SecretCipher } from "../../application/ports"
import { INTEGRATION_ERRORS } from "../../application/errors/IntegrationPlatformError"

export class WebhookEngine {
  constructor(
    private readonly registrations: WebhookRegistrationRepository,
    private readonly cipher: SecretCipher,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async register(input: {
    connectorId: string
    connectionId: string
    endpointUrl: string
    secret: string
    signatureHeader: string
    replayWindowSeconds?: number
    metadata?: Record<string, unknown>
  }) {
    const registration = createWebhookRegistration({
      id: randomUUID(),
      connectorId: input.connectorId,
      connectionId: input.connectionId,
      endpointUrl: input.endpointUrl,
      secretCiphertext: this.cipher.encrypt(input.secret),
      signatureHeader: input.signatureHeader,
      replayWindowSeconds: input.replayWindowSeconds ?? 300,
      metadata: input.metadata ?? {},
    })
    await this.registrations.save(registration)
    return registration
  }

  async revoke(registrationId: string) {
    const current = await this.registrations.findById(registrationId)
    if (!current) throw INTEGRATION_ERRORS.notFound("Webhook registration")
    const next = revokeWebhookRegistration(current, this.now())
    await this.registrations.save(next)
    return next
  }
}
