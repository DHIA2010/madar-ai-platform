import { randomUUID } from "node:crypto"

import type { ExecutionEnvelope, ExecutionEnvelopeKind, ExecutionSubscriber } from "./bus.contracts"

export class ExecutionSubscriberRegistry {
  private readonly subscribers = new Map<string, ExecutionSubscriber>()

  add(subscriber: Omit<ExecutionSubscriber, "id"> & { id?: string }) {
    const id = subscriber.id ?? randomUUID()
    this.subscribers.set(id, { ...subscriber, id })
    return id
  }

  remove(id: string) {
    this.subscribers.delete(id)
  }

  list() {
    return [...this.subscribers.values()]
  }

  async notify(envelope: ExecutionEnvelope<unknown>) {
    const kind = envelope.kind as ExecutionEnvelopeKind
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.kinds && !subscriber.kinds.includes(kind)) {
        continue
      }
      await subscriber.onEnvelope(envelope)
    }
  }
}
