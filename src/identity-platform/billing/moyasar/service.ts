import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { writeAuditLog } from "../../infrastructure/postgres/audit-log-writer"

import { MoyasarApiClient } from "./client"
import { resolveMoyasarCredentials } from "./credentials"
import { MOYASAR_CURRENCY, MOYASAR_PLAN_TIER_AMOUNT_HALALAS } from "./plan-pricing"
import { MoyasarBillingRepository } from "./repository"
import type {
  ConfirmCheckoutInput,
  CreateCheckoutIntentInput,
  CreateCheckoutIntentResult,
  MoyasarPaymentRecord,
  MoyasarWebhookPayload,
} from "./types"

// A fourth copy of this map (frontend: applications-catalog.service.ts, backend:
// command-handlers.ts's private APPLICATION_SETTINGS_KEY, ai-chat/guards.ts's own copy) --
// consistent with the existing duplication precedent: billing/moyasar/ must not reach into
// IdentityCommandHandlers' private members, and command-handlers.ts must not import feature
// modules.
const APPLICATION_SETTINGS_KEY: Record<CreateCheckoutIntentInput["application"], string> = {
  advertising: "advertisingEnabled",
  ecommerce: "ecommerceEnabled",
  pos: "posEnabled",
  madarApps: "madarAppsEnabled",
}

export class MoyasarBillingService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly repository: MoyasarBillingRepository
  ) {}

  // Credentials are resolved lazily per call rather than once at server startup -- createServer's
  // setup section (server.ts) is synchronous, same reasoning as maxmind-credentials.ts's lazy
  // resolveMaxmindCredentials(). The AWS-backed provider already caches in-memory for the process
  // lifetime (see credentials.ts), so this costs nothing beyond the very first call.
  private async requireCredentials() {
    const credentials = await resolveMoyasarCredentials()
    if (!credentials) {
      throw ERRORS.serviceUnavailable("Moyasar billing is not configured.")
    }
    return credentials
  }

  async createCheckoutIntent(
    actor: AuthenticatedActor,
    input: CreateCheckoutIntentInput
  ): Promise<CreateCheckoutIntentResult> {
    const amount = MOYASAR_PLAN_TIER_AMOUNT_HALALAS[input.planTier]
    if (amount === undefined) {
      // Only reachable for an 'enterprise' tier bypassing the zod enum, or a future tier added to
      // the type without a price here -- enterprise is "تواصل معنا" and never has a self-serve
      // checkout amount, see plan-pricing.ts.
      throw ERRORS.validation({ planTier: "This plan is not available for self-serve checkout." })
    }

    const credentials = await this.requireCredentials()
    const payment = await this.repository.createCheckout({
      organizationId: actor.organizationId,
      requestedByUserId: actor.userId,
      application: input.application,
      planTier: input.planTier,
      amount,
      currency: MOYASAR_CURRENCY,
    })

    return {
      checkoutId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      publishableKey: credentials.publishableKey,
    }
  }

  async confirmCheckout(
    actor: AuthenticatedActor,
    input: ConfirmCheckoutInput
  ): Promise<MoyasarPaymentRecord> {
    const payment = await this.repository.findById(input.checkoutId)
    if (!payment || payment.organizationId !== actor.organizationId) {
      throw ERRORS.notFound("Checkout")
    }
    if (payment.status === "paid") {
      // Already resolved, most likely by the webhook landing first -- idempotent no-op rather
      // than an error, since the frontend callback page calling this is a normal race, not a bug.
      return payment
    }

    // Independently re-fetches from Moyasar with the secret key rather than trusting whatever
    // status the frontend redirect claims -- the one thing standing between this route and a
    // forged "it's paid" call from a tampered client.
    const credentials = await this.requireCredentials()
    const moyasarPayment = await new MoyasarApiClient(credentials.secretKey).fetchPayment(
      input.moyasarPaymentId
    )
    return this.resolvePayment(payment, moyasarPayment)
  }

  async handleWebhookEvent(payload: MoyasarWebhookPayload): Promise<void> {
    const checkoutId =
      typeof payload.data.metadata?.checkout_id === "string"
        ? payload.data.metadata.checkout_id
        : null
    if (!checkoutId) {
      return
    }

    const payment = await this.repository.findById(checkoutId)
    if (!payment || payment.status === "paid") {
      return
    }

    await this.resolvePayment(payment, payload.data)
  }

  private async resolvePayment(
    payment: MoyasarPaymentRecord,
    moyasarPayment: { id: string; status: string; amount: number; currency: string }
  ): Promise<MoyasarPaymentRecord> {
    // Amount/currency are re-checked against what we charged for at checkout-intent time -- a
    // payment landing on Moyasar's side for a different amount than this checkout expected must
    // never flip the subscription on, even if its status says "paid".
    const isGenuinelyPaid =
      moyasarPayment.status === "paid" &&
      moyasarPayment.amount === payment.amount &&
      moyasarPayment.currency === payment.currency

    return this.db.withTransaction(async () => {
      const resolved = await this.repository.markResolved({
        id: payment.id,
        moyasarPaymentId: moyasarPayment.id,
        status: isGenuinelyPaid ? "paid" : "failed",
        rawPayload: moyasarPayment,
      })

      if (isGenuinelyPaid) {
        await this.repository.applySettingsPatch(payment.organizationId, {
          [APPLICATION_SETTINGS_KEY[payment.application]]: true,
          currentPlanTier: payment.planTier,
          // Clears any earlier free-trial expiry marker, same reasoning as
          // approveSubscriptionActivationRequest in command-handlers.ts -- a real paid charge must
          // never be mistaken for a lapsed trial by ai-chat/guards.ts or the frontend's
          // resolveApplicationStatus.
          [`${payment.application}TrialEndsAt`]: "",
        })

        await writeAuditLog(this.db, {
          action: "billing.moyasar_payment_confirmed",
          actorUserId: payment.requestedByUserId,
          organizationId: payment.organizationId,
          workspaceId: null,
          entityType: "billing_moyasar_payment",
          entityId: payment.id,
          metadata: {
            application: payment.application,
            planTier: payment.planTier,
            moyasarPaymentId: moyasarPayment.id,
          },
        })
      }

      return resolved
    })
  }
}
