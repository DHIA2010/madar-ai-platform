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
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb) on conflict (id) do nothing`,
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
    includedBranches: number
    extraBranchMonthlyHalalas: number | null
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
  it("seeds every application with the November 2026 pricing", async () => {
    const customer = await signIn("owner@shop.test", "Shop")
    const pricing = await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)
    expect(pricing.status).toBe(200)
    expect(pricing.body).toHaveLength(11)

    const advertising = pricing.body.find((entry) => entry.application === "advertising")!
    expect(advertising.mode).toBe("packages")
    expect(advertising.packages.map((pkg) => [pkg.name, pkg.monthlyPriceHalalas])).toEqual([
      ["أساسي", 14900],
      ["نمو", 29900],
      ["احترافي", 54900],
    ])
    // POS: one branch included, each further branch an add-on; yearly is two months free.
    const pos = pricing.body.find((entry) => entry.application === "pos")!
    expect(
      pos.packages.map((pkg) => [
        pkg.name,
        pkg.monthlyPriceHalalas,
        pkg.yearlyPriceHalalas,
        pkg.includedBranches,
        pkg.extraBranchMonthlyHalalas,
      ])
    ).toEqual([
      ["أساسي", 14900, 149000, 1, 9900],
      ["نمو", 24900, 249000, 2, 9900],
      ["احترافي", 39900, 399000, 3, 9900],
    ])
    const bundle = pricing.body.find((entry) => entry.application === "madarComplete")!
    expect(bundle.mode).toBe("fixed")
    expect(bundle.packages[0]).toMatchObject({
      monthlyPriceHalalas: 89900,
      extraBranchMonthlyHalalas: 9900,
    })
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

    // A package with no yearly price isn't sold yearly.
    const monthlyOnly = await call<{ id: string }>(
      "POST",
      "/v1/platform-admin/pricing/advertising/packages",
      staff.token,
      { ...newPackage, name: "Monthly only", yearlyPriceHalalas: null }
    )
    const noYearly = await call<{ code: string }>(
      "POST",
      "/v1/billing/moyasar/checkout",
      customer.token,
      { application: "advertising", packageId: monthlyOnly.body.id, interval: "yearly" }
    )
    expect(noYearly).toMatchObject({ status: 409, body: { code: "PACKAGE_NOT_PURCHASABLE" } })

    // Contact-us isn't sold online.
    const bundle = adminPricing.body.find((entry) => entry.application === "madarComplete")!
    await call("PUT", "/v1/platform-admin/pricing/madarComplete/mode", staff.token, {
      mode: "contact",
    })
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

  it("sells extra branches on top of the one a package includes, and stops a branch past them", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const pricing = await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)
    const growth = pricing.body
      .find((entry) => entry.application === "pos")!
      .packages.find((pkg) => pkg.legacyPlanTier === "growth")!

    // Package + 2 branches x 99 (the same on every package).
    const checkout = await call<{ amount: number }>(
      "POST",
      "/v1/billing/moyasar/checkout",
      customer.token,
      { application: "pos", packageId: growth.id, interval: "monthly", extraBranches: 2 }
    )
    expect(checkout).toMatchObject({ status: 201, body: { amount: 24900 + 2 * 9900 } })
    // Ads sells the same add-on as workspaces, at the same price.
    const advertising = pricing.body.find((entry) => entry.application === "advertising")!
    const adsCheckout = await call<{ amount: number }>(
      "POST",
      "/v1/billing/moyasar/checkout",
      customer.token,
      {
        application: "advertising",
        packageId: advertising.packages[0].id,
        interval: "monthly",
        extraBranches: 1,
      }
    )
    expect(adsCheckout).toMatchObject({ status: 201, body: { amount: 14900 + 9900 } })

    // No POS subscription: branches aren't limited.
    const free = await call<{ enforced: boolean }>("GET", "/v1/branches/allowance", customer.token)
    expect(free.body.enforced).toBe(false)

    // A free trial (no package yet) may try 3 branches, like احترافي.
    await database.query(
      `insert into organization_subscriptions
         (id, organization_id, application, status, source, started_at, trial_ends_at)
       values ($1, $2, 'pos', 'trial', 'trial', now(), $3)`,
      [randomUUID(), customer.actor.organizationId, new Date(Date.now() + 7 * 86_400_000)]
    )
    const trial = await call<{ allowed: number; canBuyBranches: boolean }>(
      "GET",
      "/v1/branches/allowance",
      customer.token
    )
    expect(trial.body).toMatchObject({ allowed: 3, canBuyBranches: false })

    // Granted Growth (2 branches included) with one extra branch: 3 allowed.
    const granted = await call<{ id: string; extraBranches: number }>(
      "POST",
      `/v1/platform-admin/customers/${customer.actor.organizationId}/subscriptions`,
      staff.token,
      { application: "pos", packageId: growth.id, interval: "monthly", extraBranches: 1 }
    )
    expect(granted).toMatchObject({ status: 201, body: { extraBranches: 1 } })
    const addBranchRow = () =>
      database.query(
        `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Branch', 'active')`,
        [randomUUID(), customer.actor.organizationId]
      )
    await addBranchRow()
    const allowance = await call<{
      enforced: boolean
      used: number
      allowed: number
      canBuyBranches: boolean
      proratedHalalasPerBranch: number
    }>("GET", "/v1/branches/allowance", customer.token)
    expect(allowance.body).toMatchObject({
      enforced: true,
      used: 1,
      allowed: 3,
      canBuyBranches: true,
    })
    // A whole month is left: about a full branch's price.
    expect(allowance.body.proratedHalalasPerBranch).toBeGreaterThan(9000)
    expect(allowance.body.proratedHalalasPerBranch).toBeLessThanOrEqual(9900)

    await addBranchRow()
    await addBranchRow()
    const blocked = await call<{ code: string }>("POST", "/v1/workspaces", customer.token, {
      organizationId: customer.actor.organizationId,
      name: "Third branch",
    })
    expect(blocked).toMatchObject({ status: 409, body: { code: "BRANCH_LIMIT_REACHED" } })

    // Buying one more branch charges what's left of the period.
    const branchCheckout = await call<{ amount: number }>(
      "POST",
      "/v1/billing/moyasar/branches/checkout",
      customer.token,
      { count: 1 }
    )
    expect(branchCheckout).toMatchObject({
      status: 201,
      body: { amount: allowance.body.proratedHalalasPerBranch },
    })

    // Staff can set the branches by hand.
    const set = await call<{ extraBranches: number }>(
      "PUT",
      `/v1/platform-admin/subscriptions/${granted.body.id}/branches`,
      staff.token,
      { extraBranches: 4 }
    )
    expect(set).toMatchObject({ status: 200, body: { extraBranches: 4 } })
    const after = await call<{ allowed: number }>("GET", "/v1/branches/allowance", customer.token)
    expect(after.body.allowed).toBe(6)

    // Workspaces are shared by every app: the most generous plan sets the limit (they don't add
    // up). Ads احترافي (3 included) on top of POS نمو (2 + 4) still allows 6.
    const adsPro = advertising.packages.find((pkg) => pkg.legacyPlanTier === "pro")!
    await call(
      "POST",
      `/v1/platform-admin/customers/${customer.actor.organizationId}/subscriptions`,
      staff.token,
      { application: "advertising", packageId: adsPro.id, interval: "monthly" }
    )
    expect(
      (await call<{ allowed: number }>("GET", "/v1/branches/allowance", customer.token)).body
        .allowed
    ).toBe(6)
    await call("PUT", `/v1/platform-admin/subscriptions/${granted.body.id}/branches`, staff.token, {
      extraBranches: 0,
    })
    const best = await call<{ allowed: number; subscription: { application: string } }>(
      "GET",
      "/v1/branches/allowance",
      customer.token
    )
    expect(best.body).toMatchObject({ allowed: 3, subscription: { application: "advertising" } })
  })

  it("gives the purchase-invoice reader only to packages that include it", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const pos = (await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)).body.find(
      (entry) => entry.application === "pos"
    )!
    const byTier = (tier: string) => pos.packages.find((pkg) => pkg.legacyPlanTier === tier)!
    const access = async () =>
      (
        await call<{ allowed: boolean }>(
          "GET",
          "/v1/purchases/invoice-reader/access",
          customer.token
        )
      ).body.allowed
    const scan = () =>
      call<{ code: string }>("POST", "/v1/purchases/invoice-scan", customer.token, {})

    // No package, or أساسي: not included.
    expect(await access()).toBe(false)
    expect(await scan()).toMatchObject({
      status: 403,
      body: { code: "INVOICE_READER_NOT_INCLUDED" },
    })
    const grant = (packageId: string) =>
      call(
        "POST",
        `/v1/platform-admin/customers/${customer.actor.organizationId}/subscriptions`,
        staff.token,
        {
          application: "pos",
          packageId,
          interval: "monthly",
        }
      )
    await grant(byTier("starter").id)
    expect(await access()).toBe(false)

    // نمو includes it.
    await grant(byTier("growth").id)
    expect(await access()).toBe(true)
    expect((await scan()).status).not.toBe(403)
  })

  it("locks every plan feature the customer's plans don't include", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const customer = await signIn("owner@shop.test", "Shop")
    const org = customer.actor.organizationId
    const catalog = (await call<PricingEntry[]>("GET", "/v1/pricing", customer.token)).body
    const pkg = (application: string, tier: string) =>
      catalog
        .find((entry) => entry.application === application)!
        .packages.find((entry) => entry.legacyPlanTier === tier)!
    const grant = (application: string, tier: string) =>
      call("POST", `/v1/platform-admin/customers/${org}/subscriptions`, staff.token, {
        application,
        packageId: pkg(application, tier).id,
        interval: "monthly",
      })
    const entitlements = async () =>
      (await call<Record<string, unknown>>("GET", "/v1/entitlements", customer.token)).body
    const createRole = () =>
      call<{ code: string }>("POST", `/v1/organizations/${org}/roles`, customer.token, {
        name: "Cashier lead",
        description: "",
        permissions: ["pos:view"],
      })
    const cashMovement = () =>
      call<{ code: string }>(
        "POST",
        `/v1/pos/shifts/${randomUUID()}/cash-movements`,
        customer.token,
        { type: "withdrawal", amount: 10, note: null }
      )
    const suppliers = () => call("GET", "/v1/suppliers", customer.token)

    // An Ads trial doesn't unlock POS features (only what Ads plans can include).
    await database.query(
      `insert into organization_subscriptions
         (id, organization_id, application, status, source, started_at, trial_ends_at)
       values ($1, $2, 'advertising', 'trial', 'trial', now(), $3)`,
      [randomUUID(), org, new Date(Date.now() + 7 * 86_400_000)]
    )
    expect(await entitlements()).toMatchObject({
      shiftCash: false,
      procurement: false,
      customRoles: true,
    })
    await database.query(
      `delete from organization_subscriptions where organization_id = $1 and application = 'advertising'`,
      [org]
    )

    // POS أساسي: cash movements and shift reports, but none of the نمو features.
    await grant("pos", "starter")
    expect(await entitlements()).toMatchObject({
      shiftCash: true,
      customRoles: false,
      procurement: false,
      customReports: false,
    })
    expect(await createRole()).toMatchObject({
      status: 403,
      body: { code: "PLAN_FEATURE_NOT_INCLUDED" },
    })
    expect((await cashMovement()).body.code).not.toBe("PLAN_FEATURE_NOT_INCLUDED")
    expect((await suppliers()).status).toBe(403)

    // POS نمو: roles, suppliers/purchases/expenses -- but not custom reports.
    await grant("pos", "growth")
    expect(await entitlements()).toMatchObject({
      shiftCash: true,
      customRoles: true,
      procurement: true,
      customReports: false,
    })
    expect((await createRole()).status).not.toBe(403)
    expect((await cashMovement()).body.code).not.toBe("PLAN_FEATURE_NOT_INCLUDED")
    expect((await suppliers()).status).toBe(200)
    expect((await call("GET", "/v1/reports/custom", customer.token)).status).toBe(403)

    // POS احترافي adds custom reports.
    await grant("pos", "pro")
    expect((await call("GET", "/v1/reports/custom", customer.token)).status).toBe(200)

    // Ads أساسي: two ad platforms. Meta and Snapchat are connected; a third is refused, while
    // reconnecting one already connected is fine.
    await grant("advertising", "starter")
    expect((await entitlements()).maxAdPlatforms).toBe(2)
    for (const table of ["meta_oauth_connections", "snapchat_oauth_connections"]) {
      await database.query(
        `insert into ${table} (id, organization_id, project_id, status, created_by_user_id,
           updated_by_user_id) values ($1, $2, $3, 'connected', $4, $4)`,
        [randomUUID(), org, randomUUID(), customer.actor.userId]
      )
    }
    const connectGoogle = await call<{ code: string }>(
      "POST",
      "/v1/integrations/google-ads/oauth/start",
      customer.token,
      {}
    )
    expect(connectGoogle).toMatchObject({
      status: 403,
      body: { code: "PLAN_FEATURE_NOT_INCLUDED" },
    })
    const reconnectMeta = await call<{ code: string }>(
      "POST",
      "/v1/integrations/meta-ads/oauth/start",
      customer.token,
      {}
    )
    expect(reconnectMeta.body.code).not.toBe("PLAN_FEATURE_NOT_INCLUDED")
    // Ads نمو: every platform.
    await grant("advertising", "growth")
    expect((await entitlements()).maxAdPlatforms).toBeNull()

    // E-commerce أساسي: one store.
    await grant("ecommerce", "starter")
    expect((await entitlements()).maxStores).toBe(1)
    await database.query(
      `insert into salla_oauth_connections (id, organization_id, project_id, status,
         created_by_user_id, updated_by_user_id) values ($1, $2, $3, 'connected', $4, $4)`,
      [randomUUID(), org, randomUUID(), customer.actor.userId]
    )
    const secondStore = await call<{ code: string }>(
      "POST",
      "/v1/integrations/zid/oauth/start",
      customer.token,
      {}
    )
    expect(secondStore).toMatchObject({ status: 403, body: { code: "PLAN_FEATURE_NOT_INCLUDED" } })
    await grant("ecommerce", "growth")
    expect((await entitlements()).maxStores).toBe(3)
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
    // A free period is claimed once, and the customer can't switch it off from their settings.
    const switchOff = await call("PATCH", `/v1/organizations/${organizationId}`, customer.token, {
      settings: { expensesEnabled: false },
    })
    expect(switchOff.status).toBe(403)
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
      discountHalalas: 2490,
      finalAmountHalalas: 22410,
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
