import type {
  TrackingEvent,
  TrackingPipelineResult,
} from "@/application/contracts/tracking.contracts"
import { mapToCanonicalTrackingEvent } from "@/application/mappers/tracking.mappers"
import { trackingEventSchema } from "@/application/validators/tracking.validators"

export class TrackingPipeline {
  private readonly dedup = new Set<string>()

  process(event: TrackingEvent): TrackingPipelineResult {
    const validated = trackingEventSchema.parse(event)

    const dedupKey = `${validated.sessionId}:${validated.name}:${validated.context.timestamp}:${validated.eventId}`
    if (this.dedup.has(dedupKey)) {
      return {
        accepted: false,
        duplicate: true,
        reason: "duplicate_event",
      }
    }

    this.dedup.add(dedupKey)

    const enriched: TrackingEvent = {
      ...validated,
      payload: {
        ...validated.payload,
        timezone: validated.context.timezone,
        language: validated.context.language,
      },
    }

    return {
      accepted: true,
      duplicate: false,
      event: mapToCanonicalTrackingEvent(enriched),
    }
  }
}
