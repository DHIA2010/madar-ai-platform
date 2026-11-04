// @vitest-environment node
//
// Madar Admin's CRM (/v1/platform-admin/crm/*): leads from the website form and sign-ups, their
// stages, timeline and follow-ups, the sales dashboard, and who may use it.

import { createHmac } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { crmFromSignup, crmPaymentReceived } from "../crm/service"
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

async function submitWebsiteLead(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/public/sales-leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return (await response.json()) as { id: string }
}

const CAL_SECRET = "cal-webhook-secret"

// Cal.com's booking webhook, signed the way Cal.com signs it.
async function calcomBooking(
  payload: Record<string, unknown>,
  secret = CAL_SECRET,
  triggerEvent = "BOOKING_CREATED"
) {
  const body = JSON.stringify({ triggerEvent, payload })
  return fetch(`${baseUrl}/v1/public/webhooks/calcom`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cal-signature-256": createHmac("sha256", secret).update(body).digest("hex"),
    },
    body,
  })
}

interface Lead {
  id: string
  companyName: string
  source: string
  stage: string
  organizationId: string | null
  meetingAt: string | null
  wonValue: number | null
  owner: { id: string } | null
  nextTask: { title: string } | null
  openTaskCount: number
}
interface LeadDetail {
  lead: Lead
  activities: { kind: string; body: string | null; meta: Record<string, unknown> }[]
  tasks: { id: string; title: string; doneAt: string | null }[]
}

describe("CRM", () => {
  it("turns a website request into a lead, and a booked demo moves it to 'meeting'", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const { id: salesLeadId } = await submitWebsiteLead({
      companyName: "مؤسسة الريم",
      phone: "0551234567",
      email: "reem@shop.test",
    })

    const leads = await call<{ items: Lead[]; total: number }>("GET", staff.token, "/crm/leads")
    expect(leads.body.total).toBe(1)
    expect(leads.body.items[0]).toMatchObject({
      companyName: "مؤسسة الريم",
      source: "website",
      stage: "new",
    })

    await fetch(`${baseUrl}/v1/public/sales-leads/${salesLeadId}/meeting`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startTime: "2026-11-10T09:00:00.000Z", uid: "cal-1" }),
    })
    const detail = await call<LeadDetail>(
      "GET",
      staff.token,
      `/crm/leads/${leads.body.items[0].id}`
    )
    expect(detail.body.lead).toMatchObject({
      stage: "meeting",
      meetingAt: "2026-11-10T09:00:00.000Z",
    })
    expect(detail.body.activities.map((activity) => activity.kind)).toEqual([
      "stage",
      "meeting",
      "created",
    ])

    const pipeline = await call<{ leads: Lead[] }>("GET", staff.token, "/crm/pipeline")
    expect(pipeline.body.leads.filter((lead) => lead.stage === "meeting")).toHaveLength(1)
  })

  it("takes meetings booked straight from the Cal.com link, with where they were booked", async () => {
    process.env.IDENTITY_PLATFORM_CALCOM_WEBHOOK_SECRET = CAL_SECRET
    try {
      const staff = await signIn(STAFF_EMAIL, "Madar HQ")
      // Someone new: a lead of its own, source "booking", in "اجتماع محجوز".
      const fresh = await calcomBooking({
        startTime: "2026-11-12T10:00:00Z",
        uid: "cal-new",
        attendees: [{ email: "New@Shop.test", name: "متجر جديد" }],
        responses: { attendeePhoneNumber: { value: "+966501112222" } },
      })
      expect(fresh.status).toBe(200)
      const leads = await call<{ items: (Lead & { meetingSource: string })[] }>(
        "GET",
        staff.token,
        "/crm/leads"
      )
      expect(leads.body.items[0]).toMatchObject({
        companyName: "متجر جديد",
        source: "booking",
        stage: "meeting",
        meetingAt: "2026-11-12T10:00:00.000Z",
        meetingSource: "booking_link",
      })

      // An existing lead in a later stage (here "lost") is moved back to the meeting stage.
      const manual = await call<{ lead: Lead }>("POST", staff.token, "/crm/leads", {
        companyName: "عميل قديم",
        phone: "0559998888",
      })
      await call("POST", staff.token, `/crm/leads/${manual.body.lead.id}/stage`, { stage: "lost" })
      await calcomBooking({
        startTime: "2026-11-13T08:30:00Z",
        attendees: [{ email: "other@shop.test", name: "عميل قديم" }],
        responses: { attendeePhoneNumber: { value: "+966559998888" } },
      })
      const revived = await call<LeadDetail>(
        "GET",
        staff.token,
        `/crm/leads/${manual.body.lead.id}`
      )
      expect(revived.body.lead.stage).toBe("meeting")

      // Booked from the website form's step: the same lead, recorded once.
      const { id: salesLeadId } = await submitWebsiteLead({
        companyName: "مؤسسة النموذج",
        phone: "0551231234",
      })
      await fetch(`${baseUrl}/v1/public/sales-leads/${salesLeadId}/meeting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startTime: "2026-11-14T09:00:00.000Z", uid: "cal-form" }),
      })
      await calcomBooking({
        startTime: "2026-11-14T09:00:00Z",
        uid: "cal-form",
        attendees: [{ email: "someone@else.test", name: "مؤسسة النموذج" }],
        metadata: { leadId: salesLeadId },
      })
      const all = await call<{ items: (Lead & { meetingSource: string })[] }>(
        "GET",
        staff.token,
        "/crm/leads"
      )
      const formLead = all.body.items.find((lead) => lead.companyName === "مؤسسة النموذج")!
      expect(all.body.items).toHaveLength(3)
      expect(formLead).toMatchObject({ stage: "meeting", meetingSource: "website_form" })
      const formDetail = await call<LeadDetail>("GET", staff.token, `/crm/leads/${formLead.id}`)
      expect(formDetail.body.activities.filter((entry) => entry.kind === "meeting")).toHaveLength(1)

      // Cancelled: off the lead (found by the booking id), back to "تم التواصل".
      await calcomBooking(
        {
          startTime: "2026-11-12T10:00:00Z",
          uid: "cal-new",
          attendees: [{ email: "new@shop.test" }],
          cancellationReason: "تغيّر الموعد",
        },
        CAL_SECRET,
        "BOOKING_CANCELLED"
      )
      const cancelled = await call<LeadDetail>(
        "GET",
        staff.token,
        `/crm/leads/${leads.body.items[0].id}`
      )
      expect(cancelled.body.lead).toMatchObject({ stage: "contacted", meetingAt: null })
      expect(cancelled.body.activities[1].meta).toMatchObject({
        action: "cancelled",
        reason: "تغيّر الموعد",
      })
      // Requested (needs confirmation): on the lead, marked pending.
      await calcomBooking(
        {
          startTime: "2026-11-20T10:00:00Z",
          uid: "cal-req",
          attendees: [{ email: "new@shop.test" }],
        },
        CAL_SECRET,
        "BOOKING_REQUESTED"
      )
      const requested = await call<LeadDetail>(
        "GET",
        staff.token,
        `/crm/leads/${leads.body.items[0].id}`
      )
      expect(requested.body.lead.stage).toBe("meeting")
      expect(
        requested.body.activities.find((entry) => entry.kind === "meeting")?.meta
      ).toMatchObject({
        pending: true,
      })

      // Unsigned (or wrongly signed) calls are refused.
      expect((await calcomBooking({ startTime: "2026-11-15T09:00:00Z" }, "wrong")).status).toBe(401)
    } finally {
      delete process.env.IDENTITY_PLATFORM_CALCOM_WEBHOOK_SECRET
    }
  })

  it("keeps the campaign that brought a lead, and reports leads by campaign", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const touch = (source: string | null, campaign: string | null, at: string) => ({
      source,
      medium: source ? "paid_social" : null,
      campaign,
      content: campaign ? "فيديو الكاشير" : null,
      term: null,
      clickId: source === "snapchat" ? "abc123" : null,
      clickIdType: source === "snapchat" ? "snapchat" : null,
      referrer: null,
      landingPage: "/",
      at,
    })
    const now = new Date().toISOString()
    await submitWebsiteLead({
      companyName: "متجر سناب",
      phone: "0551110001",
      attribution: {
        first: touch("snapchat", "عروض رمضان", now),
        last: touch(null, null, now),
      },
    })
    // A malformed attribution is dropped, not a failed form.
    const odd = await fetch(`${baseUrl}/v1/public/sales-leads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: "متجر عادي", phone: "0551110002", attribution: "x" }),
    })
    expect(odd.status).toBe(201)

    const shop = await signIn("signup@shop.test", "Signup Shop")
    await crmFromSignup(database, {
      organizationId: shop.actor.organizationId,
      companyName: "Signup Shop",
      contactName: "Owner",
      email: "signup@shop.test",
      attribution: {
        first: touch("snapchat", "عروض رمضان", now),
        last: touch("snapchat", "عروض رمضان", now),
      },
    })

    type AttributedLead = Lead & {
      attribution: { first: { source: string; campaign: string } } | null
    }
    const leads = await call<{ items: AttributedLead[] }>("GET", staff.token, "/crm/leads")
    const snap = leads.body.items.find((lead) => lead.companyName === "متجر سناب")!
    expect(snap.attribution?.first).toMatchObject({ source: "snapchat", campaign: "عروض رمضان" })
    expect(
      leads.body.items.find((lead) => lead.companyName === "متجر عادي")?.attribution
    ).toBeNull()

    const conditions = encodeURIComponent(
      JSON.stringify([{ field: "utmPlatform", op: "is", value: "snapchat" }])
    )
    const fromSnap = await call<{ items: Lead[] }>(
      "GET",
      staff.token,
      `/crm/leads?conditions=${conditions}`
    )
    expect(fromSnap.body.items.map((lead) => lead.companyName).sort()).toEqual(
      ["Signup Shop", "متجر سناب"].sort()
    )

    const dashboard = await call<{
      byCampaign: { platform: string; campaign: string | null; leads: number }[]
    }>("GET", staff.token, "/crm/dashboard?rangeDays=30")
    expect(dashboard.body.byCampaign).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "snapchat", campaign: "عروض رمضان", leads: 2 }),
        expect.objectContaining({ platform: "direct", campaign: null, leads: 1 }),
      ])
    )
  })

  it("saves what a website lead is interested in", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const { id: salesLeadId } = await submitWebsiteLead({
      companyName: "متجر الاهتمام",
      phone: "0551114444",
    })
    const post = (body: unknown) =>
      fetch(`${baseUrl}/v1/public/sales-leads/${salesLeadId}/interests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    expect((await post({ interests: [] })).status).toBe(400)
    expect(
      (await post({ interests: ["pos", "ecommerce"], other: "ربط مع نظام محاسبة" })).status
    ).toBe(204)
    const leads = await call<{ items: (Lead & { interests: string[]; tags: string[] })[] }>(
      "GET",
      staff.token,
      "/crm/leads"
    )
    expect(leads.body.items[0]).toMatchObject({
      interests: ["pos", "ecommerce"],
      tags: ["ربط مع نظام محاسبة"],
    })
  })

  it("verifies Cal.com bookings with the secret saved in Madar Admin's settings", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const booking = { startTime: "2026-11-12T10:00:00Z", attendees: [{ email: "s@shop.test" }] }
    // No secret anywhere: off.
    expect((await calcomBooking(booking, "anything")).status).toBe(503)
    expect(
      (await call("PATCH", staff.token, "/settings", { calcomWebhookSecret: "from-settings" }))
        .status
    ).toBe(200)
    expect((await calcomBooking(booking, "wrong")).status).toBe(401)
    expect((await calcomBooking(booking, "from-settings")).status).toBe(200)
  })

  it("records the phone call a website lead asks for, as a follow-up at that time", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const { id: salesLeadId } = await submitWebsiteLead({
      companyName: "مؤسسة الاتصال",
      phone: "0551112233",
    })
    const callAt = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const call1 = await fetch(`${baseUrl}/v1/public/sales-leads/${salesLeadId}/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callAt }),
    })
    expect(call1.status).toBe(204)
    // A time in the past is refused.
    const past = await fetch(`${baseUrl}/v1/public/sales-leads/${salesLeadId}/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callAt: "2020-01-01T09:00:00Z" }),
    })
    expect(past.status).toBe(400)

    const leads = await call<{ items: (Lead & { callAt: string })[] }>(
      "GET",
      staff.token,
      "/crm/leads"
    )
    expect(leads.body.items[0].callAt).toBe(callAt)
    const detail = await call<LeadDetail & { tasks: { title: string; dueAt: string }[] }>(
      "GET",
      staff.token,
      `/crm/leads/${leads.body.items[0].id}`
    )
    expect(detail.body.activities.map((activity) => activity.kind)).toContain("call_request")
    expect(detail.body.tasks).toMatchObject([
      { title: "مكالمة هاتفية طلبها العميل", dueAt: callAt },
    ])
  })

  it("links a sign-up to the lead it came from, and its first payment wins it", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    await submitWebsiteLead({
      companyName: "متجر النخبة",
      phone: "0500000001",
      email: "nokhba@shop.test",
    })
    const shop = await signIn("nokhba@shop.test", "متجر النخبة")
    await crmFromSignup(database, {
      organizationId: shop.actor.organizationId,
      companyName: "متجر النخبة",
      contactName: "Owner",
      email: "NOKHBA@shop.test",
    })
    // An unrelated sign-up is a new trial lead of its own.
    const other = await signIn("fresh@shop.test", "Fresh Shop")
    await crmFromSignup(database, {
      organizationId: other.actor.organizationId,
      companyName: "Fresh Shop",
      contactName: "Fresh Owner",
      email: "fresh@shop.test",
    })

    let leads = await call<{ items: Lead[] }>("GET", staff.token, "/crm/leads")
    const nokhba = leads.body.items.find((lead) => lead.companyName === "متجر النخبة")!
    expect(nokhba).toMatchObject({ stage: "trial", organizationId: shop.actor.organizationId })
    expect(leads.body.items.find((lead) => lead.companyName === "Fresh Shop")).toMatchObject({
      source: "signup",
      stage: "trial",
    })

    await crmPaymentReceived(database, {
      organizationId: shop.actor.organizationId,
      amountHalalas: 29900,
      application: "pos",
    })
    leads = await call<{ items: Lead[] }>("GET", staff.token, "/crm/leads?stage=won")
    expect(leads.body.items).toMatchObject([{ companyName: "متجر النخبة", wonValue: 299 }])

    const dashboard = await call<{
      won: number
      wonValue: number
      newLeads: number
      winRate: number
    }>("GET", staff.token, "/crm/dashboard?rangeDays=30")
    expect(dashboard.body).toMatchObject({ won: 1, wonValue: 299, newLeads: 2, winRate: 100 })
  })

  it("adds leads by hand, logs calls, moves stages and tracks follow-ups", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const created = await call<LeadDetail>("POST", staff.token, "/crm/leads", {
      companyName: "Coffee Corner",
      contactName: "Sara",
      phone: "0559998877",
      expectedValue: 1099,
    })
    expect(created.status).toBe(201)
    const leadId = created.body.lead.id
    expect(created.body.lead).toMatchObject({
      source: "manual",
      stage: "new",
      owner: { id: staff.actor.userId },
    })

    // Calling a new lead marks it contacted.
    const called = await call<LeadDetail>("POST", staff.token, `/crm/leads/${leadId}/activities`, {
      kind: "call",
      body: "Interested in POS for 2 branches",
    })
    expect(called.body.lead.stage).toBe("contacted")

    const withTask = await call<LeadDetail>("POST", staff.token, `/crm/leads/${leadId}/tasks`, {
      title: "Send the price offer",
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
    })
    expect(withTask.body.lead).toMatchObject({
      openTaskCount: 1,
      nextTask: { title: "Send the price offer" },
    })
    const overdue = await call<{ title: string; leadCompanyName: string }[]>(
      "GET",
      staff.token,
      "/crm/tasks?scope=mine&status=overdue"
    )
    expect(overdue.body).toMatchObject([
      { title: "Send the price offer", leadCompanyName: "Coffee Corner" },
    ])

    const taskId = withTask.body.tasks[0].id
    const done = await call<LeadDetail>("PATCH", staff.token, `/crm/tasks/${taskId}`, {
      done: true,
    })
    expect(done.body.lead.openTaskCount).toBe(0)
    expect(done.body.activities[0]).toMatchObject({ kind: "task", body: "Send the price offer" })

    const lost = await call<LeadDetail>("POST", staff.token, `/crm/leads/${leadId}/stage`, {
      stage: "lost",
      lostReason: "Chose another system",
    })
    expect(lost.body.lead).toMatchObject({ stage: "lost" })
    expect(lost.body.activities[0]).toMatchObject({
      kind: "stage",
      meta: { to: "lost", reason: "Chose another system" },
    })
  })

  it("keeps interests, tags and custom fields, and filters leads by them", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const city = await call<{ id: string; label: string }[]>("POST", staff.token, "/crm/fields", {
      label: "المدينة",
      type: "select",
      options: ["الرياض", "جدة"],
    })
    const cityId = city.body.find((field) => field.label === "المدينة")!.id
    // A list field needs its choices, and a value must be one of them.
    expect(
      (await call("POST", staff.token, "/crm/fields", { label: "x", type: "select" })).status
    ).toBe(400)

    const riyadh = await call<{ lead: Lead }>("POST", staff.token, "/crm/leads", {
      companyName: "متجر الرياض",
    })
    const jeddah = await call<{ lead: Lead }>("POST", staff.token, "/crm/leads", {
      companyName: "متجر جدة",
    })
    const updated = await call<{
      lead: { interests: string[]; tags: string[]; customFields: Record<string, unknown> }
    }>("PATCH", staff.token, `/crm/leads/${riyadh.body.lead.id}`, {
      interests: ["pos", "ecommerce"],
      tags: ["VIP"],
      customFields: { [cityId]: "الرياض" },
    })
    expect(updated.body.lead).toMatchObject({
      interests: ["pos", "ecommerce"],
      tags: ["VIP"],
      customFields: { [cityId]: "الرياض" },
    })
    expect(
      (
        await call("PATCH", staff.token, `/crm/leads/${jeddah.body.lead.id}`, {
          customFields: { [cityId]: "الدمام" },
        })
      ).status
    ).toBe(400)

    const filtered = async (conditions: unknown[]) => {
      const query = encodeURIComponent(JSON.stringify(conditions))
      const result = await call<{ items: Lead[] }>(
        "GET",
        staff.token,
        `/crm/leads?conditions=${query}`
      )
      return result.body.items.map((lead) => lead.companyName)
    }
    expect(await filtered([{ field: "interests", op: "includes", value: "pos" }])).toEqual([
      "متجر الرياض",
    ])
    expect(await filtered([{ field: `custom:${cityId}`, op: "is_empty" }])).toEqual(["متجر جدة"])
    expect(
      await filtered([
        { field: "tags", op: "includes", value: "VIP" },
        { field: "interests", op: "excludes", value: "pos" },
      ])
    ).toEqual([])

    // A date range on when the lead was added.
    const today = new Date().toISOString().slice(0, 10)
    const inRange = await call<{ items: Lead[] }>(
      "GET",
      staff.token,
      `/crm/leads?from=${today}&to=${today}`
    )
    expect(inRange.body.items).toHaveLength(2)
    const past = await call<{ items: Lead[] }>("GET", staff.token, "/crm/leads?to=2020-01-01")
    expect(past.body.items).toHaveLength(0)
  })

  it("adds custom stages between the built-in ones", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    type Stage = { key: string; label: string; system: boolean }
    const added = await call<Stage[]>("POST", staff.token, "/crm/stages", {
      label: "عرض سعر مرسل",
      color: "teal",
      after: "contacted",
    })
    expect(added.status).toBe(201)
    expect(added.body.map((stage) => stage.label)).toEqual([
      "جديد",
      "تم التواصل",
      "عرض سعر مرسل",
      "اجتماع محجوز",
      "تجربة",
      "تم الفوز",
      "خسارة",
    ])
    const custom = added.body.find((stage) => !stage.system)!
    // A second one after the first.
    const second = await call<Stage[]>("POST", staff.token, "/crm/stages", {
      label: "تفاوض",
      color: "orange",
      after: custom.key,
    })
    expect(second.body.map((stage) => stage.label).slice(2, 4)).toEqual(["عرض سعر مرسل", "تفاوض"])

    // Dragged after "تجربة"; built-in stages can't swap.
    const reordered = await call<Stage[]>("PUT", staff.token, "/crm/stages/order", {
      order: ["new", "contacted", second.body[3].key, "meeting", "trial", custom.key],
    })
    expect(reordered.body.map((stage) => stage.label)).toEqual([
      "جديد",
      "تم التواصل",
      "تفاوض",
      "اجتماع محجوز",
      "تجربة",
      "عرض سعر مرسل",
      "تم الفوز",
      "خسارة",
    ])
    const swapped = await call("PUT", staff.token, "/crm/stages/order", {
      order: ["contacted", "new", second.body[3].key, "meeting", "trial", custom.key],
    })
    expect(swapped.status).toBe(400)

    const lead = await call<{ lead: Lead }>("POST", staff.token, "/crm/leads", {
      companyName: "شركة المراحل",
    })
    const moved = await call<LeadDetail>(
      "POST",
      staff.token,
      `/crm/leads/${lead.body.lead.id}/stage`,
      {
        stage: custom.key,
      }
    )
    expect(moved.body.lead.stage).toBe(custom.key)
    expect(
      (await call("POST", staff.token, `/crm/leads/${lead.body.lead.id}/stage`, { stage: "nope" }))
        .status
    ).toBe(400)
    const board = await call<{ leads: Lead[] }>("GET", staff.token, "/crm/pipeline")
    expect(board.body.leads.map((entry) => entry.stage)).toContain(custom.key)

    // Built-in stages stay; deleting a custom one moves its leads.
    expect((await call("DELETE", staff.token, "/crm/stages/new?moveTo=contacted")).status).toBe(404)
    const left = await call<Stage[]>(
      "DELETE",
      staff.token,
      `/crm/stages/${custom.key}?moveTo=contacted`
    )
    expect(left.body.map((stage) => stage.key)).not.toContain(custom.key)
    const after = await call<LeadDetail>("GET", staff.token, `/crm/leads/${lead.body.lead.id}`)
    expect(after.body.lead.stage).toBe("contacted")
  })

  it("saves filtered views for the whole sales team", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const definition = {
      conditions: [{ field: "stage", op: "is", value: "new" }],
      groupBy: "owner",
    }
    const saved = await call<{ id: string; name: string; definition: unknown }[]>(
      "POST",
      staff.token,
      "/crm/views",
      { name: "جدد بلا مسؤول", page: "leads", definition }
    )
    expect(saved.body).toMatchObject([{ name: "جدد بلا مسؤول", definition }])
    expect((await call<unknown[]>("GET", staff.token, "/crm/views?page=quotes")).body).toHaveLength(
      0
    )
    const left = await call<unknown[]>("DELETE", staff.token, `/crm/views/${saved.body[0].id}`)
    expect(left.body).toHaveLength(0)
  })

  it("is for Super Admins and the Sales role only", async () => {
    const owner = await signIn(STAFF_EMAIL, "Madar HQ")
    const sales = await signIn("sales@madar.test", "Sales Person Org")
    const finance = await signIn("finance@madar.test", "Finance Person Org")
    const customer = await signIn("shop@shop.test", "Shop")

    expect((await call("GET", sales.token, "/crm/leads")).status).toBe(403)
    for (const [email, role] of [
      ["sales@madar.test", "sales"],
      ["finance@madar.test", "finance"],
    ]) {
      expect((await call("POST", owner.token, "/staff", { email, role })).status).toBe(201)
    }

    // Sales reaches the CRM only.
    expect((await call("GET", sales.token, "/crm/leads")).status).toBe(200)
    expect((await call("GET", sales.token, "/crm/dashboard")).status).toBe(200)
    expect((await call("GET", sales.token, "/customers")).status).toBe(403)
    // Other roles and customers don't reach it.
    expect((await call("GET", finance.token, "/crm/leads")).status).toBe(403)
    expect((await call("GET", customer.token, "/crm/leads")).status).toBe(403)

    // The owner list offers Super Admins and Sales staff.
    const owners = await call<{ email: string }[]>("GET", sales.token, "/crm/owners")
    expect(owners.body.map((person) => person.email).sort()).toEqual(
      ["sales@madar.test", STAFF_EMAIL].sort()
    )
  })
})
