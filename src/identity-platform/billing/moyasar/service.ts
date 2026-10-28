import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { writeAuditLog } from "../../infrastructure/postgres/audit-log-writer"
import type { CouponService } from "../../coupons/service"
import type { PricingService } from "../../pricing/service"
import { activationSettingsPatch } from "../../subscriptions/activation"
import { activatePaid } from "../../subscriptions/lifecycle"
import { PostgresOrganizationSubscriptionRepository } from "../../subscriptions/repository"

import { MoyasarApiClient } from "./client"
import { resolveMoyasarCredentials } from "./credentials"
import { MOYASAR_CURRENCY } from "./plan-pricing"
import { MoyasarBillingRepository } from "./repository"
import type {
  ConfirmCheckoutInput,
  CreateCheckoutIntentInput,
  CreateCheckoutIntentResult,
  MoyasarPaymentRecord,
  MoyasarWebhookPayload,
} from "./types"

export class MoyasarBillingService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly repository: MoyasarBillingRepository,
    private readonly pricing: PricingService,
    private readonly coupons: CouponService
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
    // The amount comes from the package's current price in Madar Admin -- never from the client.
    // A "contact us" application, an inactive package, or a period with no price is refused here.
    const purchase = await this.pricing.resolvePurchase(input)
    // A coupon is re-checked here (not just trusted from the customer's earlier quote) and only
    // counted as used once the payment actually succeeds.
    const quote = input.couponCode
      ? await this.coupons.quote({
          code: input.couponCode,
          application: input.application,
          packageId: purchase.package.id,
          interval: purchase.interval,
          amountHalalas: purchase.amountHalalas,
        })
      : null

    const credentials = await this.requireCredentials()
    const payment = await this.repository.createCheckout({
      organizationId: actor.organizationId,
      requestedByUserId: actor.userId,
      application: input.application,
      planTier:
        purchase.package.legacyPlanTier === "enterprise" ? null : purchase.package.legacyPlanTier,
      packageId: purchase.package.id,
      billingInterval: purchase.interval,
      coupon: quote
        ? {
            id: quote.couponId,
            originalAmount: quote.originalAmountHalalas,
            discountHalalas: quote.discountHalalas,
          }
        : null,
      amount: quote ? quote.finalAmountHalalas : purchase.amountHalalas,
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
        await this.repository.applySettingsPatch(
          payment.organizationId,
          activationSettingsPatch(payment.application, payment.planTier)
        )

        // One period (the one bought at checkout) at the amount actually charged. The package's
        // name is read now; a package deleted since checkout just leaves the name empty.
        const pkg = payment.packageId
          ? await this.pricing.getPackage(payment.packageId).catch(() => null)
          : null
        const subscriptions = new PostgresOrganizationSubscriptionRepository(this.db)
        await subscriptions.save(
          activatePaid(
            await subscriptions.findByOrganizationAndApplication(
              payment.organizationId,
              payment.application
            ),
            {
              id: randomUUID(),
              organizationId: payment.organizationId,
              application: payment.application,
              planTier: payment.planTier,
              package: payment.packageId ? { id: payment.packageId, name: pkg?.name ?? "" } : null,
              interval: payment.billingInterval,
              priceHalalas: payment.amount,
              source: "payment",
              now: new Date().toISOString(),
            }
          )
        )

        if (payment.couponId) {
          await this.coupons.redeem({
            couponId: payment.couponId,
            organizationId: payment.organizationId,
            paymentId: payment.id,
            discountHalalas: payment.discountHalalas ?? 0,
          })
        }

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
            packageId: payment.packageId,
            interval: payment.billingInterval,
            couponId: payment.couponId,
            moyasarPaymentId: moyasarPayment.id,
          },
        })
      }

      return resolved
    })
  }
}
