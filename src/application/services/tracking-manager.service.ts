import type {
  AbandonedCartsPayload,
  ActiveSessionsReadModel,
  ActiveSessionsPayload,
  CurrentFunnelsPayload,
  CurrentFunnelsReadModel,
  LiveVisitorsPayload,
  LiveVisitorsReadModel,
  RecentEventsPayload,
  RecentEventsReadModel,
  TopProductsPayload,
  TopProductsReadModel,
  TrackingConsent,
  TrackingContext,
  TrackingDispatcherPort,
  TrackingEvent,
  TrackingEventName,
  TrackingSession,
  TrackingVisitor,
} from "../contracts/tracking.contracts"
import { createReadModel } from "../read-models"
import { InMemoryTrackingDispatcher } from "@/infrastructure/tracking/tracking-dispatcher"
import { TrackingPipeline } from "@/infrastructure/tracking/tracking-pipeline"
import { TrackingQueue } from "@/infrastructure/tracking/tracking-queue"

interface StartSessionInput {
  visitorId?: string
  customerId?: string
  context: TrackingContext
  sessionTtlMinutes?: number
}

interface TrackEventInput {
  sessionId: string
  name: TrackingEventName
  context: TrackingContext
  payload: Record<string, string | number | boolean | null>
  eventId?: string
}

let sessionCounter = 0
let visitorCounter = 0
let eventCounter = 0

function nextSessionId() {
  sessionCounter += 1
  return `trk_session_${String(sessionCounter).padStart(6, "0")}`
}

function nextVisitorId() {
  visitorCounter += 1
  return `trk_visitor_${String(visitorCounter).padStart(6, "0")}`
}

function nextEventId() {
  eventCounter += 1
  return `trk_event_${String(eventCounter).padStart(8, "0")}`
}

function nowIso() {
  return new Date().toISOString()
}

export class TrackingManager {
  private readonly sessions = new Map<string, TrackingSession>()
  private readonly visitors = new Map<string, TrackingVisitor>()
  private readonly consents = new Map<string, TrackingConsent>()
  private readonly events: TrackingEvent[] = []

  private readonly carts = new Map<
    string,
    { visitorId: string; sessionId: string; itemCount: number; lastUpdatedAt: string }
  >()

  private readonly pipeline: TrackingPipeline
  private readonly queue: TrackingQueue
  private readonly dispatcher: TrackingDispatcherPort

  constructor(options?: {
    pipeline?: TrackingPipeline
    queue?: TrackingQueue
    dispatcher?: TrackingDispatcherPort
  }) {
    this.pipeline = options?.pipeline ?? new TrackingPipeline()
    this.queue = options?.queue ?? new TrackingQueue()
    this.dispatcher = options?.dispatcher ?? new InMemoryTrackingDispatcher()
  }

  startSession(input: StartSessionInput): TrackingSession {
    const visitorId = input.visitorId ?? nextVisitorId()
    const now = nowIso()
    const expiresAt = new Date(
      Date.now() + (input.sessionTtlMinutes ?? 30) * 60 * 1000
    ).toISOString()

    const existingVisitor = this.visitors.get(visitorId)

    const visitor: TrackingVisitor = existingVisitor
      ? {
          ...existingVisitor,
          customerId: input.customerId ?? existingVisitor.customerId,
          isAnonymous: !(input.customerId ?? existingVisitor.customerId),
          lastSeenAt: now,
          deviceIds: Array.from(
            new Set([...existingVisitor.deviceIds, input.context.device.deviceId])
          ),
        }
      : {
          visitorId,
          customerId: input.customerId,
          isAnonymous: !input.customerId,
          firstSeenAt: now,
          lastSeenAt: now,
          deviceIds: [input.context.device.deviceId],
          mergedFromVisitorIds: [],
        }

    this.visitors.set(visitorId, visitor)

    const session: TrackingSession = {
      sessionId: nextSessionId(),
      visitorId,
      customerId: visitor.customerId,
      isAnonymous: visitor.isAnonymous,
      isActive: true,
      startedAt: now,
      lastSeenAt: now,
      expiresAt,
      landingPage: input.context.landingPage,
      deviceId: input.context.device.deviceId,
    }

    this.sessions.set(session.sessionId, session)
    return session
  }

  resumeSession(sessionId: string): TrackingSession | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const now = nowIso()
    const resumed: TrackingSession = {
      ...session,
      isActive: true,
      lastSeenAt: now,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }

    this.sessions.set(sessionId, resumed)
    return resumed
  }

  expireSessions(now: Date = new Date()) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isActive && new Date(session.expiresAt).getTime() <= now.getTime()) {
        this.sessions.set(sessionId, {
          ...session,
          isActive: false,
          exitPage: session.exitPage ?? "expired",
        })
      }
    }
  }

  mergeIdentity(input: {
    sourceVisitorId: string
    targetCustomerId: string
  }): TrackingVisitor | null {
    const visitor = this.visitors.get(input.sourceVisitorId)
    if (!visitor) {
      return null
    }

    const updated: TrackingVisitor = {
      ...visitor,
      customerId: input.targetCustomerId,
      isAnonymous: false,
      lastSeenAt: nowIso(),
      mergedFromVisitorIds: Array.from(
        new Set([...visitor.mergedFromVisitorIds, input.sourceVisitorId])
      ),
    }

    this.visitors.set(updated.visitorId, updated)

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.visitorId === updated.visitorId) {
        this.sessions.set(sessionId, {
          ...session,
          customerId: updated.customerId,
          isAnonymous: false,
        })
      }
    }

    return updated
  }

  setConsent(visitorId: string, consent: TrackingConsent) {
    this.consents.set(visitorId, consent)
  }

  getConsent(visitorId: string): TrackingConsent | null {
    return this.consents.get(visitorId) ?? null
  }

  trackEvent(input: TrackEventInput): {
    accepted: boolean
    duplicate: boolean
    eventId?: string
    reason?: string
  } {
    const session = this.sessions.get(input.sessionId)
    if (!session || !session.isActive) {
      return {
        accepted: false,
        duplicate: false,
        reason: "inactive_or_missing_session",
      }
    }

    const event: TrackingEvent = {
      eventId: input.eventId ?? nextEventId(),
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      customerId: session.customerId,
      name: input.name,
      context: input.context,
      payload: input.payload,
    }

    const result = this.pipeline.process(event)
    if (!result.accepted || !result.event) {
      return {
        accepted: false,
        duplicate: result.duplicate,
        reason: result.reason,
      }
    }

    this.events.unshift(result.event)
    this.queue.enqueue(result.event)

    const now = nowIso()
    this.sessions.set(session.sessionId, {
      ...session,
      lastSeenAt: now,
      exitPage: input.context.exitPage ?? session.exitPage,
    })

    const visitor = this.visitors.get(session.visitorId)
    if (visitor) {
      this.visitors.set(visitor.visitorId, {
        ...visitor,
        lastSeenAt: now,
        deviceIds: Array.from(new Set([...visitor.deviceIds, input.context.device.deviceId])),
      })
    }

    this.updateCartState(result.event)

    return {
      accepted: true,
      duplicate: false,
      eventId: result.event.eventId,
    }
  }

  private updateCartState(event: TrackingEvent) {
    const key = `${event.visitorId}:${event.sessionId}`
    const current = this.carts.get(key) ?? {
      visitorId: event.visitorId,
      sessionId: event.sessionId,
      itemCount: 0,
      lastUpdatedAt: nowIso(),
    }

    if (event.name === "add_to_cart") {
      current.itemCount += 1
      current.lastUpdatedAt = nowIso()
      this.carts.set(key, current)
      return
    }

    if (event.name === "remove_from_cart") {
      current.itemCount = Math.max(current.itemCount - 1, 0)
      current.lastUpdatedAt = nowIso()
      if (current.itemCount === 0) {
        this.carts.delete(key)
      } else {
        this.carts.set(key, current)
      }
      return
    }

    if (event.name === "checkout_completed" || event.name === "purchase_completed") {
      this.carts.delete(key)
    }
  }

  async dispatchQueue(options?: {
    maxRetries?: number
    baseDelayMs?: number
    backoffFactor?: number
  }) {
    const maxRetries = options?.maxRetries ?? 3
    const baseDelayMs = options?.baseDelayMs ?? 250
    const backoffFactor = options?.backoffFactor ?? 2

    const ready = this.queue.dequeueReady()
    if (ready.length === 0) {
      return { dispatched: 0, failed: 0 }
    }

    const result = await this.dispatcher.dispatch(ready.map((item) => item.event))

    let failed = 0
    for (const item of ready) {
      if (!result.failedEventIds.includes(item.event.eventId)) {
        continue
      }

      failed += 1
      if (item.attempts + 1 < maxRetries) {
        const delay = Math.floor(baseDelayMs * Math.pow(backoffFactor, item.attempts))
        this.queue.requeue(item, "dispatch_failed", delay)
      }
    }

    return {
      dispatched: ready.length - failed,
      failed,
    }
  }

  getActiveSessionsReadModel(): ActiveSessionsReadModel {
    const sessions = [...this.sessions.values()].filter((session) => session.isActive)
    const payload: ActiveSessionsPayload = {
      totalActiveSessions: sessions.length,
      sessions,
    }

    return createReadModel({
      id: "tracking:active-sessions",
      owner: "tracking",
      sourceDomains: ["tracking"],
      payload,
    })
  }

  getLiveVisitorsReadModel(): LiveVisitorsReadModel {
    const activeVisitorIds = new Set(
      [...this.sessions.values()]
        .filter((session) => session.isActive)
        .map((session) => session.visitorId)
    )

    const visitors = [...this.visitors.values()].filter((visitor) =>
      activeVisitorIds.has(visitor.visitorId)
    )
    const payload: LiveVisitorsPayload = {
      totalLiveVisitors: visitors.length,
      visitors,
    }

    return createReadModel({
      id: "tracking:live-visitors",
      owner: "tracking",
      sourceDomains: ["tracking"],
      payload,
    })
  }

  getCurrentFunnelsReadModel(): CurrentFunnelsReadModel {
    const steps: Array<CurrentFunnelsPayload["steps"][number]> = [
      { step: "page_viewed", count: 0 },
      { step: "product_viewed", count: 0 },
      { step: "add_to_cart", count: 0 },
      { step: "checkout_started", count: 0 },
      { step: "purchase_completed", count: 0 },
    ]

    for (const event of this.events) {
      const step = steps.find((entry) => entry.step === event.name)
      if (step) {
        step.count += 1
      }
    }

    const payload: CurrentFunnelsPayload = { steps }

    return createReadModel({
      id: "tracking:current-funnels",
      owner: "tracking",
      sourceDomains: ["tracking"],
      payload,
    })
  }

  getTopProductsReadModel(): TopProductsReadModel {
    const products = new Map<string, { productId: string; views: number; purchases: number }>()

    for (const event of this.events) {
      const productId = String(event.payload.productId ?? "")
      if (!productId) {
        continue
      }

      const current = products.get(productId) ?? { productId, views: 0, purchases: 0 }
      if (event.name === "product_viewed") {
        current.views += 1
      }
      if (event.name === "purchase_completed") {
        current.purchases += 1
      }
      products.set(productId, current)
    }

    const payload: TopProductsPayload = {
      products: [...products.values()].sort(
        (a, b) => b.views + b.purchases - (a.views + a.purchases)
      ),
    }

    return createReadModel({
      id: "tracking:top-products",
      owner: "tracking",
      sourceDomains: ["tracking"],
      payload,
    })
  }

  getRecentEventsReadModel(limit: number = 50): RecentEventsReadModel {
    const payload: RecentEventsPayload = {
      events: this.events.slice(0, limit),
    }

    return createReadModel({
      id: "tracking:recent-events",
      owner: "tracking",
      sourceDomains: ["tracking"],
      payload,
    })
  }

  getAbandonedCartsReadModel(): import("../contracts/tracking.contracts").AbandonedCartsReadModel {
    const payload: AbandonedCartsPayload = {
      carts: [...this.carts.values()],
    }

    return createReadModel({
      id: "tracking:abandoned-carts",
      owner: "tracking",
      sourceDomains: ["tracking"],
      payload,
    })
  }
}
