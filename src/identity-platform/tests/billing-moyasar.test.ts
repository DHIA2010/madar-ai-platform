// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { MoyasarBillingRepository } from "../billing/moyasar/repository"
import { MoyasarBillingService } from "../billing/moyasar/service"
import type { MoyasarWebhookPayload } from "../billing/moyasar/types"
import { CouponService } from "../coupons/service"
import { PricingService } from "../pricing/service"
import type { PurchasableApplication } from "../subscriptions/types"

let database: PostgresDatabase
let service: MoyasarBillingService
let pricing: PricingService

// The seeded package that corresponds to an old account-wide tier, bought monthly -- what every
// checkout in this file used to express as `planTier`.
async function tierPackage(
  application: PurchasableApplication,
  tier: "starter" | "growth" | "pro"
) {
  const catalog = await pricing.getCatalog({ includeInactive: false })
  const pkg = catalog
    .find((entry) => entry.application === application)!
    .packages.find((entry) => entry.legacyPlanTier === tier)!
  return { packageId: pkg.id, interval: "monthly" as const, price: pkg.monthlyPriceHalalas! }
}

async function checkout(application: PurchasableApplication, tier: "starter" | "growth" | "pro") {
  const { packageId, interval } = await tierPackage(application, tier)
  return service.createCheckoutIntent(actor(), { application, packageId, interval })
}

const ORG_A = randomUUID()
const ORG_B = randomUUID()
const USER_A = randomUUID()

function actor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    userId: USER_A,
    sessionId: randomUUID(),
    organizationId: ORG_A,
    workspaceId: null,
    roles: ["owner"],
    modulePermissions: ["settings:edit"],
    ...overrides,
  }
}

async function getOrgSettings(organizationId: string): Promise<Record<string, unknown>> {
  const result = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  return result.rows[0]?.settings ?? {}
}

async function setOrgSettingValue(organizationId: string, key: string, value: unknown) {
  const existing = await getOrgSettings(organizationId)
  const merged = { ...existing, [key]: value }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

async function countAuditLogs(entityId: string): Promise<number> {
  const result = await database.query<{ count: string }>(
    "select count(*)::text as count from audit_logs where entity_id = $1",
    [entityId]
  )
  return Number(result.rows[0]?.count ?? "0")
}

function mockFetchPaymentOnce(payment: {
  id: string
  status: string
  amount: number
  currency: string
  metadata?: Record<string, unknown>
}) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => payment,
  })
}

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'moyasar-test@madar.test', 'hash', 'Moyasar Test', now())`,
    [USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org A', $2, 'active')`,
    [ORG_A, USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org B', $2, 'active')`,
    [ORG_B, USER_A]
  )

  process.env.MOYASAR_PUBLISHABLE_KEY = "pk_test_fixture"
  process.env.MOYASAR_SECRET_KEY = "sk_test_fixture"
  process.env.MOYASAR_WEBHOOK_SECRET = "whsec_fixture"

  vi.stubGlobal("fetch", vi.fn())

  pricing = new PricingService(database)
  service = new MoyasarBillingService(
    database,
    new MoyasarBillingRepository(database),
    pricing,
    new CouponService(database)
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.MOYASAR_PUBLISHABLE_KEY
  delete process.env.MOYASAR_SECRET_KEY
  delete process.env.MOYASAR_WEBHOOK_SECRET
})

describe("createCheckoutIntent", () => {
  it("prices each package from its current Madar Admin price and returns the publishable key", async () => {
    for (const tier of ["starter", "growth", "pro"] as const) {
      const result = await checkout("advertising", tier)
      expect(result.amount).toBe((await tierPackage("advertising", tier)).price)
      expect(result.currency).toBe("SAR")
      expect(result.publishableKey).toBe("pk_test_fixture")
      expect(result.checkoutId).toBeTruthy()
    }
  })

  it("fails fast with a clear service-unavailable error when Moyasar isn't configured", async () => {
    delete process.env.MOYASAR_PUBLISHABLE_KEY
    await expect(checkout("pos", "starter")).rejects.toThrow(IdentityError)
  })
})

describe("confirmCheckout", () => {
  it("flips the application on, sets the plan tier, and clears any trial marker on a genuinely matching paid payment", async () => {
    const intent = await checkout("pos", "growth")
    await setOrgSettingValue(ORG_A, "posTrialEndsAt", new Date(Date.now() + 99999).toISOString())

    mockFetchPaymentOnce({
      id: "pay_123",
      status: "paid",
      amount: intent.amount,
      currency: intent.currency,
    })

    const result = await service.confirmCheckout(actor(), {
      checkoutId: intent.checkoutId,
      moyasarPaymentId: "pay_123",
    })

    expect(result.status).toBe("paid")
    const settings = await getOrgSettings(ORG_A)
    expect(settings.posEnabled).toBe(true)
    expect(settings.currentPlanTier).toBe("growth")
    expect(settings.posTrialEndsAt).toBe("")
    expect(await countAuditLogs(intent.checkoutId)).toBe(1)
  })

  it("marks the payment failed and leaves settings untouched when the Moyasar amount doesn't match what was charged for", async () => {
    const intent = await checkout("ecommerce", "pro")
    mockFetchPaymentOnce({
      id: "pay_tampered",
      status: "paid",
      amount: 1, // doesn't match the pro-tier amount this checkout was created for
      currency: intent.currency,
    })

    const result = await service.confirmCheckout(actor(), {
      checkoutId: intent.checkoutId,
      moyasarPaymentId: "pay_tampered",
    })

    expect(result.status).toBe("failed")
    const settings = await getOrgSettings(ORG_A)
    expect(settings.ecommerceEnabled).toBeUndefined()
  })

  it("is idempotent -- confirming an already-paid checkout a second time is a no-op, not a double-apply", async () => {
    const intent = await checkout("advertising", "starter")
    mockFetchPaymentOnce({
      id: "pay_once",
      status: "paid",
      amount: intent.amount,
      currency: intent.currency,
    })
    await service.confirmCheckout(actor(), {
      checkoutId: intent.checkoutId,
      moyasarPaymentId: "pay_once",
    })

    const second = await service.confirmCheckout(actor(), {
      checkoutId: intent.checkoutId,
      moyasarPaymentId: "pay_once",
    })

    expect(second.status).toBe("paid")
    expect(await countAuditLogs(intent.checkoutId)).toBe(1)
    expect(global.fetch).toHaveBeenCalledTimes(1) // second call short-circuits before any re-fetch
  })

  it("rejects a checkout that belongs to a different organization", async () => {
    const intent = await checkout("pos", "starter")

    await expect(
      service.confirmCheckout(actor({ organizationId: ORG_B }), {
        checkoutId: intent.checkoutId,
        moyasarPaymentId: "pay_cross_org",
      })
    ).rejects.toThrow(IdentityError)
  })
})

describe("handleWebhookEvent", () => {
  function webhookPayload(input: {
    checkoutId: string
    status: string
    amount: number
    currency: string
  }): MoyasarWebhookPayload {
    return {
      id: "evt_1",
      type: "payment_paid",
      secret_token: "whsec_fixture",
      data: {
        id: "pay_webhook",
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        metadata: { checkout_id: input.checkoutId },
      },
    }
  }

  it("flips settings straight from the webhook payload, with no outbound Moyasar API call", async () => {
    const intent = await checkout("madarApps", "pro")

    await service.handleWebhookEvent(
      webhookPayload({
        checkoutId: intent.checkoutId,
        status: "paid",
        amount: intent.amount,
        currency: intent.currency,
      })
    )

    const settings = await getOrgSettings(ORG_A)
    expect(settings.madarAppsEnabled).toBe(true)
    expect(settings.currentPlanTier).toBe("pro")
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("is a silent no-op for a checkout_id it doesn't recognize", async () => {
    await expect(
      service.handleWebhookEvent(
        webhookPayload({ checkoutId: randomUUID(), status: "paid", amount: 9900, currency: "SAR" })
      )
    ).resolves.toBeUndefined()
  })

  it("does not re-apply once a checkout is already paid", async () => {
    const intent = await checkout("pos", "starter")
    const payload = webhookPayload({
      checkoutId: intent.checkoutId,
      status: "paid",
      amount: intent.amount,
      currency: intent.currency,
    })

    await service.handleWebhookEvent(payload)
    await service.handleWebhookEvent(payload)

    expect(await countAuditLogs(intent.checkoutId)).toBe(1)
  })
})

describe("coupons at checkout", () => {
  async function createCoupon(overrides: Partial<Parameters<CouponService["create"]>[0]> = {}) {
    return new CouponService(database).create(
      {
        code: "SAVE20",
        discountType: "percentage",
        discountValue: 20,
        applications: [],
        packageIds: [],
        billingIntervals: ["monthly", "yearly"],
        usageLimit: null,
        expiresOn: null,
        isActive: true,
        ...overrides,
      },
      USER_A
    )
  }

  async function pay(intent: { checkoutId: string; amount: number; currency: string }) {
    await service.handleWebhookEvent({
      id: "evt_coupon",
      type: "payment_paid",
      secret_token: "whsec_fixture",
      data: {
        id: `pay_${intent.checkoutId}`,
        status: "paid",
        amount: intent.amount,
        currency: intent.currency,
        metadata: { checkout_id: intent.checkoutId },
      },
    })
  }

  it("charges the discounted price and counts the use only once the payment succeeds", async () => {
    await createCoupon()
    const { packageId, interval, price } = await tierPackage("pos", "growth")

    const intent = await service.createCheckoutIntent(actor(), {
      application: "pos",
      packageId,
      interval,
      couponCode: "save20",
    })
    expect(intent.amount).toBe(price - Math.round(price * 0.2))

    const coupons = new CouponService(database)
    expect((await coupons.list())[0].usedCount).toBe(0)
    await pay(intent)
    await pay(intent)
    expect((await coupons.list())[0].usedCount).toBe(1)
  })

  it("refuses an exhausted coupon, and never discounts below 1 SAR", async () => {
    await createCoupon({
      code: "ONCE",
      usageLimit: 1,
      discountType: "fixed",
      discountValue: 1_000_000,
    })
    const { packageId, interval } = await tierPackage("pos", "starter")

    const first = await service.createCheckoutIntent(actor(), {
      application: "pos",
      packageId,
      interval,
      couponCode: "ONCE",
    })
    expect(first.amount).toBe(100)
    await pay(first)

    await expect(
      service.createCheckoutIntent(actor(), {
        application: "pos",
        packageId,
        interval,
        couponCode: "ONCE",
      })
    ).rejects.toMatchObject({ code: "COUPON_EXHAUSTED" })
  })
})
