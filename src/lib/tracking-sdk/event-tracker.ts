import { collectTrackingContext } from "./context-collector"
import type { ConsentState } from "./consent-manager"
import { QueueManager } from "./queue-manager"
import { SessionManager } from "./session-manager"
import { VisitorManager } from "./visitor-manager"
import { IdentityManager } from "./identity-manager"
import { ConsentManager } from "./consent-manager"
import type { TrackingContext } from "./contracts"

function createEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export class EventTracker {
  constructor(
    private readonly queueManager: QueueManager,
    private readonly sessionManager: SessionManager,
    private readonly visitorManager: VisitorManager,
    private readonly identityManager: IdentityManager,
    private readonly consentManager: ConsentManager
  ) {}

  async startSession(context = collectTrackingContext()): Promise<string> {
    const session = this.sessionManager.ensureSession(context.landingPage)

    await this.queueManager.sendOrQueue("/session/start", {
      visitorId: this.visitorManager.getVisitorId(),
      customerId: this.identityManager.getCustomerId() ?? undefined,
      context,
    })

    return session.sessionId
  }

  async endSession(exitPage: string, context = collectTrackingContext()): Promise<void> {
    const session = this.sessionManager.getSession()
    if (!session) {
      return
    }

    await this.queueManager.sendOrQueue("/session/end", {
      sessionId: session.sessionId,
      context,
      exitPage,
    })

    this.sessionManager.clearSession()
  }

  async track(
    name: string,
    payload: Record<string, unknown> | object = {},
    context: TrackingContext = collectTrackingContext()
  ): Promise<void> {
    const session = this.sessionManager.ensureSession(context.landingPage)
    this.sessionManager.touch()

    await this.queueManager.sendOrQueue("/track", {
      sessionId: session.sessionId,
      eventId: createEventId(),
      name,
      context,
      payload,
    })
  }

  async identify(customerId: string): Promise<void> {
    this.identityManager.setCustomerId(customerId)

    await this.queueManager.sendOrQueue("/identify", {
      sourceVisitorId: this.visitorManager.getVisitorId(),
      targetCustomerId: customerId,
    })
  }

  async consent(consent: ConsentState): Promise<void> {
    this.consentManager.setConsent(consent)

    await this.queueManager.sendOrQueue("/consent", {
      visitorId: this.visitorManager.getVisitorId(),
      consent,
    })
  }
}
