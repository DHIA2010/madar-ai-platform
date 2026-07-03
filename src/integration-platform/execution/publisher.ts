import type { ExecutionEnvelope, ExecutionEnvelopeKind } from "./bus.contracts"

export interface ExecutionBusPublisherTarget {
  publishEnvelope(envelope: ExecutionEnvelope<unknown>): Promise<void>
}

export class ExecutionPublisher {
  constructor(private readonly target: ExecutionBusPublisherTarget) {}

  async publish(kind: ExecutionEnvelopeKind, envelope: ExecutionEnvelope<unknown>) {
    void kind
    await this.target.publishEnvelope(envelope)
  }
}
