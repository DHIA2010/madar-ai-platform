import { ValidationError } from "@/infrastructure/data/errors"

import type {
  ParsedSallaWebhook,
  ParsedSallaWebhookEventType,
  SallaWebhookEnvelopeDto,
} from "./salla.dtos"

const supportedEventMap: Record<string, ParsedSallaWebhookEventType> = {
  "order.created": "order.created",
  "order.updated": "order.updated",
  "customer.created": "customer.created",
  "product.updated": "product.updated",
  "inventory.updated": "inventory.updated",
}

export class SallaWebhookParser {
  parse(payload: unknown): ParsedSallaWebhook {
    if (!payload || typeof payload !== "object") {
      throw new ValidationError({ message: "Invalid Salla webhook payload." })
    }

    const envelope = payload as SallaWebhookEnvelopeDto
    const eventType = supportedEventMap[envelope.event]

    if (!eventType) {
      throw new ValidationError({
        message: `Unsupported Salla webhook event: ${String(envelope.event)}`,
      })
    }

    if (!envelope.data?.id) {
      throw new ValidationError({ message: "Salla webhook payload missing data.id." })
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
