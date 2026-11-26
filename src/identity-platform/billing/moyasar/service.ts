import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { writeAuditLog } from "../../infrastructure/postgres/audit-log-writer"
import { crmPaymentReceived } from "../../crm/service"
import { notify } from "../../notifications/service"
import type { CouponService } from "../../coupons/service"
import type { PlatformOffersService } from "../../pricing/offers"
import type { PricingService } from "../../pricing/service"
import { extraBranchPrice } from "../../pricing/service"
import { activationSettingsPatch } from "../../subscriptions/activation"
import { BranchAllowanceService } from "../../subscriptions/branches"
import { activatePaid, addExtraBranches, trialEndFromSettings } from "../../subscriptions/lifecycle"
import {
  ADDON_CODES,
  ADDON_ERRORS,
  type AddonCode,
  AddonsService,
} from "../../subscriptions/addons"
import { PostgresOrganizationSubscriptionRepository } from "../../subscriptions/repository"

import { MoyasarApiClient } from "./client"
import { resolveMoyasarCredentials } from "./credentials"
import { MOYASAR_CURRENCY } from "./plan-pricing"
import { MoyasarBillingRepository } from "./repository"
import type {
  ConfirmCheckoutInput,
  CreateAddonCheckoutInput,
  CreateBranchCheckoutInput,
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
    private readonly coupons: CouponService,
    // Offers (pricing/offers.ts); absent = offers can't be bought.
    private readonly offers: PlatformOffersService | null = null
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
    // An offer is already a reduced price: no coupon on top of it.
    if (purchase.offerYears && input.couponCode) {
      throw ERRORS.conflict(
        "COUPON_NOT_WITH_OFFER",
        "A coupon can't be used together with an offer."
      )
    }
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
      extraBranches: purchase.extraBranches,
      offerYears: purchase.offerYears,
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

  // Branches added to the running POS / Madar Complete subscription, charged for what's left of
  // its current period. The price comes from the package, never from the client.
  async createBranchCheckout(
    actor: AuthenticatedActor,
    input: CreateBranchCheckoutInput
  ): Promise<CreateCheckoutIntentResult> {
    const branches = new BranchAllowanceService(this.db, this.pricing)
    const allowance = await branches.get(actor.organizationId)
    const subscription = allowance.subscription
    if (
      !allowance.canBuyBranches ||
      !subscription ||
      !subscription.interval ||
      allowance.proratedHalalasPerBranch === null
    ) {
      throw ERRORS.conflict(
        "BRANCHES_NOT_PURCHASABLE",
        "Branches can be added to a running paid subscription only."
      )
    }
    const running = (await branches.branchSubscription(actor.organizationId))?.subscription
    const credentials = await this.requireCredentials()
    const payment = await this.repository.createCheckout({
      organizationId: actor.organizationId,
      requestedByUserId: actor.userId,
      application: subscription.application,
      planTier: null,
      packageId: running?.packageId ?? null,
      billingInterval: subscription.interval,
      purpose: "branches",
      extraBranches: input.count,
      coupon: null,
      amount: allowance.proratedHalalasPerBranch * input.count,
      currency: MOYASAR_CURRENCY,
    })
    return {
      checkoutId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      publishableKey: credentials.publishableKey,
    }
  }

  // One of Madar Admin's offers: its package for its years at the offer's one price (yearly, no
  // coupon, no extra branches); its included apps and add-ons are switched on once it's paid.
  async createOfferCheckout(
    actor: AuthenticatedActor,
    input: { offerId: string }
  ): Promise<CreateCheckoutIntentResult> {
    if (!this.offers) throw ERRORS.serviceUnavailable("Offers are unavailable.")
    const offer = await this.offers.purchasable(input.offerId)
    const pkg = await this.pricing.getPackage(offer.package.id)
    const credentials = await this.requireCredentials()
    const payment = await this.repository.createCheckout({
      organizationId: actor.organizationId,
      requestedByUserId: actor.userId,
      application: offer.application,
      planTier: pkg.legacyPlanTier === "enterprise" ? null : pkg.legacyPlanTier,
      packageId: pkg.id,
      billingInterval: "yearly",
      offerYears: offer.years,
      offerId: offer.id,
      coupon: null,
      amount: offer.priceHalalas,
      currency: MOYASAR_CURRENCY,
    })
    return {
      checkoutId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      publishableKey: credentials.publishableKey,
    }
  }

  // The apps and add-ons an offer includes, switched on for the offer's years (each after any
  // period of it already running). They are kept at their normal yearly price, which is what
  // continuing them would cost.
  private async applyOfferExtras(payment: MoyasarPaymentRecord) {
    if (!payment.offerId || !this.offers) return
    const offer = await this.offers.get(payment.offerId).catch(() => null)
    if (!offer) return
    const years = payment.offerYears ?? offer.years
    const subscriptions = new PostgresOrganizationSubscriptionRepository(this.db)
    const catalog = await this.pricing.getCatalog({ includeInactive: false })
    for (const application of offer.bonusApplications) {
      const organization = await this.db.query<{ settings: Record<string, unknown> | null }>(
        "SELECT settings FROM organizations WHERE id = $1",
        [payment.organizationId]
      )
      const trialEndsAt = trialEndFromSettings(organization.rows[0]?.settings, application)
      await this.repository.applySettingsPatch(
        payment.organizationId,
        activationSettingsPatch(application, null)
      )
      const pkg = [...(catalog.find((entry) => entry.application === application)?.packages ?? [])]
        .filter((entry) => entry.yearlyPriceHalalas !== null)
        .sort((a, b) => (a.yearlyPriceHalalas ?? 0) - (b.yearlyPriceHalalas ?? 0))[0]
      await subscriptions.save(
        activatePaid(
          await subscriptions.findByOrganizationAndApplication(payment.organizationId, application),
          {
            id: randomUUID(),
            organizationId: payment.organizationId,
            application,
            planTier: null,
            package: pkg ? { id: pkg.id, name: pkg.name } : null,
            interval: "yearly",
            periods: years,
            priceHalalas: pkg?.yearlyPriceHalalas ?? null,
            extraBranches: 0,
            trialEndsAt,
            source: "payment",
            now: new Date().toISOString(),
          }
        )
      )
    }
    const addons = new AddonsService(this.db)
    for (const code of offer.bonusAddons) {
      if (!(ADDON_CODES as readonly string[]).includes(code)) continue
      for (let year = 0; year < years; year += 1) {
        await addons.extend(payment.organizationId, code as AddonCode, "yearly", "payment")
      }
    }
  }

  // A period of a paid add-on, priced from Madar Admin's add-on price -- never from the client.
  // Not tied to any app, so the payment row carries the generic "madarApps" application.
  async createAddonCheckout(
    actor: AuthenticatedActor,
    input: CreateAddonCheckoutInput
  ): Promise<CreateCheckoutIntentResult> {
    if (!(ADDON_CODES as readonly string[]).includes(input.addonCode)) throw ADDON_ERRORS.unknown()
    const price = await new AddonsService(this.db).price(input.addonCode)
    const amount =
      input.interval === "yearly" ? price.yearlyPriceHalalas : price.monthlyPriceHalalas
    if (!price.isActive || amount <= 0) throw ADDON_ERRORS.unavailable()
    const credentials = await this.requireCredentials()
    const payment = await this.repository.createCheckout({
      organizationId: actor.organizationId,
      requestedByUserId: actor.userId,
      application: "madarApps",
      planTier: null,
      packageId: null,
      billingInterval: input.interval,
      purpose: "addon",
      addonCode: input.addonCode,
      coupon: null,
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
      const claimed = await this.repository.markResolved({
        id: payment.id,
        moyasarPaymentId: moyasarPayment.id,
        status: isGenuinelyPaid ? "paid" : "failed",
        rawPayload: moyasarPayment,
      })
      // Already applied by the other caller (the webhook and the browser's confirm racing): what
      // was bought is on the account once, and is not applied again.
      if (!claimed) return (await this.repository.findById(payment.id)) ?? payment
      const resolved = claimed

      if (isGenuinelyPaid && payment.purpose === "addon" && payment.addonCode) {
        const addon = await new AddonsService(this.db).extend(
          payment.organizationId,
          payment.addonCode as AddonCode,
          payment.billingInterval,
          "payment"
        )
        await writeAuditLog(this.db, {
          action: "billing.addon_purchased",
          actorUserId: payment.requestedByUserId,
          organizationId: payment.organizationId,
          workspaceId: null,
          entityType: "billing_moyasar_payment",
          entityId: payment.id,
          metadata: {
            addonCode: payment.addonCode,
            interval: payment.billingInterval,
            currentPeriodEnd: addon.currentPeriodEnd,
            moyasarPaymentId: moyasarPayment.id,
          },
        })
      } else if (isGenuinelyPaid && payment.purpose === "branches") {
        // More branches on the running subscription; its next renewal charges for them too.
        const subscriptions = new PostgresOrganizationSubscriptionRepository(this.db)
        const existing = await subscriptions.findByOrganizationAndApplication(
          payment.organizationId,
          payment.application
        )
        if (existing) {
          const pkg = existing.packageId
            ? await this.pricing.getPackage(existing.packageId).catch(() => null)
            : null
          const perBranch = pkg ? (extraBranchPrice(pkg, payment.billingInterval) ?? 0) : 0
          await subscriptions.save(
            addExtraBranches(existing, {
              count: payment.extraBranches,
              addedPriceHalalas: perBranch * payment.extraBranches,
              now: new Date().toISOString(),
            })
          )
        }
        await writeAuditLog(this.db, {
          action: "billing.branches_added",
          actorUserId: payment.requestedByUserId,
          organizationId: payment.organizationId,
          workspaceId: null,
          entityType: "billing_moyasar_payment",
          entityId: payment.id,
          metadata: {
            application: payment.application,
            count: payment.extraBranches,
            moyasarPaymentId: moyasarPayment.id,
          },
        })
      } else if (isGenuinelyPaid) {
        // Read before the patch below clears it: paying during a trial keeps the days left.
        const organization = await this.db.query<{ settings: Record<string, unknown> | null }>(
          "SELECT settings FROM organizations WHERE id = $1",
          [payment.organizationId]
        )
        const trialEndsAt = trialEndFromSettings(
          organization.rows[0]?.settings,
          payment.application
        )
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
              // An offer pays for several years at once; what is kept as the subscription's
              // price is one ordinary year, which is what its renewal will cost.
              periods: payment.offerYears ?? 1,
              priceHalalas:
                payment.offerYears && pkg?.yearlyPriceHalalas != null
                  ? pkg.yearlyPriceHalalas +
                    payment.extraBranches * (extraBranchPrice(pkg, "yearly") ?? 0)
                  : payment.amount,
              extraBranches: payment.extraBranches,
              trialEndsAt,
              source: "payment",
              now: new Date().toISOString(),
            }
          )
        )

        await this.applyOfferExtras(payment)

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
            offerYears: payment.offerYears,
            offerId: payment.offerId,
            couponId: payment.couponId,
            moyasarPaymentId: moyasarPayment.id,
          },
        })
      }

      // Tells the customer's owners/admins whether the payment went through.
      await notify(this.db, {
        organizationId: payment.organizationId,
        type: isGenuinelyPaid ? "payment_succeeded" : "payment_failed",
        audience: "admin",
        params: {
          application: payment.application,
          amount: payment.amount / 100,
          currency: payment.currency,
        },
        link: "/marketplace",
        dedupeKey: `payment:${payment.id}`,
      })
      if (isGenuinelyPaid) {
        await crmPaymentReceived(this.db, {
          organizationId: payment.organizationId,
          amountHalalas: payment.amount,
          application: payment.application,
        })
      }

      return resolved
    })
  }
}
