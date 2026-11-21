// @vitest-environment node
//
// The Loyalty app (migration 175): the programme and its rewards, members and their points,
// joining from the public link, a member's own card, what a sale earns, and the wallet pass.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import forge from "node-forge"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { LoyaltyService } from "../loyalty/service"
import { buildPass, LoyaltyWallet, passDescription, type WalletConfig } from "../loyalty/wallet"

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

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

async function signIn(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Loyalty Test",
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
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Loyalty Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  await mergeOrgSettings(actor.organizationId, { loyaltyEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` doesn't handle a cast parameter -- read, merge in JS and overwrite.
async function mergeOrgSettings(organizationId: string, patch: Record<string, unknown>) {
  const existing = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  const merged = { ...(existing.rows[0]?.settings ?? {}), ...patch }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bodies are asserted field by field
async function call<T = any>(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? authHeaders(token) : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

const activate = (token: string, patch: Record<string, unknown> = {}) =>
  call("PUT", "/v1/loyalty/program", token, { isActive: true, ...patch })

async function customer(organizationId: string, name: string, phone: string) {
  const id = randomUUID()
  await database.query(
    `insert into customers (id, organization_id, name, phone) values ($1, $2, $3, $4)`,
    [id, organizationId, name, phone]
  )
  return id
}

// A certificate made on the spot, standing in for Apple's.
function walletConfig(): WalletConfig {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const certificate = forge.pki.createCertificate()
  certificate.publicKey = keys.publicKey
  certificate.serialNumber = "01"
  certificate.validity.notBefore = new Date(Date.now() - 60_000)
  certificate.validity.notAfter = new Date(Date.now() + 3600_000)
  const subject = [{ name: "commonName", value: "Pass Type ID: pass.test.loyalty" }]
  certificate.setSubject(subject)
  certificate.setIssuer(subject)
  certificate.sign(keys.privateKey, forge.md.sha256.create())
  const pem = forge.pki.certificateToPem(certificate)
  return {
    passTypeId: "pass.test.loyalty",
    teamId: "TEAM123456",
    certificate: pem,
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    wwdr: pem,
    serviceUrl: "https://api.example.test/v1/public/loyalty/wallet",
    appUrl: "https://app.example.test",
  }
}

describe("the Loyalty app", () => {
  it("keeps the programme, its rewards and a member's points", async () => {
    const { token } = await signIn("loyalty-basic@madar.test", "Basic")

    const fresh = await call("GET", "/v1/loyalty/program", token)
    expect(fresh.body).toMatchObject({ isActive: false, pointsPerSar: 1, walletAvailable: false })
    expect(fresh.body.joinCode).toMatch(/^[a-z0-9]{8}$/)

    const saved = await activate(token, {
      pointsPerSar: 2,
      pointValue: 0.1,
      cardColor: "#112233",
      locations: [{ name: "الفرع الرئيسي", latitude: 24.7136, longitude: 46.6753 }],
      nearbyEnabled: true,
    })
    expect(saved.body).toMatchObject({ isActive: true, pointsPerSar: 2, cardColor: "#112233" })
    expect(saved.body.locations).toHaveLength(1)
    // The join code never changes with the settings.
    expect(saved.body.joinCode).toBe(fresh.body.joinCode)

    // A free reward has to name what is free.
    expect(
      (
        await call("POST", "/v1/loyalty/rewards", token, {
          name: "قهوة مجانية",
          pointsCost: 100,
          kind: "free",
          value: 0,
          items: [],
          isActive: true,
        })
      ).status
    ).toBe(400)
    const reward = (
      await call("POST", "/v1/loyalty/rewards", token, {
        name: "خصم 10 ريال",
        pointsCost: 100,
        kind: "amount",
        value: 10,
        items: [],
        isActive: true,
      })
    ).body

    const member = (
      await call("POST", "/v1/loyalty/members", token, { name: "سارة", phone: "0500000001" })
    ).body
    expect(member).toMatchObject({ name: "سارة", points: 0 })
    expect(member.cardCode).toMatch(/^\d{10}$/)
    // The same phone is the same member.
    expect(
      (await call("POST", "/v1/loyalty/members", token, { name: "سارة", phone: "0500000001" }))
        .status
    ).toBe(409)

    // Not enough points yet.
    const short = await call("POST", `/v1/loyalty/members/${member.id}/redeem`, token, {
      rewardId: reward.id,
    })
    expect(short.body.code).toBe("LOYALTY_POINTS_SHORT")

    const added = await call("POST", `/v1/loyalty/members/${member.id}/adjust`, token, {
      points: 150,
      note: "ترحيب",
    })
    expect(added.body.member.points).toBe(150)
    // Taking more than is there is refused.
    expect(
      (await call("POST", `/v1/loyalty/members/${member.id}/adjust`, token, { points: -500 })).body
        .code
    ).toBe("LOYALTY_POINTS_SHORT")

    const redeemed = await call("POST", `/v1/loyalty/members/${member.id}/redeem`, token, {
      rewardId: reward.id,
    })
    expect(redeemed.body.member.points).toBe(50)
    expect(redeemed.body.redemptions[0]).toMatchObject({ status: "used", pointsCost: 100 })

    const found = await call("GET", `/v1/loyalty/members?search=${member.cardCode}`, token)
    expect(found.body.items).toHaveLength(1)

    const overview = (await call("GET", "/v1/loyalty/overview", token)).body
    expect(overview).toMatchObject({ members: 1, outstandingPoints: 50, outstandingValue: 5 })
    expect(overview).toMatchObject({ earned: 150, redeemed: 100 })
  })

  it("lets a customer join from the link, see the card and take a reward", async () => {
    const { token } = await signIn("loyalty-join@madar.test", "Join")
    const program = (await call("GET", "/v1/loyalty/program", token)).body
    const page = `/v1/public/loyalty/join/${program.joinCode}`

    // Nothing to join until the programme is switched on.
    expect((await call("GET", page)).status).toBe(404)
    await activate(token, {
      reviewBonusEnabled: true,
      reviewBonusPoints: 60,
      googleReviewUrl: "https://g.page/r/example/review",
    })
    const reward = (
      await call("POST", "/v1/loyalty/rewards", token, {
        name: "خصم 10٪",
        pointsCost: 50,
        kind: "percent",
        value: 10,
        items: [],
        isActive: true,
      })
    ).body
    expect((await call("GET", page)).body.rewards).toHaveLength(1)

    const joined = (await call("POST", page, undefined, { name: "خالد", phone: "050 000 0002" }))
      .body
    expect(joined.alreadyMember).toBe(false)
    // The same phone again is told it has a card, and is not handed that card.
    expect(
      (await call("POST", page, undefined, { name: "غريب", phone: "0500000002" })).body
    ).toEqual({ token: null, alreadyMember: true })

    const cardPath = `/v1/public/loyalty/cards/${joined.token}`
    const card = (await call("GET", cardPath)).body
    expect(card).toMatchObject({ name: "خالد", points: 0, walletAvailable: false })
    expect(card.review).toMatchObject({ points: 60, done: false })

    // The review bonus is given once.
    expect((await call("POST", `${cardPath}/review`)).body.points).toBe(60)
    const again = (await call("POST", `${cardPath}/review`)).body
    expect(again).toMatchObject({ points: 60, review: { done: true } })

    const taken = (await call("POST", `${cardPath}/redeem`, undefined, { rewardId: reward.id }))
      .body
    expect(taken.points).toBe(10)
    expect(taken.waitingReward.code).toMatch(/^\d{6}$/)
    // One reward waits at a time.
    expect(
      (await call("POST", `${cardPath}/redeem`, undefined, { rewardId: reward.id })).status
    ).toBe(409)

    const waiting = (await call("GET", "/v1/loyalty/redemptions/waiting", token)).body.items
    expect(waiting).toHaveLength(1)
    // Called off: the points go back.
    await call("POST", `/v1/loyalty/redemptions/${waiting[0].id}/cancel`, token)
    expect((await call("GET", cardPath)).body).toMatchObject({ points: 60, waitingReward: null })

    expect((await call("GET", "/v1/public/loyalty/cards/nope")).status).toBe(404)
  })

  it("earns on a sale once, adds the online bonus and takes back what is returned", async () => {
    const { token, actor } = await signIn("loyalty-earn@madar.test", "Earn")
    const org = actor.organizationId
    const service = new LoyaltyService(database)
    const buyer = await customer(org, "منى", "0500000003")

    // No programme, no points.
    expect(
      await service.earn(org, { customerId: buyer, amount: 100, source: "pos", ref: "sale-0" })
    ).toBe(0)
    await activate(token, { pointsPerSar: 2, onlineBonusEnabled: true, onlineBonusPoints: 25 })

    const sale = { customerId: buyer, amount: 100, source: "pos" as const, ref: "sale-1" }
    expect(await service.earn(org, sale)).toBe(200)
    // The same sale again earns nothing more.
    expect(await service.earn(org, sale)).toBe(200)
    expect(await service.balanceOf(org, buyer)).toBe(200)

    // A quarter of the sale returned takes a quarter of its points.
    expect(await service.unearn(org, { source: "pos", ref: "sale-1", fraction: 0.25 })).toBe(50)
    expect(await service.unearn(org, { source: "pos", ref: "sale-1" })).toBe(150)
    expect(await service.balanceOf(org, buyer)).toBe(0)

    // A visit booked online earns the bonus too, and earns again after it was undone.
    const visit = {
      customerId: buyer,
      amount: 40,
      source: "booking" as const,
      ref: "visit-1",
      online: true,
    }
    expect(await service.earn(org, visit)).toBe(105)
    await service.unearn(org, { source: "booking", ref: "visit-1" })
    expect(await service.earn(org, visit)).toBe(105)

    // Points used as money come off, and come back when the sale is undone.
    await service.spend(org, { customerId: buyer, points: 100, source: "booking", ref: "visit-2" })
    expect(await service.balanceOf(org, buyer)).toBe(5)
    await expect(
      service.spend(org, { customerId: buyer, points: 100, source: "booking", ref: "visit-3" })
    ).rejects.toMatchObject({ code: "LOYALTY_POINTS_SHORT" })
    await service.giveBack(org, { source: "booking", ref: "visit-2" })
    await service.giveBack(org, { source: "booking", ref: "visit-2" })
    expect(await service.balanceOf(org, buyer)).toBe(105)

    const members = (await call("GET", "/v1/loyalty/members", token)).body.items
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ name: "منى", points: 105, customerId: buyer })
  })

  it("is closed to a business without the app", async () => {
    const { token, actor } = await signIn("loyalty-gate@madar.test", "Gate")
    await mergeOrgSettings(actor.organizationId, { loyaltyEnabled: false })
    expect((await call("GET", "/v1/loyalty/program", token)).status).toBe(403)
  })

  it("makes a signed wallet pass and tells the phones holding it when it changes", async () => {
    const { token, actor } = await signIn("loyalty-wallet@madar.test", "Wallet")
    const org = actor.organizationId
    await activate(token, {
      pointValue: 0.1,
      nearbyEnabled: true,
      nearbyMessage: "مرحبًا بك في {name}، لديك {points} نقطة",
      locations: [{ name: "الفرع", latitude: 24.7, longitude: 46.6 }],
    })
    await call("POST", "/v1/loyalty/rewards", token, {
      name: "قهوة",
      pointsCost: 300,
      kind: "amount",
      value: 15,
      items: [],
      isActive: true,
    })
    const member = (
      await call("POST", "/v1/loyalty/members", token, { name: "ريم", phone: "0500000004" })
    ).body
    await call("POST", `/v1/loyalty/members/${member.id}/adjust`, token, { points: 120 })

    const config = walletConfig()
    const service = new LoyaltyService(database)
    const pushed: string[][] = []
    const wallet = new LoyaltyWallet(database, service, config, async (_config, tokens) => {
      pushed.push(tokens)
    })
    const program = await service.getProgram(org)
    const rewards = await service.listRewards(org)
    const described = passDescription(
      config,
      { ...member, points: 120, walletMessage: null },
      program,
      rewards
    ) as {
      serialNumber: string
      storeCard: { headerFields: Array<{ value: number }>; secondaryFields: Array<{ key: string }> }
      locations: Array<{ relevantText: string }>
      barcodes: Array<{ message: string }>
    }
    expect(described.serialNumber).toBe(member.id)
    expect(described.storeCard.headerFields[0].value).toBe(120)
    expect(described.storeCard.secondaryFields.map((field) => field.key)).toEqual(["value", "next"])
    expect(described.locations[0].relevantText).toBe("مرحبًا بك في Wallet، لديك 120 نقطة")
    expect(described.barcodes[0].message).toBe(member.cardCode)

    const { pass } = await wallet.passForToken(member.token)
    expect(pass.subarray(0, 2).toString()).toBe("PK")
    for (const name of ["pass.json", "manifest.json", "signature", "icon.png"]) {
      expect(pass.includes(Buffer.from(name))).toBe(true)
    }
    expect(
      buildPass(config, { ...member, walletMessage: null }, program, rewards).length
    ).toBeGreaterThan(1000)

    // A phone adds the card: only with the card's own token.
    expect(await wallet.register("phone-1", member.id, "wrong", "push-1")).toBe("refused")
    expect(await wallet.register("phone-1", member.id, member.token, "push-1")).toBe("created")
    expect(await wallet.register("phone-1", member.id, member.token, "push-1b")).toBe("known")
    expect((await call("GET", "/v1/loyalty/members", token)).body.items[0].inWallet).toBe(true)

    const first = await wallet.changedSince("phone-1", null)
    expect(first?.serialNumbers).toEqual([member.id])
    expect(await wallet.changedSince("phone-1", first?.lastUpdated ?? null)).toBeNull()

    expect(await wallet.pushNow(member.id)).toBe(1)
    expect(pushed).toEqual([["push-1b"]])
    expect(await service.broadcast(org, "عرض نهاية الأسبوع")).toBe(1)
    expect((await wallet.passForSerial(member.id, member.token))?.pass.length).toBeGreaterThan(1000)
    expect(await wallet.passForSerial(member.id, "wrong")).toBeNull()

    expect(await wallet.unregister("phone-1", member.id, member.token)).toBe(true)
    expect(await wallet.pushNow(member.id)).toBe(0)
  })
})
