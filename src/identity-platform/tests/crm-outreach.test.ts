// @vitest-environment node
//
// WhatsApp outreach sent by hand from the CRM (crm/outreach.ts): the message filled in for each
// lead with a link of its own, the stage a new lead moves to, the daily limit, taking a send
// back, marking a reply, and counting taps on the link.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CrmOutreach, whatsAppNumber } from "../crm/outreach"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

let database: PostgresDatabase
let now = new Date("2026-11-23T09:00:00Z")
let actor: AuthenticatedActor

beforeEach(async () => {
  now = new Date("2026-11-23T09:00:00Z")
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())
  const userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'سلمان', now())`,
    [userId, `${userId}@madar.test`]
  )
  actor = {
    userId,
    sessionId: randomUUID(),
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    roles: [],
    modulePermissions: [],
    isPlatformAdmin: true,
    platformPermissions: ["crm:manage"],
  } as AuthenticatedActor
})
afterEach(async () => {
  await database.end()
})

async function lead(input: {
  company: string
  contact?: string | null
  phone?: string | null
  stage?: string
  tags?: string[]
  source?: string
}) {
  const id = randomUUID()
  await database.query(
    `insert into crm_leads (id, company_name, contact_name, phone, source, stage, tags)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      input.company,
      input.contact ?? null,
      input.phone ?? null,
      input.source ?? "import",
      input.stage ?? "new",
      JSON.stringify(input.tags ?? []),
    ]
  )
  return id
}
const stageOf = async (id: string) =>
  (await database.query<{ stage: string }>(`select stage from crm_leads where id = $1`, [id]))
    .rows[0].stage

const CAMPAIGN = {
  name: "عرض نوفمبر",
  message: "مرحبًا {الاسم}، هل يستخدم {النشاط} كاشيرًا متوافقًا مع الزكاة؟\n{الرابط}",
  linkUrl: "https://www.madar.my/contact-sales/?lp=cashier",
  linkTitle: "مدار",
  linkDescription: "كاشير سعودي",
  imageUrl: "https://files.madar.test/offer.png",
  dailyLimit: 2,
}

describe("WhatsApp outreach from the CRM", () => {
  it("opens WhatsApp with the message written for the lead, and moves a new lead on", async () => {
    const outreach = new CrmOutreach(database, () => now)
    const campaign = await outreach.create(actor, CAMPAIGN)
    const reem = await lead({ company: "مطعم الريم", contact: "سارة", phone: "0553334444" })

    const sent = await outreach.send(actor, campaign.id, reem)
    expect(sent.phone).toBe("966553334444")
    expect(sent.trackedUrl).toMatch(/^https:\/\/www\.madar\.my\/o\/[A-Za-z0-9_-]{8}$/)
    expect(sent.message).toBe(
      `مرحبًا سارة، هل يستخدم مطعم الريم كاشيرًا متوافقًا مع الزكاة؟\n${sent.trackedUrl}`
    )
    expect(sent.whatsappUrl).toBe(
      `https://wa.me/966553334444?text=${encodeURIComponent(sent.message)}`
    )
    expect(await stageOf(reem)).toBe("whatsapp_sent")
    const timeline = await database.query<{ kind: string; body: string | null }>(
      `select kind, body from crm_activities where lead_id = $1 order by created_at`,
      [reem]
    )
    expect(timeline.rows.map((row) => row.kind)).toEqual(["whatsapp", "stage"])
    expect(timeline.rows[0].body).toBe("رسالة واتساب: عرض نوفمبر")

    // Pressed again: the same link, nothing recorded twice.
    const again = await outreach.send(actor, campaign.id, reem)
    expect(again.trackedUrl).toBe(sent.trackedUrl)
    expect((await outreach.list(actor))[0].stats).toMatchObject({ sent: 1, sentToday: 1 })

    // With no person's name the business's name stands in; with no {الرابط} the link is added
    // at the end; a lead further along stays in its stage.
    const plain = await outreach.create(actor, { ...CAMPAIGN, message: "أهلًا {الاسم}" })
    const nakheel = await lead({ company: "مقهى النخيل", phone: "+966557778888", stage: "meeting" })
    const second = await outreach.send(actor, plain.id, nakheel)
    expect(second.message).toBe(`أهلًا مقهى النخيل\n${second.trackedUrl}`)
    expect(await stageOf(nakheel)).toBe("meeting")
  })

  it("stops at the day's limit, and starts again the next day", async () => {
    const outreach = new CrmOutreach(database, () => now)
    const campaign = await outreach.create(actor, CAMPAIGN)
    const leads = [
      await lead({ company: "واحد", phone: "0550000001" }),
      await lead({ company: "اثنان", phone: "0550000002" }),
      await lead({ company: "ثلاثة", phone: "0550000003" }),
    ]
    await outreach.send(actor, campaign.id, leads[0])
    await outreach.send(actor, campaign.id, leads[1])
    await expect(outreach.send(actor, campaign.id, leads[2])).rejects.toMatchObject({
      code: "CRM_OUTREACH_DAILY_LIMIT",
      details: { limit: 2 },
    })
    expect(await stageOf(leads[2])).toBe("new")
    // Someone already sent to can still be opened again on a full day.
    await outreach.send(actor, campaign.id, leads[0])

    now = new Date("2026-11-24T06:00:00Z")
    await outreach.send(actor, campaign.id, leads[2])
    expect((await outreach.list(actor))[0].stats).toMatchObject({ sent: 3, sentToday: 1 })

    // A lead with no number WhatsApp can open is refused, not counted.
    const landline = await lead({ company: "بلا جوال", phone: null })
    await expect(outreach.send(actor, campaign.id, landline)).rejects.toMatchObject({
      code: "CRM_OUTREACH_NO_PHONE",
    })
  })

  it("lists who is left, takes a send back, and marks a reply", async () => {
    const outreach = new CrmOutreach(database, () => now)
    const campaign = await outreach.create(actor, { ...CAMPAIGN, dailyLimit: 20 })
    const reem = await lead({ company: "الريم", phone: "0553334444", tags: ["قائمة المعرض"] })
    const ward = await lead({ company: "الورد", phone: "0553335555", tags: ["قائمة المعرض"] })
    await lead({ company: "من الموقع", phone: "0553336666", source: "website" })
    await lead({ company: "عميل قديم", phone: "0553337777", stage: "won", tags: ["قائمة المعرض"] })

    const listed = await outreach.leads(actor, campaign.id, { tag: "قائمة المعرض" })
    // The won one is nobody to open a conversation with.
    expect(listed.items.map((item) => item.companyName).sort()).toEqual(["الريم", "الورد"].sort())
    expect(listed.tags).toEqual(["قائمة المعرض"])
    expect(listed.pending).toBe(2)

    await outreach.send(actor, campaign.id, reem)
    await outreach.send(actor, campaign.id, ward)
    const pending = await outreach.leads(actor, campaign.id, {
      tag: "قائمة المعرض",
      status: "pending",
    })
    expect(pending.items).toEqual([])
    const sent = await outreach.leads(actor, campaign.id, { status: "sent" })
    expect(sent.items.find((item) => item.leadId === reem)?.send).toMatchObject({
      sentBy: "سلمان",
      clicks: 0,
      repliedAt: null,
    })

    // Not sent after all: the record goes and the lead is new again.
    await outreach.undo(actor, campaign.id, ward)
    expect(await stageOf(ward)).toBe("new")
    expect((await outreach.list(actor))[0].stats.sent).toBe(1)

    // They answered: marked, and the lead becomes "contacted".
    await outreach.setReplied(actor, campaign.id, reem, true)
    expect(await stageOf(reem)).toBe("contacted")
    expect((await outreach.list(actor))[0].stats).toMatchObject({ replied: 1, advanced: 1 })
  })

  it("counts taps on a lead's link, and tells the link's page nothing about the lead", async () => {
    const outreach = new CrmOutreach(database, () => now)
    const campaign = await outreach.create(actor, { ...CAMPAIGN, dailyLimit: 20 })
    const reem = await lead({ company: "الريم", phone: "0553334444" })
    const sent = await outreach.send(actor, campaign.id, reem)
    const code = sent.trackedUrl.split("/").pop() as string

    const link = await outreach.publicLink(code)
    expect(link).toMatchObject({
      title: "مدار",
      description: "كاشير سعودي",
      imageUrl: "https://files.madar.test/offer.png",
    })
    const target = new URL(link!.target)
    expect(target.origin + target.pathname).toBe("https://www.madar.my/contact-sales/")
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      lp: "cashier",
      utm_source: "whatsapp",
      utm_medium: "outreach",
      utm_content: code,
    })
    expect(JSON.stringify(link)).not.toContain("الريم")
    expect(JSON.stringify(link)).not.toContain("553334444")

    expect(await outreach.recordClick(code)).toBe(true)
    expect(await outreach.recordClick(code)).toBe(true)
    expect(await outreach.recordClick("nosuchcode")).toBe(false)
    expect(await outreach.publicLink("nosuchcode")).toBeNull()
    expect((await outreach.list(actor))[0].stats).toMatchObject({ sent: 1, clicked: 1, clicks: 2 })
    const row = (await outreach.leads(actor, campaign.id, { status: "sent" })).items[0]
    expect(row.send).toMatchObject({ clicks: 2 })
    expect(row.send?.lastClickedAt).toBeTruthy()
  })

  it("is for the sales team only, and puts numbers in WhatsApp's form", async () => {
    const outreach = new CrmOutreach(database, () => now)
    const outsider = { ...actor, platformPermissions: [] } as AuthenticatedActor
    await expect(outreach.list(outsider)).rejects.toBeTruthy()
    await expect(outreach.create(outsider, CAMPAIGN)).rejects.toBeTruthy()

    expect(whatsAppNumber("0553334444")).toBe("966553334444")
    expect(whatsAppNumber("+966 55 333 4444")).toBe("966553334444")
    expect(whatsAppNumber("٠٥٥٣٣٣٤٤٤٤")).toBe("966553334444")
    expect(whatsAppNumber("553334444")).toBe("966553334444")
    expect(whatsAppNumber("+971501234567")).toBe("971501234567")
    expect(whatsAppNumber("0112345678")).toBeNull()
    expect(whatsAppNumber(null)).toBeNull()
  })
})
