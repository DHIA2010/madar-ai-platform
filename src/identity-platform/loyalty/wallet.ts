// A member's card as an Apple Wallet pass.
//
// The pass is a small signed archive the phone keeps. It carries the balance, the card's code
// as a QR, the business's places (the phone shows the card on the lock screen near one of
// them) and the address of this server, which the phone asks for a fresh copy whenever it is
// told the card changed. Telling it is one empty push through Apple.
//
// Signing needs a Pass Type ID certificate from an Apple Developer account. Without one in the
// environment nothing here is offered and the rest of the Loyalty app works as it is.

import { createHash, randomUUID } from "node:crypto"
import http2 from "node:http2"
import { deflateSync } from "node:zlib"

import forge from "node-forge"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { LoyaltyService, ProgramView, RewardView } from "./service"

type Row = Record<string, unknown>

export interface WalletConfig {
  passTypeId: string
  teamId: string
  // PEM texts: the pass certificate, its private key, and Apple's intermediate (WWDR).
  certificate: string
  privateKey: string
  wwdr: string
  // Where the phone reaches this server's wallet routes, without a trailing slash.
  serviceUrl: string
  // Where a member's card page lives, without a trailing slash.
  appUrl: string
}

const pem = (value: string | undefined) => {
  const raw = value?.trim()
  if (!raw) return null
  return raw.includes("-----BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8")
}

// The certificate and the names that go with it, from the environment. Null when any is missing.
export function walletConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WalletConfig | null {
  const passTypeId = env.LOYALTY_WALLET_PASS_TYPE_ID?.trim()
  const teamId = env.LOYALTY_WALLET_TEAM_ID?.trim()
  const certificate = pem(env.LOYALTY_WALLET_CERT_PEM)
  const privateKey = pem(env.LOYALTY_WALLET_KEY_PEM)
  const wwdr = pem(env.LOYALTY_WALLET_WWDR_PEM)
  if (!passTypeId || !teamId || !certificate || !privateKey || !wwdr) return null
  const strip = (value: string) => value.replace(/\/+$/, "")
  return {
    passTypeId,
    teamId,
    certificate,
    privateKey,
    wwdr,
    serviceUrl: strip(
      env.LOYALTY_WALLET_SERVICE_URL ?? "https://api.madar.my/v1/public/loyalty/wallet"
    ),
    appUrl: strip(env.NEXT_PUBLIC_APP_URL ?? env.APP_URL ?? "https://app.madar.my"),
  }
}

// ---- The small pieces a pass is made of ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// An archive of files kept as they are (a pass is small, so nothing is gained by squeezing).
export function zip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8")
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(0, 10)
    entry.writeUInt16LE(0, 12)
    entry.writeUInt16LE(0x21, 14)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(file.data.length, 20)
    entry.writeUInt32LE(file.data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    parts.push(local, name, file.data)
    directory.push(entry, name)
    offset += local.length + name.length + file.data.length
  }
  const directorySize = directory.reduce((total, part) => total + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directorySize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...directory, end])
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

// The card's picture where the phone needs one: a star in the text colour on the card colour.
export function starIcon(size: number, background: string, foreground: string): Buffer {
  const back = rgb(background)
  const front = rgb(foreground)
  const centre = size / 2
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? size * 0.36 : size * 0.15
    const angle = (Math.PI / 5) * index - Math.PI / 2
    return [centre + radius * Math.cos(angle), centre + radius * Math.sin(angle)]
  })
  const inside = (x: number, y: number) => {
    let hit = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const line = y * (size * 3 + 1)
    raw[line] = 0
    for (let x = 0; x < size; x += 1) {
      const colour = inside(x + 0.5, y + 0.5) ? front : back
      raw[line + 1 + x * 3] = colour[0]
      raw[line + 2 + x * 3] = colour[1]
      raw[line + 3 + x * 3] = colour[2]
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// The detached signature Apple checks the pass's file list against.
function sign(config: WalletConfig, manifest: Buffer): Buffer {
  const signed = forge.pkcs7.createSignedData()
  signed.content = forge.util.createBuffer(manifest.toString("binary"))
  const certificate = forge.pki.certificateFromPem(config.certificate)
  signed.addCertificate(certificate)
  signed.addCertificate(forge.pki.certificateFromPem(config.wwdr))
  signed.addSigner({
    key: forge.pki.privateKeyFromPem(config.privateKey),
    certificate,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  })
  signed.sign({ detached: true })
  return Buffer.from(forge.asn1.toDer(signed.toAsn1()).getBytes(), "binary")
}

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)

// The text the phone shows near one of the business's places. {points} and {name} are filled in.
export function nearbyText(program: ProgramView, points: number): string {
  const template =
    program.nearbyMessage?.trim() || "أنت قريب من {name} — لديك {points} نقطة بانتظارك"
  return template.replaceAll("{points}", number(points)).replaceAll("{name}", program.businessName)
}

export interface PassMember {
  id: string
  token: string
  name: string
  cardCode: string
  points: number
  walletMessage: string | null
}

// What the pass says, before it is signed and packed.
export function passDescription(
  config: WalletConfig,
  member: PassMember,
  program: ProgramView,
  rewards: RewardView[]
): Record<string, unknown> {
  const colour = (hex: string) => `rgb(${rgb(hex).join(", ")})`
  const offered = rewards
    .filter((reward) => reward.isActive)
    .sort((a, b) => a.pointsCost - b.pointsCost)
  const next = offered.find((reward) => reward.pointsCost > member.points)
  const reachable = offered.filter((reward) => reward.pointsCost <= member.points)
  const value = Math.round(member.points * program.pointValue * 100) / 100
  const back: Array<Record<string, unknown>> = [
    {
      key: "message",
      label: "رسالة من " + program.businessName,
      value: member.walletMessage ?? "",
      // The phone announces a new message as it is written.
      changeMessage: "%@",
    },
    {
      key: "rewards",
      label: "المكافآت",
      value: offered.length
        ? offered.map((reward) => `${number(reward.pointsCost)} نقطة: ${reward.name}`).join("\n")
        : "—",
    },
    { key: "card", label: "بطاقتك", value: `${config.appUrl}/lc/${member.token}` },
  ]
  if (program.terms) back.push({ key: "terms", label: "الشروط", value: program.terms })
  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: member.id,
    authenticationToken: member.token,
    webServiceURL: config.serviceUrl,
    organizationName: program.businessName,
    description: `${program.cardTitle ?? "بطاقة الولاء"} — ${program.businessName}`,
    logoText: program.businessName,
    backgroundColor: colour(program.cardColor),
    foregroundColor: colour(program.textColor),
    labelColor: colour(program.textColor),
    sharingProhibited: true,
    storeCard: {
      headerFields: [
        {
          key: "points",
          label: "النقاط",
          value: member.points,
          textAlignment: "PKTextAlignmentRight",
          ...(program.walletNotifyPoints ? { changeMessage: "رصيدك الآن %@ نقطة" } : {}),
        },
      ],
      primaryFields: [
        { key: "title", label: program.cardTitle ?? "بطاقة الولاء", value: member.name },
      ],
      secondaryFields: [
        { key: "value", label: "قيمة نقاطك", value: `${number(value)} ر.س` },
        ...(reachable.length
          ? [
              {
                key: "ready",
                label: "متاح لك الآن",
                value: reachable[reachable.length - 1].name,
                ...(program.walletNotifyPoints
                  ? { changeMessage: "صار بإمكانك استبدال نقاطك: %@" }
                  : {}),
              },
            ]
          : next
            ? [
                {
                  key: "next",
                  label: "المتبقي للمكافأة",
                  value: `${number(next.pointsCost - member.points)} نقطة`,
                },
              ]
            : []),
      ],
      backFields: back,
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: member.cardCode,
        messageEncoding: "iso-8859-1",
        altText: member.cardCode,
      },
    ],
    ...(program.nearbyEnabled && program.locations.length
      ? {
          locations: program.locations.slice(0, 10).map((place) => ({
            latitude: place.latitude,
            longitude: place.longitude,
            relevantText: nearbyText(program, member.points),
          })),
        }
      : {}),
  }
}

// The signed pass file.
export function buildPass(
  config: WalletConfig,
  member: PassMember,
  program: ProgramView,
  rewards: RewardView[]
): Buffer {
  const icon = (size: number) => starIcon(size, program.cardColor, program.textColor)
  const files = [
    {
      name: "pass.json",
      data: Buffer.from(JSON.stringify(passDescription(config, member, program, rewards)), "utf8"),
    },
    { name: "icon.png", data: icon(29) },
    { name: "icon@2x.png", data: icon(58) },
    { name: "icon@3x.png", data: icon(87) },
    { name: "logo.png", data: icon(50) },
    { name: "logo@2x.png", data: icon(100) },
  ]
  const manifest = Buffer.from(
    JSON.stringify(
      Object.fromEntries(
        files.map((file) => [file.name, createHash("sha1").update(file.data).digest("hex")])
      )
    ),
    "utf8"
  )
  return zip([
    ...files,
    { name: "manifest.json", data: manifest },
    { name: "signature", data: sign(config, manifest) },
  ])
}

// Tells Apple a card changed; each phone then asks this server for the fresh one.
export type WalletPush = (config: WalletConfig, pushTokens: string[]) => Promise<void>

export const pushThroughApple: WalletPush = (config, pushTokens) =>
  new Promise((resolve) => {
    if (pushTokens.length === 0) return resolve()
    const session = http2.connect("https://api.push.apple.com", {
      cert: config.certificate,
      key: config.privateKey,
    })
    let left = pushTokens.length
    const done = () => {
      left -= 1
      if (left <= 0) {
        session.close()
        resolve()
      }
    }
    session.on("error", (error) => {
      console.error("loyalty.wallet_push_failed", { error })
      resolve()
    })
    session.setTimeout(15_000, () => {
      session.destroy()
      resolve()
    })
    for (const token of pushTokens) {
      const request = session.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        "apns-topic": config.passTypeId,
        "apns-push-type": "background",
        "content-type": "application/json",
      })
      request.on("response", (headers) => {
        const status = Number(headers[":status"])
        if (status >= 400) console.error("loyalty.wallet_push_refused", { status })
      })
      request.on("error", done)
      request.on("close", done)
      request.end("{}")
    }
  })

// The wallet side of the Loyalty app: making a member's pass, remembering which phones hold
// it, and telling them when it changes.
export class LoyaltyWallet {
  private readonly pending = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly loyalty: LoyaltyService,
    readonly config: WalletConfig,
    private readonly push: WalletPush = pushThroughApple,
    // Several changes in a row (points and a bonus) become one refresh.
    private readonly settleMs = 2_000
  ) {}

  matches(passTypeId: string) {
    return passTypeId === this.config.passTypeId
  }

  async passForToken(token: string): Promise<{ pass: Buffer; updatedAt: Date }> {
    return this.passFor(await this.loyalty.memberByToken(token))
  }

  // The pass by its serial number, for the phone: only with the card's own token.
  async passForSerial(
    serial: string,
    token: string
  ): Promise<{ pass: Buffer; updatedAt: Date } | null> {
    const member = await this.authorised(serial, token)
    return member ? this.passFor(member) : null
  }

  private async passFor(member: Row): Promise<{ pass: Buffer; updatedAt: Date }> {
    const organizationId = String(member.organization_id)
    const [program, rewards] = await Promise.all([
      this.loyalty.getProgram(organizationId),
      this.loyalty.listRewards(organizationId),
    ])
    const pass = buildPass(
      this.config,
      {
        id: String(member.id),
        token: String(member.token),
        name: String(member.name),
        cardCode: String(member.card_code),
        points: Number(member.points),
        walletMessage: member.wallet_message ? String(member.wallet_message) : null,
      },
      program,
      rewards
    )
    return { pass, updatedAt: new Date(String(member.updated_at)) }
  }

  private async authorised(serial: string, token: string): Promise<Row | null> {
    if (!/^[0-9a-f-]{36}$/i.test(serial) || !token) return null
    const found = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE id = $1 AND token = $2`,
      [serial, token]
    )
    return found.rows[0] ?? null
  }

  // A phone added the card. Returns whether it was new.
  async register(
    deviceId: string,
    serial: string,
    token: string,
    pushToken: string
  ): Promise<"created" | "known" | "refused"> {
    const member = await this.authorised(serial, token)
    if (!member) return "refused"
    const known = await this.db.query<Row>(
      `SELECT id FROM loyalty_wallet_devices WHERE member_id = $1 AND device_id = $2`,
      [serial, deviceId]
    )
    if (known.rows[0]) {
      await this.db.query(`UPDATE loyalty_wallet_devices SET push_token = $2 WHERE id = $1`, [
        known.rows[0].id,
        pushToken,
      ])
      return "known"
    }
    await this.db.query(
      `INSERT INTO loyalty_wallet_devices (id, member_id, device_id, push_token)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), serial, deviceId, pushToken]
    )
    return "created"
  }

  // A phone removed the card.
  async unregister(deviceId: string, serial: string, token: string): Promise<boolean> {
    const member = await this.authorised(serial, token)
    if (!member) return false
    await this.db.query(
      `DELETE FROM loyalty_wallet_devices WHERE member_id = $1 AND device_id = $2`,
      [serial, deviceId]
    )
    return true
  }

  // The cards on a phone that changed since it last asked.
  async changedSince(
    deviceId: string,
    since: string | null
  ): Promise<{ serialNumbers: string[]; lastUpdated: string } | null> {
    const devices = await this.db.query<Row>(
      `SELECT member_id FROM loyalty_wallet_devices WHERE device_id = $1`,
      [deviceId]
    )
    const sinceMs = since ? Number(since) : 0
    const changed: Array<{ id: string; at: number }> = []
    for (const device of devices.rows) {
      const member = await this.db.query<Row>(
        `SELECT id, updated_at FROM loyalty_members WHERE id = $1`,
        [device.member_id]
      )
      const row = member.rows[0]
      if (!row) continue
      const at = new Date(String(row.updated_at)).getTime()
      if (!Number.isFinite(sinceMs) || at > sinceMs) changed.push({ id: String(row.id), at })
    }
    if (changed.length === 0) return null
    return {
      serialNumbers: changed.map((entry) => entry.id),
      lastUpdated: String(Math.max(...changed.map((entry) => entry.at))),
    }
  }

  // A member's card changed: tell the phones holding it, once things settle.
  cardChanged(memberId: string) {
    const waiting = this.pending.get(memberId)
    if (waiting) clearTimeout(waiting)
    const timer = setTimeout(() => {
      this.pending.delete(memberId)
      void this.pushNow(memberId).catch((error: unknown) =>
        console.error("loyalty.wallet_push_failed", { memberId, error })
      )
    }, this.settleMs)
    timer.unref()
    this.pending.set(memberId, timer)
  }

  async pushNow(memberId: string): Promise<number> {
    const devices = await this.db.query<Row>(
      `SELECT push_token FROM loyalty_wallet_devices WHERE member_id = $1`,
      [memberId]
    )
    const tokens = devices.rows.map((row) => String(row.push_token))
    if (tokens.length > 0) await this.push(this.config, tokens)
    return tokens.length
  }
}
