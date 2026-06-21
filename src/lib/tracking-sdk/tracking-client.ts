import {
  resolveConfiguration,
  type TrackingSdkConfiguration,
  type ResolvedTrackingSdkConfiguration,
} from "./configuration"
import { createStorageAdapter, type StorageAdapter } from "./storage"
import { Transport } from "./transport"
import { RetryManager } from "./retry-manager"
import { QueueManager } from "./queue-manager"
import { VisitorManager } from "./visitor-manager"
import { IdentityManager } from "./identity-manager"
import { ConsentManager, type ConsentState } from "./consent-manager"
import { SessionManager } from "./session-manager"
import { EventTracker } from "./event-tracker"
import { PageTracker } from "./page-tracker"
import { ProductTracker, type ProductPayload } from "./product-tracker"
import { CartTracker, type CartPayload } from "./cart-tracker"
import { CheckoutTracker, type CheckoutPayload } from "./checkout-tracker"
import { PurchaseTracker, type PurchasePayload } from "./purchase-tracker"
import { collectTrackingContext, getCurrentPagePath } from "./context-collector"

export interface TrackingClientDependencies {
  fetchImpl?: typeof fetch
}

export class TrackingClient {
  private readonly config: ResolvedTrackingSdkConfiguration
  private readonly storage: StorageAdapter
  private readonly transport: Transport
  private readonly retryManager: RetryManager
  private readonly queueManager: QueueManager
  private readonly visitorManager: VisitorManager
  private readonly identityManager: IdentityManager
  private readonly consentManager: ConsentManager
  private readonly sessionManager: SessionManager
  private readonly eventTracker: EventTracker
  private readonly pageTracker: PageTracker
  private readonly productTracker: ProductTracker
  private readonly cartTracker: CartTracker
  private readonly checkoutTracker: CheckoutTracker
  private readonly purchaseTracker: PurchaseTracker

  private started = false
  private flushInterval: ReturnType<typeof setInterval> | null = null
  private onlineHandler: (() => void) | null = null
  private beforeUnloadHandler: (() => void) | null = null
  private popStateHandler: (() => void) | null = null
  private hashChangeHandler: (() => void) | null = null
  private originalPushState: History["pushState"] | null = null
  private originalReplaceState: History["replaceState"] | null = null

  constructor(config: TrackingSdkConfiguration, dependencies: TrackingClientDependencies = {}) {
    this.config = resolveConfiguration(config)
    this.storage = createStorageAdapter(this.config.storageBackend)
    this.transport = new Transport(this.config, dependencies.fetchImpl)
    this.retryManager = new RetryManager(this.config.retryCount)
    this.queueManager = new QueueManager(
      this.storage,
      this.transport,
      this.retryManager,
      this.config
    )
    this.visitorManager = new VisitorManager(this.storage, this.config)
    this.identityManager = new IdentityManager(this.storage, this.config)
    this.consentManager = new ConsentManager(this.storage, this.config)
    this.sessionManager = new SessionManager(this.storage, this.config)
    this.eventTracker = new EventTracker(
      this.queueManager,
      this.sessionManager,
      this.visitorManager,
      this.identityManager,
      this.consentManager
    )
    this.pageTracker = new PageTracker(this.eventTracker)
    this.productTracker = new ProductTracker(this.eventTracker)
    this.cartTracker = new CartTracker(this.eventTracker)
    this.checkoutTracker = new CheckoutTracker(this.eventTracker)
    this.purchaseTracker = new PurchaseTracker(this.eventTracker)
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    this.flushInterval = setInterval(() => {
      void this.flush()
    }, this.config.flushIntervalMs)

    this.onlineHandler = () => {
      void this.flush()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onlineHandler)
    }

    if (!this.config.autoTracking) {
      return
    }

    const context = collectTrackingContext(getCurrentPagePath())
    await this.eventTracker.startSession(context)
    await this.page(getCurrentPagePath())

    this.beforeUnloadHandler = () => {
      void this.eventTracker.endSession(getCurrentPagePath(), collectTrackingContext())
    }

    this.popStateHandler = () => {
      void this.page(getCurrentPagePath())
    }

    this.hashChangeHandler = () => {
      void this.page(getCurrentPagePath())
    }

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.beforeUnloadHandler)
      window.addEventListener("popstate", this.popStateHandler)
      window.addEventListener("hashchange", this.hashChangeHandler)
    }

    if (typeof window !== "undefined" && window.history) {
      this.originalPushState = window.history.pushState.bind(window.history)
      this.originalReplaceState = window.history.replaceState.bind(window.history)

      window.history.pushState = (...args) => {
        this.originalPushState?.(...args)
        void this.page(getCurrentPagePath())
      }

      window.history.replaceState = (...args) => {
        this.originalReplaceState?.(...args)
        void this.page(getCurrentPagePath())
      }
    }
  }

  stop(): void {
    if (!this.started) {
      return
    }

    this.started = false

    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    if (typeof window !== "undefined" && this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler)
    }

    if (typeof window !== "undefined" && this.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler)
    }

    if (typeof window !== "undefined" && this.popStateHandler) {
      window.removeEventListener("popstate", this.popStateHandler)
    }

    if (typeof window !== "undefined" && this.hashChangeHandler) {
      window.removeEventListener("hashchange", this.hashChangeHandler)
    }

    if (typeof window !== "undefined" && window.history) {
      if (this.originalPushState) {
        window.history.pushState = this.originalPushState
      }

      if (this.originalReplaceState) {
        window.history.replaceState = this.originalReplaceState
      }
    }

    this.onlineHandler = null
    this.beforeUnloadHandler = null
    this.popStateHandler = null
    this.hashChangeHandler = null
    this.originalPushState = null
    this.originalReplaceState = null
  }

  async track(name: string, payload: Record<string, unknown> = {}): Promise<void> {
    this.debug("track", { name, payload })
    await this.eventTracker.track(name, payload)
  }

  async identify(customerId: string): Promise<void> {
    this.debug("identify", { customerId })
    await this.eventTracker.identify(customerId)
  }

  async consent(consentState: ConsentState): Promise<void> {
    this.debug("consent", { consentState })
    await this.eventTracker.consent(consentState)
  }

  async page(path: string): Promise<void> {
    this.debug("page", { path })
    await this.pageTracker.page(path)
  }

  async product(payload: ProductPayload): Promise<void> {
    this.debug("product", payload)
    await this.productTracker.product(payload)
  }

  async cart(payload: CartPayload): Promise<void> {
    this.debug("cart", payload)
    await this.cartTracker.cart(payload)
  }

  async checkout(payload: CheckoutPayload): Promise<void> {
    this.debug("checkout", payload)
    await this.checkoutTracker.checkout(payload)
  }

  async purchase(payload: PurchasePayload): Promise<void> {
    this.debug("purchase", payload)
    await this.purchaseTracker.purchase(payload)
  }

  async flush(): Promise<void> {
    this.debug("flush", { queueSize: this.queueManager.count() })
    await this.queueManager.flush()
  }

  getQueueSize(): number {
    return this.queueManager.count()
  }

  private debug(message: string, payload: unknown): void {
    if (!this.config.debugMode) {
      return
    }

    console.debug("[tracking-sdk]", message, payload)
  }
}
