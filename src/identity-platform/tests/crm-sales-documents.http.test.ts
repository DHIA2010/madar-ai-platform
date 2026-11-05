// @vitest-environment node
//
// The CRM's quotes and invoices: VAT totals from the pricing settings, quote → invoice, paying it
// (bank transfer or card via the pay link) switching the quoted apps on, and the public pay page.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { activatePendingInvoices } from "../crm/sales-documents"
import { crmFromSignup } from "../crm/service"
import { createIdentityApiServer } from "../interfaces/rest/server"

const STAFF_EMAIL = "staff@madar.test"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await database.end()
})

// Registers over HTTP, then mirrors the user/org rows into pg-mem (identity repositories are
// in-memory in this harness; the platform-admin service reads Postgres directly).
async function signIn(email: string, orgName: string, settings: Record<string, unknown> = {}) {
  const password = "VeryStrongPassword123!"
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      fullName: `${orgName} Owner`,
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }
  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })
  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', $3, now()) on conflict (id) do nothing`,
    [actor.userId, email, `${orgName} Owner`]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', $4::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId, JSON.stringify(settings)]
  )
  return { token: login.session.accessToken, actor }
}

function headers(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function get<T>(token: string, path: string) {
  const response = await fetch(`${baseUrl}/v1/platform-admin${path}`, { headers: headers(token) })
  return { status: response.status, body: (await response.json()) as T }
}

async function post<T>(token: string, path: string, body: unknown = {}) {
  const response = await fetch(`${baseUrl}/v1/platform-admin${path}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

async function call<T>(method: string, token: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/v1/platform-admin${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

interface Catalog {
  application: string
  packages: { id: string; name: string; monthlyPrice: number | null; yearlyPrice: number | null }[]
}
interface Totals {
  subtotal: number
  discount: number
  vat: number
  total: number
}
interface Quote {
  id: string
  number: string
  status: string
  totals: Totals
  items: { kind: string; unitPriceHalalas: number; application?: string }[]
}
interface Invoice {
  id: string
  number: string
  status: string
  totals: Totals
  payUrlToken: string
  paidAt: string | null
  paymentMethod: string | null
  activatedAt: string | null
}

async function newLead(token: string, companyName: string, email: string) {
  const created = await call<{ lead: { id: string } }>("POST", token, "/crm/leads", {
    companyName,
    email,
  })
  return created.body.lead.id
}

async function posPackage(token: string) {
  const catalog = await call<Catalog[]>("GET", token, "/crm/catalog")
  const pos = catalog.body.find((entry) => entry.application === "pos")!
  return pos.packages.find((pkg) => pkg.monthlyPrice !== null)!
}

async function quoteAndInvoice(token: string, leadId: string) {
  const pkg = await posPackage(token)
  const quote = await call<{ quote: Quote }>("POST", token, `/crm/leads/${leadId}/quotes`, {
    items: [
      { kind: "package", packageId: pkg.id, interval: "monthly" },
      { kind: "custom", description: "تدريب الموظفين", quantity: 2, unitPrice: 150 },
    ],
    discount: 50,
  })
  const converted = await call<{ invoice: Invoice }>(
    "POST",
    token,
    `/crm/quotes/${quote.body.quote.id}/convert`,
    { dueDate: "2026-12-01" }
  )
  return { pkg, quote: quote.body.quote, invoice: converted.body.invoice }
}

async function subscription(organizationId: string, application: string) {
  const rows = await database.query<{ status: string; source: string }>(
    "select status, source from organization_subscriptions where organization_id = $1 and application = $2",
    [organizationId, application]
  )
  return rows.rows[0] ?? null
}

describe("CRM quotes and invoices", () => {
  it("prices packages from the pricing settings and adds 15% VAT after the discount", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const leadId = await newLead(staff.token, "مخبز الأصالة", "bakery@shop.test")
    const pkg = await posPackage(staff.token)

    const created = await call<{ quote: Quote }>(
      "POST",
      staff.token,
      `/crm/leads/${leadId}/quotes`,
      {
        items: [
          { kind: "package", packageId: pkg.id, interval: "monthly" },
          { kind: "custom", description: "تدريب الموظفين", quantity: 2, unitPrice: 150 },
        ],
        discount: 50,
      }
    )
    expect(created.status).toBe(201)
    const quote = created.body.quote
    expect(quote.number).toMatch(/^Q-\d{4}-0001$/)
    const subtotal = pkg.monthlyPrice! + 300
    expect(quote.totals).toEqual({
      subtotal,
      discount: 50,
      vat: Math.round((subtotal - 50) * 15) / 100,
      total: subtotal - 50 + Math.round((subtotal - 50) * 15) / 100,
    })
    expect(quote.items[0]).toMatchObject({ kind: "package", application: "pos" })

    // A line's price can't be set by the client for a package: unitPrice is ignored there.
    const second = await call<{ quote: Quote }>(
      "POST",
      staff.token,
      `/crm/leads/${leadId}/quotes`,
      {
        items: [{ kind: "package", packageId: pkg.id, interval: "monthly", unitPrice: 1 }],
      }
    )
    expect(second.body.quote.number).toMatch(/-0002$/)
    expect(second.body.quote.totals.subtotal).toBe(pkg.monthlyPrice)

    expect(
      (await call("POST", staff.token, `/crm/leads/${leadId}/quotes`, { items: [] })).status
    ).toBe(400)
  })

  it("converts a quote to an invoice; a confirmed bank transfer activates the apps and wins the lead", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@reem.test", "Reem Shop")
    const leadId = await newLead(staff.token, "Reem Shop", "owner@reem.test")
    await crmFromSignup(database, {
      organizationId: shop.actor.organizationId,
      companyName: "Reem Shop",
      contactName: "Owner",
      email: "owner@reem.test",
    })

    const { quote, invoice } = await quoteAndInvoice(staff.token, leadId)
    expect(invoice).toMatchObject({ status: "unpaid", number: expect.stringMatching(/^INV-/) })
    expect(invoice.totals).toEqual(quote.totals)
    // A converted quote is closed.
    expect((await call("POST", staff.token, `/crm/quotes/${quote.id}/convert`, {})).status).toBe(
      400
    )

    const paid = await call<{ invoice: Invoice }>(
      "POST",
      staff.token,
      `/crm/invoices/${invoice.id}/mark-paid`,
      { reference: "TRX-889" }
    )
    expect(paid.body.invoice).toMatchObject({
      status: "paid",
      paymentMethod: "bank_transfer",
      activatedAt: expect.any(String),
    })
    expect(await subscription(shop.actor.organizationId, "pos")).toMatchObject({
      status: "active",
      source: "bank_transfer",
    })
    const lead = await call<{ lead: { stage: string; wonValue: number } }>(
      "GET",
      staff.token,
      `/crm/leads/${leadId}`
    )
    expect(lead.body.lead).toMatchObject({ stage: "won", wonValue: invoice.totals.total })

    // A paid invoice can't be voided, and its lead can't be deleted.
    expect((await call("POST", staff.token, `/crm/invoices/${invoice.id}/void`)).status).toBe(400)
    expect((await call("DELETE", staff.token, `/crm/leads/${leadId}`)).status).toBe(400)
  })

  it("writes an invoice directly, without a quote", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const leadId = await newLead(staff.token, "Direct Shop", "direct@shop.test")
    const pkg = await posPackage(staff.token)

    const created = await call<{ invoice: Invoice & { quoteId: string | null } }>(
      "POST",
      staff.token,
      `/crm/leads/${leadId}/invoices`,
      {
        items: [
          { kind: "package", packageId: pkg.id, interval: "monthly" },
          { kind: "custom", description: "جهاز طباعة إيصالات", quantity: 1, unitPrice: 400 },
        ],
        dueDate: "2026-12-15",
      }
    )
    expect(created.status).toBe(201)
    const subtotal = pkg.monthlyPrice! + 400
    expect(created.body.invoice).toMatchObject({
      status: "unpaid",
      quoteId: null,
      number: expect.stringMatching(/^INV-/),
      totals: { subtotal, discount: 0, vat: Math.round(subtotal * 15) / 100 },
    })
    expect(
      (await call("POST", staff.token, `/crm/leads/${leadId}/invoices`, { items: [] })).status
    ).toBe(400)
  })

  it("holds activation until a lead with no Madar account signs up", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const leadId = await newLead(staff.token, "Future Shop", "future@shop.test")
    const { invoice } = await quoteAndInvoice(staff.token, leadId)
    // Paid in cash a few days ago, recorded by hand.
    const paid = await call<{ invoice: Invoice }>(
      "POST",
      staff.token,
      `/crm/invoices/${invoice.id}/mark-paid`,
      { method: "cash", paidAt: "2026-11-01", reference: "إيصال 112" }
    )
    expect(paid.body.invoice).toMatchObject({
      status: "paid",
      paymentMethod: "cash",
      paidAt: "2026-11-01T00:00:00.000Z",
      activatedAt: null,
    })

    const shop = await signIn("future@shop.test", "Future Shop")
    const linked = await crmFromSignup(database, {
      organizationId: shop.actor.organizationId,
      companyName: "Future Shop",
      contactName: "Owner",
      email: "future@shop.test",
    })
    expect(linked).toBe(leadId)
    await activatePendingInvoices(database, leadId)
    expect(await subscription(shop.actor.organizationId, "pos")).toMatchObject({ status: "active" })
  })

  it("issues a tax invoice for every payment made in the app, beside its receipt", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("card@shop.test", "Card Shop")
    // A card payment's receipt (as ReceiptService issues them).
    await database.query(
      `insert into platform_receipts (id, sequence, number, organization_id, source_type, source_id,
         application, package_name, billing_interval, amount_halalas, original_amount_halalas,
         discount_halalas, payment_method, payment_reference, customer_snapshot, paid_at)
       values ('11111111-1111-4111-8111-111111111111', 1, 'MDR-000001', $1, 'card',
         '22222222-2222-4222-8222-222222222222', 'pos', 'Growth', 'monthly', 17910, 19900, 1990,
         'mada', 'pay_123', '{"name":"Card Shop","email":"card@shop.test"}'::jsonb,
         '2026-11-01T10:00:00Z')`,
      [shop.actor.organizationId]
    )
    type AutoInvoice = Invoice & {
      source: string
      receiptNumber: string | null
      activatedAt: string | null
      subscriptionStart: string
      subscriptionEnd: string
    }
    const list = await call<AutoInvoice[]>("GET", staff.token, "/crm/invoices")
    const auto = list.body.filter((invoice) => invoice.source === "auto")
    expect(auto).toHaveLength(1)
    // 179.10 paid, VAT-inclusive: 155.74 + 23.36 VAT, after a discount off the listed 173.04.
    expect(auto[0]).toMatchObject({
      status: "paid",
      paymentMethod: "card",
      receiptNumber: "MDR-000001",
      subscriptionStart: "2026-11-01",
      subscriptionEnd: "2026-12-01",
      totals: { subtotal: 173.04, discount: 17.3, vat: 23.36, total: 179.1 },
    })
    expect(auto[0].activatedAt).not.toBeNull()
    // Issued once, however often the list is read.
    const again = await call<AutoInvoice[]>("GET", staff.token, "/crm/invoices")
    expect(again.body.filter((invoice) => invoice.source === "auto")).toHaveLength(1)
    // Its customer is a won lead in the CRM, and nothing waits on activation.
    const leads = await call<{ items: { companyName: string; stage: string }[] }>(
      "GET",
      staff.token,
      "/crm/leads"
    )
    expect(leads.body.items).toEqual([
      expect.objectContaining({ companyName: "Card Shop", stage: "won" }),
    ])
    expect((await call<unknown[]>("GET", staff.token, "/crm/activations")).body).toHaveLength(0)
  })

  it("lets the customer apply a coupon on the pay page, counted once the invoice is paid", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("coupon@shop.test", "Coupon Shop")
    const leadId = await newLead(staff.token, "Coupon Shop", "coupon@shop.test")
    await crmFromSignup(database, {
      organizationId: shop.actor.organizationId,
      companyName: "Coupon Shop",
      contactName: "Owner",
      email: "coupon@shop.test",
    })
    const { invoice } = await quoteAndInvoice(staff.token, leadId)
    expect(
      (
        await call("POST", staff.token, "/coupons", {
          code: "WELCOME20",
          discountType: "percentage",
          discountValue: 20,
          applications: ["pos"],
          billingIntervals: ["monthly"],
        })
      ).status
    ).toBe(201)
    await call("POST", staff.token, "/coupons", {
      code: "YEARLY",
      discountType: "percentage",
      discountValue: 50,
      billingIntervals: ["yearly"],
    })
    const coupon = (code: string, method = "POST") =>
      fetch(`${baseUrl}/v1/public/invoices/${invoice.payUrlToken}/coupon`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify({ code }) : undefined,
      })
    type Page = { totals: Totals; coupon: { code: string; discount: number } | null }

    expect((await coupon("NOPE")).status).toBe(422)
    // Only for yearly subscriptions: not this monthly invoice.
    const wrong = await coupon("YEARLY")
    expect(wrong.status).toBe(422)
    expect(((await wrong.json()) as { code: string }).code).toBe("COUPON_NOT_APPLICABLE")

    // 20% off the POS package line, before VAT; the training line keeps its price.
    const applied = await coupon("welcome20")
    expect(applied.status).toBe(200)
    const page = (await applied.json()) as Page
    expect(page.coupon?.code).toBe("WELCOME20")
    expect(page.totals.discount).toBeCloseTo(50 + page.coupon!.discount, 2)
    expect(page.totals.total).toBeLessThan(invoice.totals.total)
    // Card checkout charges the new total.
    const checkout = await fetch(`${baseUrl}/v1/public/invoices/${invoice.payUrlToken}/checkout`, {
      method: "POST",
    })
    if (checkout.status === 200) {
      const body = (await checkout.json()) as { amount: number }
      expect(body.amount).toBe(Math.round(page.totals.total * 100))
    }

    // Removing it restores the invoice.
    const removed = (await (await coupon("", "DELETE")).json()) as Page
    expect(removed.coupon).toBeNull()
    expect(removed.totals.total).toBe(invoice.totals.total)

    // Paid with the coupon on: one use counted.
    await coupon("WELCOME20")
    await call("POST", staff.token, `/crm/invoices/${invoice.id}/mark-paid`, { method: "cash" })
    const coupons = await call<{ code: string; usedCount: number }[]>(
      "GET",
      staff.token,
      "/coupons"
    )
    expect(coupons.body.find((entry) => entry.code === "WELCOME20")?.usedCount).toBe(1)
    // Nothing to change once paid.
    expect((await coupon("WELCOME20")).status).toBe(400)
  })

  it("prints the default terms on every document, or a document's own", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    await call("PATCH", staff.token, "/settings", {
      quoteTerms: "العرض صالح 14 يومًا.",
      invoiceTerms: "الدفع خلال 7 أيام.",
    })
    const leadId = await newLead(staff.token, "متجر الشروط", "terms@shop.test")
    const { quote, invoice } = await quoteAndInvoice(staff.token, leadId)
    type Doc = { terms: string | null }
    type Seller = { quoteTerms: string; invoiceTerms: string }
    const quoteDetail = await call<{ quote: Doc; seller: Seller }>(
      "GET",
      staff.token,
      `/crm/quotes/${quote.id}`
    )
    expect(quoteDetail.body.quote.terms).toBeNull()
    expect(quoteDetail.body.seller.quoteTerms).toBe("العرض صالح 14 يومًا.")

    const own = await call<{ invoice: Doc }>(
      "PUT",
      staff.token,
      `/crm/invoices/${invoice.id}/terms`,
      {
        terms: "  دفعة واحدة مقدمًا.  ",
      }
    )
    expect(own.body.invoice.terms).toBe("دفعة واحدة مقدمًا.")
    const page = await fetch(`${baseUrl}/v1/public/invoices/${invoice.payUrlToken}`)
    expect(((await page.json()) as Doc).terms).toBe("دفعة واحدة مقدمًا.")

    // Back to the default.
    await call("PUT", staff.token, `/crm/invoices/${invoice.id}/terms`, { terms: null })
    const reset = await fetch(`${baseUrl}/v1/public/invoices/${invoice.payUrlToken}`)
    expect(((await reset.json()) as Doc).terms).toBe("الدفع خلال 7 أيام.")
  })

  it("covers a subscription period: worked out from its packages, or set by hand", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const leadId = await newLead(staff.token, "متجر الفترة", "period@shop.test")
    const { invoice } = await quoteAndInvoice(staff.token, leadId)
    type Period = {
      subscriptionStart: string
      subscriptionEnd: string
      subscriptionDatesManual: boolean
    }
    const auto = invoice as unknown as Period
    // A monthly package: from the issue date, one month.
    const today = new Date().toISOString().slice(0, 10)
    const nextMonth = new Date(`${today}T12:00:00Z`)
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
    expect(auto).toMatchObject({
      subscriptionStart: today,
      subscriptionEnd: nextMonth.toISOString().slice(0, 10),
      subscriptionDatesManual: false,
    })

    expect(
      (
        await call("PUT", staff.token, `/crm/invoices/${invoice.id}/period`, {
          start: "2026-12-01",
          end: "2026-11-01",
        })
      ).status
    ).toBe(400)
    const manual = await call<{ invoice: Period }>(
      "PUT",
      staff.token,
      `/crm/invoices/${invoice.id}/period`,
      {
        start: "2026-12-01",
        end: "2027-03-31",
      }
    )
    expect(manual.body.invoice).toMatchObject({
      subscriptionStart: "2026-12-01",
      subscriptionEnd: "2027-03-31",
      subscriptionDatesManual: true,
    })

    // Paid and switched on: the subscription runs exactly those dates.
    const shop = await signIn("period@shop.test", "Period Shop")
    await crmFromSignup(database, {
      organizationId: shop.actor.organizationId,
      companyName: "Period Shop",
      contactName: "Owner",
      email: "period@shop.test",
    })
    await call("POST", staff.token, `/crm/invoices/${invoice.id}/mark-paid`, { method: "cash" })
    const rows = await database.query<{
      current_period_end: string | Date
      started_at: string | Date
    }>(
      "select current_period_end, started_at from organization_subscriptions where organization_id = $1 and application = 'pos'",
      [shop.actor.organizationId]
    )
    expect(new Date(rows.rows[0].current_period_end).toISOString()).toBe("2027-03-31T20:59:59.000Z")
    expect(new Date(rows.rows[0].started_at).toISOString()).toBe("2026-12-01T00:00:00.000Z")
    // Moving the dates afterwards moves the subscription too.
    await call("PUT", staff.token, `/crm/invoices/${invoice.id}/period`, {
      start: "2026-12-01",
      end: "2027-06-30",
    })
    const moved = await database.query<{ current_period_end: string | Date }>(
      "select current_period_end from organization_subscriptions where organization_id = $1 and application = 'pos'",
      [shop.actor.organizationId]
    )
    expect(new Date(moved.rows[0].current_period_end).toISOString()).toBe(
      "2027-06-30T20:59:59.000Z"
    )
  })

  it("lists paid invoices awaiting activation and creates the customer's account on activate", async () => {
    // Accounts the activator creates live in the in-memory repositories; mirror them into pg-mem
    // so the CRM's Postgres tables can reference them.
    const deps = container.zidAutoProvisionDeps!
    const saveUser = deps.users.save.bind(deps.users)
    deps.users.save = async (user) => {
      await saveUser(user)
      await database.query(
        `insert into users (id, email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'hash', $3, now()) on conflict (id) do nothing`,
        [user.id, user.email, user.fullName]
      )
    }
    const saveOrganization = deps.organizations.save.bind(deps.organizations)
    deps.organizations.save = async (organization) => {
      await saveOrganization(organization)
      await database.query(
        `insert into organizations (id, name, owner_user_id, status, settings)
         values ($1, $2, $3, 'active', '{}'::jsonb) on conflict (id) do nothing`,
        [organization.id, organization.name, organization.ownerUserId]
      )
    }

    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const leadId = await newLead(staff.token, "مطعم الواحة", "")
    const { invoice } = await quoteAndInvoice(staff.token, leadId)
    expect((await call<Invoice[]>("GET", staff.token, "/crm/activations")).body).toHaveLength(0)
    await call("POST", staff.token, `/crm/invoices/${invoice.id}/mark-paid`, { method: "cash" })
    const queue = await call<Invoice[]>("GET", staff.token, "/crm/activations")
    expect(queue.body.map((entry) => entry.number)).toEqual([invoice.number])
    const pending = await call<Invoice[]>("GET", staff.token, "/crm/invoices?activation=pending")
    expect(pending.body.map((entry) => entry.number)).toEqual([invoice.number])

    // No email on the lead: it's needed to sign in.
    expect(
      (await call("POST", staff.token, `/crm/invoices/${invoice.id}/activate-account`)).status
    ).toBe(400)
    const activated = await call<{
      invoice: Invoice & { organizationId: string }
      newAccount: boolean
    }>("POST", staff.token, `/crm/invoices/${invoice.id}/activate-account`, {
      email: "Oasis@Restaurant.test",
      contactName: "سارة",
    })
    expect(activated.status).toBe(200)
    expect(activated.body.newAccount).toBe(true)
    expect(activated.body.invoice.activatedAt).not.toBeNull()
    const organizationId = activated.body.invoice.organizationId
    expect(organizationId).toBeTruthy()
    expect(await subscription(organizationId, "pos")).toMatchObject({ status: "active" })
    expect((await call<Invoice[]>("GET", staff.token, "/crm/activations")).body).toHaveLength(0)
    const activatedList = await call<Invoice[]>(
      "GET",
      staff.token,
      "/crm/invoices?activation=activated"
    )
    expect(activatedList.body.map((entry) => entry.number)).toEqual([invoice.number])

    const user = await deps.users.findByEmail("oasis@restaurant.test")
    expect(user).toMatchObject({ fullName: "سارة", primaryOrganizationId: organizationId })
    const gateway = container.emailGateway as unknown as { sent: Record<string, string>[] }
    const welcome = gateway.sent.find((email) => email.kind === "account_activated")
    expect(welcome).toMatchObject({
      email: "oasis@restaurant.test",
      companyName: "مطعم الواحة",
      newAccount: "true",
    })
    expect(welcome?.actionUrl).toMatch(/\/auth\/basic\/reset-password\?token=.+/)
    // Activating twice isn't possible.
    expect(
      (await call("POST", staff.token, `/crm/invoices/${invoice.id}/activate-account`)).status
    ).toBe(400)
  })

  it("lets the customer open and pay the invoice from its link, checked with Moyasar", async () => {
    process.env.MOYASAR_PUBLISHABLE_KEY = "pk_test_fixture"
    process.env.MOYASAR_SECRET_KEY = "sk_test_fixture"
    const realFetch = globalThis.fetch
    const moyasar = vi.fn()
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) =>
      String(input).startsWith("https://api.moyasar.com")
        ? moyasar(String(input))
        : realFetch(input, init)
    )
    try {
      const staff = await signIn(STAFF_EMAIL, "Madar HQ")
      const leadId = await newLead(staff.token, "Card Shop", "card@shop.test")
      const { invoice } = await quoteAndInvoice(staff.token, leadId)
      const base = `${baseUrl}/v1/public/invoices/${invoice.payUrlToken}`

      const view = await realFetch(base)
      expect(view.status).toBe(200)
      const publicInvoice = (await view.json()) as Record<string, unknown>
      expect(publicInvoice).toMatchObject({ number: invoice.number, status: "unpaid" })
      expect(publicInvoice).not.toHaveProperty("id")
      expect(publicInvoice).not.toHaveProperty("notes")
      expect(
        (await realFetch(`${baseUrl}/v1/public/invoices/not-a-real-token-123456`)).status
      ).toBe(404)

      const checkout = (await (await realFetch(`${base}/checkout`, { method: "POST" })).json()) as {
        amount: number
        invoiceId: string
      }
      expect(checkout.amount).toBe(Math.round(invoice.totals.total * 100))

      const confirm = (paymentBody: Record<string, unknown>) => {
        moyasar.mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "pay_1", currency: "SAR", ...paymentBody }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
        return realFetch(`${base}/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ moyasarPaymentId: "pay_1" }),
        }).then((response) => response.json() as Promise<{ status: string }>)
      }
      // The wrong amount, or a payment for another invoice, doesn't pay it.
      expect(
        await confirm({
          status: "paid",
          amount: 100,
          metadata: { crm_invoice_id: checkout.invoiceId },
        })
      ).toMatchObject({ status: "unpaid" })
      expect(
        await confirm({
          status: "paid",
          amount: checkout.amount,
          metadata: { crm_invoice_id: "x" },
        })
      ).toMatchObject({ status: "unpaid" })
      expect(
        await confirm({
          status: "paid",
          amount: checkout.amount,
          metadata: { crm_invoice_id: checkout.invoiceId },
        })
      ).toMatchObject({ status: "paid" })

      const after = await call<{ invoice: Invoice }>(
        "GET",
        staff.token,
        `/crm/invoices/${invoice.id}`
      )
      expect(after.body.invoice).toMatchObject({ status: "paid", paymentMethod: "card" })
    } finally {
      vi.unstubAllGlobals()
      delete process.env.MOYASAR_PUBLISHABLE_KEY
      delete process.env.MOYASAR_SECRET_KEY
    }
  })
})
