import { ValidationError } from "@/infrastructure/data/errors"

import type { ParsedZidWebhook, ParsedZidWebhookEventType, ZidWebhookEnvelopeDto } from "./zid.dtos"

const supportedEventMap: Record<string, ParsedZidWebhookEventType> = {
  "order.created": "order.created",
  "order.updated": "order.updated",
  "product.created": "product.created",
  "product.updated": "product.updated",
  "inventory.updated": "inventory.updated",
  "customer.created": "customer.created",
}

export class ZidWebhookParser {
  parse(payload: unknown): ParsedZidWebhook {
    if (!payload || typeof payload !== "object") {
      throw new ValidationError({ message: "Invalid Zid webhook payload." })
    }

    const envelope = payload as ZidWebhookEnvelopeDto
    const eventType = supportedEventMap[envelope.event]

    if (!eventType) {
      throw new ValidationError({
        message: `Unsupported Zid webhook event: ${String(envelope.event)}`,
      })
    }

    if (!envelope.data?.id) {
      throw new ValidationError({ message: "Zid webhook payload missing data.id." })
    }

    return {
      eventType,
      resourceId: envelope.data.id,
      occurredAt:
        envelope.created_at ??
        envelope.data.updated_at ??
        envelope.data.created_at ??
        new Date().toISOString(),
    }
  }
}
