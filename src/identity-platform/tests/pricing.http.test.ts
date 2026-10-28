// @vitest-environment node
//
// Per-application pricing (Madar Admin packages) and platform settings, end to end: what staff
// set is exactly what the marketplace shows and what checkout charges; the trial length,
// sign-up switch, and maintenance mode apply immediately; and a customer can never switch a paid
// application on through a plain settings update.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

const STAFF_EMAIL = "staff@madar.test"
const PASSWORD = "VeryStrongPassword123!"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  process.env.MOYASAR_PUBLISHABLE_KEY = "pk_test_fixture"
  process.env.MOYASAR_SECRET_KEY = "sk_test_fixture"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())

  container = createIdentityPlatform({
    mode: "memory",
    config: { platformAdminEmails: [STAFF_EMAIL] },
  })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  delete process.env.MOYASAR_PUBLISHABLE_KEY
  delete process.env.MOYASAR_SECRET_KEY
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await database.end()
})

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

async function register(email: string, orgName: string) {
  return call<{ verificationToken: string }>("POST", "/v1/auth/register", null, {
    email,
    password: PASSWORD,
    fullName: `${orgName} Owner`,
    organizationName: orgName,
  })
}

async function signIn(email: string, orgName: string) {
  const registration = await register(email, orgName)
  await call("POST", "/v1/auth/verify-email", null, { token: registration.body.verificationToken })
  const login = await call<{ session: { accessToken: string } }>("POST", "/v1/auth/login", null, {
    email,
    password: PASSWORD,
  })
  const token = login.body.session.accessToken
  const actor = await container.commands.resolveActorFromAccessToken(token)
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', $3, now()) on conflict (id) do nothing`,
    [actor.userId, email, `${orgName} Owner`]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  return { token, actor }
}

interface PricingEntry {
  application: string
  mode: string
  packages: Array<{
    id: string
    name: string
    monthlyPriceHalalas: number | null
    yearlyPriceHalalas: number | null
    isActive: boolean
    legacyPlanTier: string | null
  }>
}

const newPackage = {
  name: "Expenses",
  description: "",
  features: ["تسجيل المصروفات"],
  monthlyPriceHalalas: 4900,
  yearlyPriceHalalas: 49000,
  isRecommended: false,
  isActive: true,
}

describe("pricing: the marketplace shows and checkout charges exactly what staff set", () => {
  it("seeds every application with today's Starter/Growth/Pro, and the bundle as contact-us", async () => {
    const customer = await signIn("owner@shop.test", "Shop")
    const pricing = await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)
    expect(pricing.status).toBe(200)
    expect(pricing.body).toHaveLength(9)

    const advertising = pricing.body.find((entry) => entry.application === "advertising")!
    expect(advertising.mode).toBe("packages")
    expect(advertising.packages.map((pkg) => [pkg.name, pkg.monthlyPriceHalalas])).toEqual([
      ["Starter", 9900],
      ["Growth", 29900],
      ["Pro", 49900],
    ])
    expect(pricing.body.find((entry) => entry.application === "madarComplete")!.mode).toBe(
      "contact"
    )
  })

  it("charges a package's yearly price at checkout, and refuses contact-us and missing prices", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")

    // Expenses becomes a single fixed price, monthly and yearly.
    const created = await call<{ id: string }>(
      "POST",
      "/v1/platform-admin/pricing/expenses/packages",
      staff.token,
      newPackage
    )
    expect(created.status).toBe(201)
    // A fixed-price application sells only its first package -- move the new one to the top.
    const adminPricing = await call<PricingEntry[]>(
      "GET",
      "/v1/platform-admin/pricing",
      staff.token
    )
    const expenses = adminPricing.body.find((entry) => entry.application === "expenses")!
    await call("PUT", "/v1/platform-admin/pricing/expenses/order", staff.token, {
      packageIds: [
        created.body.id,
        ...expenses.packages.map((pkg) => pkg.id).filter((id) => id !== created.body.id),
      ],
    })
    await call("PUT", "/v1/platform-admin/pricing/expenses/mode", staff.token, { mode: "fixed" })

    const yearly = await call<{ amount: number }>(
      "POST",
      "/v1/billing/moyasar/checkout",
      customer.token,
      { application: "expenses", packageId: created.body.id, interval: "yearly" }
    )
    expect(yearly.status).toBe(201)
    expect(yearly.body.amount).toBe(49000)

    // In fixed mode, only the first package is for sale.
    const otherPackage = expenses.packages.find((pkg) => pkg.id !== created.body.id)!
    expect(
      (
        await call("POST", "/v1/billing/moyasar/checkout", customer.token, {
          application: "expenses",
          packageId: otherPackage.id,
          interval: "monthly",
        })
      ).status
    ).toBe(409)

    // A seeded package has no yearly price.
    const advertising = adminPricing.body.find((entry) => entry.application === "advertising")!
    const noYearly = await call<{ code: string }>(
      "POST",
      "/v1/billing/moyasar/checkout",
      customer.token,
      { application: "advertising", packageId: advertising.packages[0].id, interval: "yearly" }
    )
    expect(noYearly).toMatchObject({ status: 409, body: { code: "PACKAGE_NOT_PURCHASABLE" } })

    // The bundle is contact-us until staff price it.
    const bundle = adminPricing.body.find((entry) => entry.application === "madarComplete")!
    expect(
      (
        await call("POST", "/v1/billing/moyasar/checkout", customer.token, {
          application: "madarComplete",
          packageId: bundle.packages[0].id,
          interval: "monthly",
        })
      ).status
    ).toBe(409)
  })

  it("stops selling and trialling an application staff hid, until it's shown again", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    expect(
      (
        await call("PUT", "/v1/platform-admin/pricing/pos/visibility", staff.token, {
          visible: false,
        })
      ).status
    ).toBe(200)

    const catalog = await call<Array<PricingEntry & { visible: boolean }>>(
      "GET",
      "/v1/pricing",
      customer.token
    )
    const pos = catalog.body.find((entry) => entry.application === "pos")!
    expect(pos.visible).toBe(false)
    expect(catalog.body.find((entry) => entry.application === "advertising")!.visible).toBe(true)

    const checkout = await call<{ code: string }>(
      "POST",
      "/v1/billing/moyasar/checkout",
      customer.token,
      { application: "pos", packageId: pos.packages[0].id, interval: "monthly" }
    )
    expect(checkout).toMatchObject({ status: 409, body: { code: "PACKAGE_NOT_PURCHASABLE" } })
    const trialPath = `/v1/organizations/${customer.actor.organizationId}/application-trials`
    const trial = await call<{ code: string }>("POST", trialPath, customer.token, {
      application: "pos",
    })
    expect(trial).toMatchObject({ status: 409, body: { code: "APPLICATION_UNAVAILABLE" } })

    await call("PUT", "/v1/platform-admin/pricing/pos/visibility", staff.token, { visible: true })
    expect((await call("POST", trialPath, customer.token, { application: "pos" })).status).toBe(201)
  })

  it("lets customers switch a free application on without paying, for up to a year", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const organizationId = customer.actor.organizationId
    const activate = (application: string) =>
      call<{ code?: string; settings?: Record<string, unknown> }>(
        "POST",
        `/v1/organizations/${organizationId}/free-activations`,
        customer.token,
        { application }
      )

    // Not free yet.
    expect((await activate("expenses")).status).toBe(409)

    await call("PUT", "/v1/platform-admin/pricing/expenses/mode", staff.token, {
      mode: "free",
      freeDays: 30,
    })
    // A free app needs a duration of 1 to 365 days.
    for (const freeDays of [undefined, null, 0, 366]) {
      expect(
        (
          await call("PUT", "/v1/platform-admin/pricing/ai/mode", staff.token, {
            mode: "free",
            freeDays,
          })
        ).status
      ).toBe(400)
    }
    await call("PUT", "/v1/platform-admin/pricing/ai/mode", staff.token, {
      mode: "free",
      freeDays: 365,
    })
    const catalog = await call<
      Array<{ application: string; mode: string; freeDays: number | null }>
    >("GET", "/v1/pricing", customer.token)
    expect(catalog.body.find((entry) => entry.application === "expenses")).toMatchObject({
      mode: "free",
      freeDays: 30,
    })
    expect(catalog.body.find((entry) => entry.application === "ai")).toMatchObject({
      mode: "free",
      freeDays: 365,
    })
    // A free app can't be bought.
    const expensesPackage = (
      await call<PricingEntry[]>("GET", "/v1/platform-admin/pricing", staff.token)
    ).body.find((entry) => entry.application === "expenses")!.packages[0]
    expect(
      (
        await call("POST", "/v1/billing/moyasar/checkout", customer.token, {
          application: "expenses",
          packageId: expensesPackage.id,
          interval: "monthly",
        })
      ).status
    ).toBe(409)

    const limited = await activate("expenses")
    expect(limited.status).toBe(201)
    expect(limited.body.settings?.expensesEnabled).toBe(true)
    expect((await activate("expenses")).status).toBe(400)
    const yearLong = await activate("ai")
    expect(yearLong.status).toBe(201)
    expect(yearLong.body.settings?.aiEnabled).toBe(true)
    // A free period is claimed once; deactivating and re-activating doesn't refill it.
    await call("PATCH", `/v1/organizations/${organizationId}`, customer.token, {
      settings: { expensesEnabled: false },
    })
    expect((await activate("expenses")).status).toBe(400)
  })

  it("switches a free period off as soon as it ends, with no grace period", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const organizationId = customer.actor.organizationId
    await database.query("update organizations set settings = $2::jsonb where id = $1", [
      organizationId,
      JSON.stringify({ expensesEnabled: true, aiEnabled: true }),
    ])
    const insert = (application: string, periodEnd: string) =>
      database.query(
        `insert into organization_subscriptions
           (id, organization_id, application, status, currency, source, started_at, current_period_end)
         values ($1, $2, $3, 'active', 'SAR', 'free', now(), $4)`,
        [randomUUID(), organizationId, application, periodEnd]
      )
    await insert("expenses", new Date(Date.now() - 60_000).toISOString())
    await insert("ai", new Date(Date.now() + 86_400_000).toISOString())

    const maintenance = await call<{ expired: number }>(
      "POST",
      "/v1/platform-admin/billing/maintenance",
      staff.token
    )
    expect(maintenance.body.expired).toBe(1)
    const settings = (
      await database.query<{ settings: Record<string, unknown> }>(
        "select settings from organizations where id = $1",
        [organizationId]
      )
    ).rows[0].settings
    expect(settings).toMatchObject({ expensesEnabled: false, aiEnabled: true })
  })

  it("hides inactive packages from customers and refuses deleting one customers are on", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const adminPricing = await call<PricingEntry[]>(
      "GET",
      "/v1/platform-admin/pricing",
      staff.token
    )
    const pro = adminPricing.body
      .find((entry) => entry.application === "pos")!
      .packages.find((pkg) => pkg.legacyPlanTier === "pro")!

    await call("PATCH", `/v1/platform-admin/packages/${pro.id}`, staff.token, {
      ...newPackage,
      name: "Pro",
      isActive: false,
    })
    const customerPricing = await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)
    expect(
      customerPricing.body
        .find((entry) => entry.application === "pos")!
        .packages.map((pkg) => pkg.id)
    ).not.toContain(pro.id)

    await call(
      "POST",
      `/v1/platform-admin/customers/${customer.actor.organizationId}/subscriptions`,
      staff.token,
      { application: "pos", packageId: pro.id, interval: "monthly", priceHalalas: 49900 }
    )
    const deleted = await call<{ code: string }>(
      "DELETE",
      `/v1/platform-admin/packages/${pro.id}`,
      staff.token
    )
    expect(deleted).toMatchObject({ status: 409, body: { code: "PACKAGE_IN_USE" } })
  })

  it("turns every application on when the bundle is granted, and back off when it ends", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const organizationId = customer.actor.organizationId

    const granted = await call<{ id: string }>(
      "POST",
      `/v1/platform-admin/customers/${organizationId}/subscriptions`,
      staff.token,
      { application: "madarComplete", interval: "yearly", priceHalalas: 999000 }
    )
    const settings = async () =>
      (
        await database.query<{ settings: Record<string, unknown> }>(
          "select settings from organizations where id = $1",
          [organizationId]
        )
      ).rows[0].settings
    expect(await settings()).toMatchObject({
      posEnabled: true,
      aiEnabled: true,
      expensesEnabled: true,
    })

    await call("POST", `/v1/platform-admin/subscriptions/${granted.body.id}/cancel`, staff.token)
    expect(await settings()).toMatchObject({ posEnabled: false, aiEnabled: false })
  })
})

describe("platform settings", () => {
  it("applies the trial length staff set to every application", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    expect(
      (await call("PATCH", "/v1/platform-admin/settings", staff.token, { trialDays: 14 })).status
    ).toBe(200)

    const trial = await call<{ settings: Record<string, string> }>(
      "POST",
      `/v1/organizations/${customer.actor.organizationId}/application-trials`,
      customer.token,
      { application: "pos" }
    )
    expect(trial.status).toBe(201)
    const days = (new Date(trial.body.settings.posTrialEndsAt).getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(14)

    const publicSettings = await call<{ trialDays: number }>(
      "GET",
      "/v1/platform/public-settings",
      null
    )
    expect(publicSettings.body.trialDays).toBe(14)
  })

  it("closes new sign-ups and keeps everyone but staff out during maintenance", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")

    await call("PATCH", "/v1/platform-admin/settings", staff.token, { newSignupsEnabled: false })
    expect((await register("late@shop.test", "Late Shop")).status).toBe(403)

    await call("PATCH", "/v1/platform-admin/settings", staff.token, { maintenanceMode: true })
    // An already signed-in customer is turned away on their next request, and can't sign in.
    expect((await call("GET", "/v1/pricing", customer.token)).status).toBe(503)
    expect(
      (await call("POST", "/v1/auth/login", null, { email: "owner@shop.test", password: PASSWORD }))
        .status
    ).toBe(503)
    // Staff are never locked out of the platform they're maintaining.
    expect((await call("GET", "/v1/platform-admin/settings", staff.token)).status).toBe(200)
  })

  it("rejects invalid settings", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    expect(
      (await call("PATCH", "/v1/platform-admin/settings", staff.token, { trialDays: 0 })).status
    ).toBe(400)
  })
})

describe("billing-controlled settings", () => {
  it("never lets a customer switch a paid application on through a settings update", async () => {
    const customer = await signIn("owner@shop.test", "Shop")
    const attempt = await call<{ code: string }>(
      "PATCH",
      `/v1/organizations/${customer.actor.organizationId}`,
      customer.token,
      { settings: { posEnabled: true } }
    )
    expect(attempt).toMatchObject({ status: 403, body: { code: "BILLING_CONTROLLED_SETTING" } })
  })
})

describe("coupons", () => {
  it("applies only to the applications, packages, and billing periods it was limited to", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const pricing = await call<PricingEntry[]>("GET", "/v1/platform-admin/pricing", staff.token)
    const growth = (application: string) =>
      pricing.body
        .find((entry) => entry.application === application)!
        .packages.find((pkg) => pkg.legacyPlanTier === "growth")!

    const created = await call<{ code: string; status: string }>(
      "POST",
      "/v1/platform-admin/coupons",
      staff.token,
      {
        code: "ads-pos-10",
        discountType: "percentage",
        discountValue: 10,
        applications: ["advertising", "pos"],
        billingIntervals: ["monthly"],
      }
    )
    expect(created).toMatchObject({ status: 201, body: { code: "ADS-POS-10", status: "active" } })

    const quote = (application: string, interval = "monthly") =>
      call<{ code?: string; discountHalalas?: number; finalAmountHalalas?: number }>(
        "POST",
        "/v1/billing/coupons/quote",
        customer.token,
        { code: "ADS-POS-10", application, packageId: growth(application).id, interval }
      )
    expect((await quote("pos")).body).toMatchObject({
      discountHalalas: 2990,
      finalAmountHalalas: 26910,
    })
    expect((await quote("ecommerce")).body).toMatchObject({ code: "COUPON_NOT_APPLICABLE" })

    // Duplicate codes are refused, whatever their case.
    expect(
      (
        await call("POST", "/v1/platform-admin/coupons", staff.token, {
          code: "Ads-Pos-10",
          discountType: "fixed",
          discountValue: 500,
          billingIntervals: ["yearly"],
        })
      ).status
    ).toBe(409)
  })

  it("rejects an unknown or expired code with a clear reason", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const pricing = await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)
    const pkg = pricing.body.find((entry) => entry.application === "pos")!.packages[0]
    await call("POST", "/v1/platform-admin/coupons", staff.token, {
      code: "OLD",
      discountType: "percentage",
      discountValue: 50,
      billingIntervals: ["monthly"],
      expiresOn: "2020-01-01",
    })
    for (const [code, reason] of [
      ["NOPE", "COUPON_NOT_FOUND"],
      ["OLD", "COUPON_EXPIRED"],
    ]) {
      const result = await call<{ code: string }>(
        "POST",
        "/v1/billing/coupons/quote",
        customer.token,
        {
          code,
          application: "pos",
          packageId: pkg.id,
          interval: "monthly",
        }
      )
      expect(result).toMatchObject({ status: 422, body: { code: reason } })
    }
  })
})
