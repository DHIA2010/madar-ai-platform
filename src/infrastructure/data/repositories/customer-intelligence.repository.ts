import type {
  AttachIdentityRequestDto,
  CampaignAttributionDto,
  CustomerIntelligenceRepository,
  CustomerIntelligenceWidgetMetricsDto,
  CustomerJourneyDto,
  CustomerTimelineDto,
  EndSessionRequestDto,
  GetJourneyRequestDto,
  IdentityDto,
  ProductInterestDto,
  SessionDto,
  StartSessionRequestDto,
  TimelineEntryDto,
  TrackEventRequestDto,
  TrackingEventDto,
  TrackingEventName,
  TrafficSourceStatsDto,
  VisitorDto,
  VisitorSummaryDto,
} from "@/application/contracts/customer-intelligence.contracts"
import { NotFoundError, mapRepositoryError } from "@/infrastructure/data/errors"

type JourneyState = {
  visitors: VisitorDto[]
  sessions: SessionDto[]
  events: TrackingEventDto[]
  identity?: IdentityDto
}

let sessionCounter = 0
let identityCounter = 0

const visitorsDb = new Map<string, VisitorDto>()
const sessionsDb = new Map<string, SessionDto>()
const eventsDb = new Map<string, TrackingEventDto>()
const journeysDb = new Map<string, JourneyState>()
const visitorToJourney = new Map<string, string>()
const customerToJourney = new Map<string, string>()

function ensureJourneyForVisitor(visitorId: string, startedAt: string): string {
  const existing = visitorToJourney.get(visitorId)
  if (existing) {
    return existing
  }

  const journeyId = `journey_${visitorId}`
  const visitor: VisitorDto = {
    visitorId,
    journeyId,
    firstSeenAt: startedAt,
    lastSeenAt: startedAt,
    isAnonymous: true,
  }

  visitorsDb.set(visitorId, visitor)
  journeysDb.set(journeyId, {
    visitors: [visitor],
    sessions: [],
    events: [],
  })
  visitorToJourney.set(visitorId, journeyId)

  return journeyId
}

function pushTimelineFromSession(
  session: SessionDto,
  action: TimelineEntryDto["action"]
): TimelineEntryDto {
  return {
    timelineId: `${session.sessionId}:${action}`,
    timestamp:
      action === "session_started" ? session.startedAt : (session.endedAt ?? session.startedAt),
    visitorId: session.visitorId,
    sessionId: session.sessionId,
    action,
    label: action === "session_started" ? "Session started" : "Session ended",
  }
}

function pushTimelineFromEvent(event: TrackingEventDto): TimelineEntryDto {
  return {
    timelineId: `${event.eventId}:event_tracked`,
    timestamp: event.timestamp,
    visitorId: event.visitorId,
    sessionId: event.sessionId,
    eventName: event.eventName,
    action: "event_tracked",
    label: event.eventName,
  }
}

function buildJourneyDto(journeyId: string): CustomerJourneyDto | null {
  const state = journeysDb.get(journeyId)
  if (!state) {
    return null
  }

  const visitorIds = state.visitors.map((visitor) => visitor.visitorId)
  const sortedEvents = [...state.events].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp)
  )

  return {
    journeyId,
    visitorIds,
    identityId: state.identity?.identityId,
    customerId: state.identity?.customerId,
    firstEventAt: sortedEvents[0]?.timestamp,
    lastEventAt: sortedEvents.at(-1)?.timestamp,
    events: sortedEvents,
    sessions: [...state.sessions].sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt)
    ),
  }
}

function createSessionId() {
  sessionCounter += 1
  return `ses_${String(sessionCounter).padStart(6, "0")}`
}

function createIdentity(input: AttachIdentityRequestDto): IdentityDto {
  identityCounter += 1
  return {
    identityId: `id_${String(identityCounter).padStart(6, "0")}`,
    customerId: input.externalId ?? `cust_${String(identityCounter).padStart(6, "0")}`,
    email: input.email,
    phone: input.phone,
    externalId: input.externalId,
    attachedAt: input.attachedAt,
  }
}

function mergeJourneys(options: {
  targetJourneyId: string
  sourceJourneyId: string
  identity: IdentityDto
}) {
  const targetState = journeysDb.get(options.targetJourneyId)
  const sourceState = journeysDb.get(options.sourceJourneyId)

  if (!targetState || !sourceState) {
    throw new NotFoundError({
      message: `Unable to merge journey ${options.sourceJourneyId} into ${options.targetJourneyId}.`,
    })
  }

  const visitors = new Map<string, VisitorDto>()
  for (const visitor of [...targetState.visitors, ...sourceState.visitors]) {
    const mergedVisitor: VisitorDto = {
      ...visitor,
      isAnonymous: false,
      identityId: options.identity.identityId,
      customerId: options.identity.customerId,
    }
    visitors.set(mergedVisitor.visitorId, mergedVisitor)
    visitorsDb.set(mergedVisitor.visitorId, mergedVisitor)
    visitorToJourney.set(mergedVisitor.visitorId, options.targetJourneyId)
  }

  const sessions = new Map<string, SessionDto>()
  for (const session of [...targetState.sessions, ...sourceState.sessions]) {
    sessions.set(session.sessionId, session)
  }

  const events = new Map<string, TrackingEventDto>()
  for (const event of [...targetState.events, ...sourceState.events]) {
    events.set(event.eventId, event)
  }

  journeysDb.set(options.targetJourneyId, {
    visitors: [...visitors.values()],
    sessions: [...sessions.values()],
    events: [...events.values()],
    identity: {
      ...(targetState.identity ?? options.identity),
      ...options.identity,
      identityId: targetState.identity?.identityId ?? options.identity.identityId,
      customerId: options.identity.customerId,
    },
  })

  journeysDb.delete(options.sourceJourneyId)
}

function eventCount(events: TrackingEventDto[], name: TrackingEventName) {
  return events.filter((event) => event.eventName === name).length
}

function getJourneyIdFor(input: GetJourneyRequestDto): string | null {
  if (input.visitorId) {
    return visitorToJourney.get(input.visitorId) ?? null
  }

  if (input.customerId) {
    return customerToJourney.get(input.customerId) ?? null
  }

  return null
}

export class DataCustomerIntelligenceRepository implements CustomerIntelligenceRepository {
  async startSession(input: StartSessionRequestDto): Promise<SessionDto> {
    try {
      const journeyId = ensureJourneyForVisitor(input.visitorId, input.startedAt)
      const visitor = visitorsDb.get(input.visitorId)
      if (!visitor) {
        throw new NotFoundError({ message: `Visitor ${input.visitorId} was not found.` })
      }

      const session: SessionDto = {
        sessionId: createSessionId(),
        visitorId: input.visitorId,
        startedAt: input.startedAt,
        isActive: true,
        entryPage: input.entryPage,
        exitPage: input.entryPage,
        eventCount: 0,
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        device: input.device,
        browser: input.browser,
        country: input.country,
        city: input.city,
      }

      sessionsDb.set(session.sessionId, session)
      visitor.currentSessionId = session.sessionId
      visitor.lastSeenAt = input.startedAt
      visitorsDb.set(visitor.visitorId, visitor)

      const state = journeysDb.get(journeyId)
      if (state) {
        state.sessions = [...state.sessions, session]
        journeysDb.set(journeyId, state)
      }

      return session
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async endSession(input: EndSessionRequestDto): Promise<SessionDto | null> {
    try {
      const session = sessionsDb.get(input.sessionId)
      if (!session) {
        return null
      }

      const updated: SessionDto = {
        ...session,
        endedAt: input.endedAt,
        exitPage: input.exitPage ?? session.exitPage,
        isActive: false,
      }

      sessionsDb.set(input.sessionId, updated)

      const journeyId = visitorToJourney.get(updated.visitorId)
      if (journeyId) {
        const state = journeysDb.get(journeyId)
        if (state) {
          state.sessions = state.sessions.map((entry) =>
            entry.sessionId === updated.sessionId ? updated : entry
          )
          journeysDb.set(journeyId, state)
        }
      }

      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async trackEvent(input: TrackEventRequestDto): Promise<TrackingEventDto> {
    try {
      const session = sessionsDb.get(input.sessionId)
      if (!session) {
        throw new NotFoundError({ message: `Session ${input.sessionId} was not found.` })
      }

      const journeyId = ensureJourneyForVisitor(input.visitorId, input.timestamp)
      const visitor = visitorsDb.get(input.visitorId)
      if (!visitor) {
        throw new NotFoundError({ message: `Visitor ${input.visitorId} was not found.` })
      }

      const event: TrackingEventDto = {
        eventId: input.eventId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        timestamp: input.timestamp,
        eventName: input.eventName,
        page: input.page,
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        device: input.device,
        browser: input.browser,
        country: input.country,
        city: input.city,
        metadata: input.metadata,
      }

      eventsDb.set(event.eventId, event)

      session.eventCount += 1
      session.exitPage = input.page
      sessionsDb.set(session.sessionId, session)

      visitor.lastSeenAt = input.timestamp
      visitorsDb.set(visitor.visitorId, visitor)

      const state = journeysDb.get(journeyId)
      if (state) {
        state.events = [...state.events, event]
        state.sessions = state.sessions.map((entry) =>
          entry.sessionId === session.sessionId ? session : entry
        )
        journeysDb.set(journeyId, state)
      }

      return event
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async attachIdentity(input: AttachIdentityRequestDto): Promise<CustomerJourneyDto> {
    try {
      const journeyId = visitorToJourney.get(input.visitorId)
      if (!journeyId) {
        throw new NotFoundError({
          message: `Journey for visitor ${input.visitorId} was not found.`,
        })
      }

      const state = journeysDb.get(journeyId)
      if (!state) {
        throw new NotFoundError({ message: `Journey ${journeyId} was not found.` })
      }

      const identity = createIdentity(input)
      const existingJourneyId = customerToJourney.get(identity.customerId)

      if (existingJourneyId && existingJourneyId !== journeyId) {
        mergeJourneys({
          targetJourneyId: existingJourneyId,
          sourceJourneyId: journeyId,
          identity,
        })
        customerToJourney.set(identity.customerId, existingJourneyId)

        const mergedJourney = buildJourneyDto(existingJourneyId)
        if (!mergedJourney) {
          throw new NotFoundError({ message: `Journey ${existingJourneyId} could not be built.` })
        }

        return mergedJourney
      }

      state.identity = {
        ...(state.identity ?? identity),
        ...identity,
      }

      state.visitors = state.visitors.map((visitor) => {
        const mergedVisitor: VisitorDto = {
          ...visitor,
          isAnonymous: false,
          identityId: state.identity?.identityId,
          customerId: state.identity?.customerId,
        }
        visitorsDb.set(mergedVisitor.visitorId, mergedVisitor)
        return mergedVisitor
      })

      journeysDb.set(journeyId, state)
      customerToJourney.set(state.identity.customerId, journeyId)

      const journey = buildJourneyDto(journeyId)
      if (!journey) {
        throw new NotFoundError({ message: `Journey ${journeyId} could not be built.` })
      }

      return journey
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getJourney(input: GetJourneyRequestDto): Promise<CustomerJourneyDto | null> {
    try {
      const journeyId = getJourneyIdFor(input)
      if (!journeyId) {
        return null
      }
      return buildJourneyDto(journeyId)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getVisitorHistory(visitorId: string): Promise<VisitorSummaryDto | null> {
    try {
      const visitor = visitorsDb.get(visitorId)
      if (!visitor) {
        return null
      }

      const visitorSessions = [...sessionsDb.values()].filter(
        (session) => session.visitorId === visitorId
      )
      const visitorEvents = [...eventsDb.values()].filter((event) => event.visitorId === visitorId)

      return {
        visitor,
        sessions: visitorSessions.sort((left, right) =>
          left.startedAt.localeCompare(right.startedAt)
        ),
        events: visitorEvents.sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
        pageViews: visitorEvents
          .filter((event) => event.eventName === "page_view")
          .map((event) => ({ eventId: event.eventId, page: event.page })),
        productViews: visitorEvents
          .filter((event) => event.eventName === "product_view")
          .map((event) => ({
            eventId: event.eventId,
            productId: String(event.metadata.productId ?? "unknown"),
          })),
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getCustomerTimeline(customerId: string): Promise<CustomerTimelineDto | null> {
    try {
      const journeyId = customerToJourney.get(customerId)
      if (!journeyId) {
        return null
      }

      const state = journeysDb.get(journeyId)
      if (!state?.identity) {
        return null
      }

      const timeline: TimelineEntryDto[] = [
        ...state.sessions.map((session) => pushTimelineFromSession(session, "session_started")),
        ...state.events.map((event) => pushTimelineFromEvent(event)),
        ...state.sessions
          .filter((session) => Boolean(session.endedAt))
          .map((session) => pushTimelineFromSession(session, "session_ended")),
        {
          timelineId: `${state.identity.identityId}:identity_attached`,
          timestamp: state.identity.attachedAt,
          visitorId: state.visitors[0]?.visitorId ?? "",
          action: "identity_attached" as const,
          label: "Identity attached",
        },
      ].sort((left, right) => left.timestamp.localeCompare(right.timestamp))

      return {
        customerId,
        identity: state.identity,
        timeline,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getTrafficSources(): Promise<TrafficSourceStatsDto[]> {
    try {
      const grouped = new Map<string, TrafficSourceStatsDto>()

      for (const session of sessionsDb.values()) {
        const key = `${session.source}::${session.medium}::${session.campaign}`
        const current = grouped.get(key) ?? {
          source: session.source,
          medium: session.medium,
          campaign: session.campaign,
          visitors: 0,
          sessions: 0,
          events: 0,
        }

        current.sessions += 1
        current.visitors += 1
        current.events += session.eventCount
        grouped.set(key, current)
      }

      return [...grouped.values()]
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getCampaignAttribution(): Promise<CampaignAttributionDto[]> {
    try {
      const grouped = new Map<string, CampaignAttributionDto>()
      const events = [...eventsDb.values()]

      for (const event of events) {
        const key = `${event.campaign}::${event.source}::${event.medium}`
        const current = grouped.get(key) ?? {
          campaign: event.campaign,
          source: event.source,
          medium: event.medium,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          revenue: 0,
        }

        if (event.eventName === "campaign_impression") {
          current.impressions += 1
        }
        if (event.eventName === "campaign_click") {
          current.clicks += 1
        }
        if (event.eventName === "purchase") {
          current.purchases += 1
          current.revenue += Number(event.metadata.revenue ?? 0)
        }

        grouped.set(key, current)
      }

      return [...grouped.values()]
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getProductInterest(): Promise<ProductInterestDto[]> {
    try {
      const grouped = new Map<string, ProductInterestDto>()

      for (const event of eventsDb.values()) {
        const productId = String(event.metadata.productId ?? "unknown")
        const current = grouped.get(productId) ?? {
          productId,
          views: 0,
          addToCart: 0,
          removeFromCart: 0,
          purchases: 0,
          abandons: 0,
        }

        if (event.eventName === "product_view") {
          current.views += 1
        }
        if (event.eventName === "add_to_cart") {
          current.addToCart += 1
        }
        if (event.eventName === "remove_from_cart") {
          current.removeFromCart += 1
          current.abandons += 1
        }
        if (event.eventName === "purchase") {
          current.purchases += 1
        }

        grouped.set(productId, current)
      }

      return [...grouped.values()]
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getWidgetMetrics(): Promise<CustomerIntelligenceWidgetMetricsDto> {
    try {
      const sessions = [...sessionsDb.values()]
      const events = [...eventsDb.values()]
      const visitors = [...visitorsDb.values()]
      const productInterest = await this.getProductInterest()

      const landingMap = new Map<string, number>()
      const exitMap = new Map<string, number>()

      for (const session of sessions) {
        landingMap.set(session.entryPage, (landingMap.get(session.entryPage) ?? 0) + 1)
        exitMap.set(session.exitPage, (exitMap.get(session.exitPage) ?? 0) + 1)
      }

      const topLandingPages = [...landingMap.entries()]
        .map(([page, count]) => ({ page, sessions: count }))
        .sort((left, right) => right.sessions - left.sessions)
        .slice(0, 5)

      const topExitPages = [...exitMap.entries()]
        .map(([page, count]) => ({ page, sessions: count }))
        .sort((left, right) => right.sessions - left.sessions)
        .slice(0, 5)

      const mostViewedProducts = [...productInterest]
        .sort((left, right) => right.views - left.views)
        .slice(0, 5)
        .map((item) => ({ productId: item.productId, views: item.views }))

      const mostAbandonedProducts = [...productInterest]
        .sort((left, right) => right.abandons - left.abandons)
        .slice(0, 5)
        .map((item) => ({ productId: item.productId, abandons: item.abandons }))

      const bounceSessions = sessions.filter((session) => session.eventCount <= 1).length
      const returningVisitors = visitors.filter((visitor) => {
        const count = sessions.filter((session) => session.visitorId === visitor.visitorId).length
        return count > 1
      }).length

      const timeline = Array.from(journeysDb.values())
        .flatMap((state) => {
          const sessionTimeline = state.sessions.map((session) =>
            pushTimelineFromSession(session, "session_started")
          )
          const eventTimeline = state.events.map((event) => pushTimelineFromEvent(event))
          return [...sessionTimeline, ...eventTimeline]
        })
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
        .slice(-50)

      return {
        visitors: visitors.length,
        sessions: sessions.length,
        bounceRate: sessions.length > 0 ? bounceSessions / sessions.length : 0,
        returningVisitors,
        topLandingPages,
        topExitPages,
        mostViewedProducts,
        mostAbandonedProducts,
        checkoutFunnel: {
          addToCart: eventCount(events, "add_to_cart"),
          beginCheckout: eventCount(events, "begin_checkout"),
          purchase: eventCount(events, "purchase"),
        },
        customerJourneyTimeline: timeline,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createCustomerIntelligenceRepository(): CustomerIntelligenceRepository {
  return new DataCustomerIntelligenceRepository()
}

export function resetCustomerIntelligenceRepositoryState() {
  sessionCounter = 0
  identityCounter = 0
  visitorsDb.clear()
  sessionsDb.clear()
  eventsDb.clear()
  journeysDb.clear()
  visitorToJourney.clear()
  customerToJourney.clear()
}
