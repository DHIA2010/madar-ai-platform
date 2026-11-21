// Notifications for a loyalty card saved to a phone's home screen (web push).
//
// The customer switches them on from their own card page; the phone hands back an address at
// its maker's push service (Apple, Google, Mozilla) and Madar sends to it when the member's
// points grow or the business sends a message. No app and no Apple Wallet certificate needed.

import { randomUUID } from "node:crypto"

import webpush from "web-push"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { decryptSecret, encryptSecret } from "../whatsapp/platform-config"
import { LOYALTY_ERRORS, type LoyaltyNotice, type LoyaltyService } from "./service"

type Row = Record<string, unknown>

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
export interface PushKeys {
  publicKey: string
  privateKey: string
  subject: string
}
// Sends one message and answers with the push service's status code (201 is delivered to the
// service; 404 and 410 mean the phone no longer wants them).
export type PushSender = (target: PushTarget, payload: string, keys: PushKeys) => Promise<number>

const sendWithWebPush: PushSender = async (target, payload, keys) => {
  try {
    const sent = await webpush.sendNotification(target, payload, {
      vapidDetails: keys,
      TTL: 24 * 60 * 60,
      timeout: 10_000,
    })
    return sent.statusCode
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (typeof status === "number") return status
    throw error
  }
}

// Only the push services phones really use: an address anywhere else is refused, so nobody can
// make the server call an address of their choosing.
const PUSH_HOSTS = [
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  // Chrome's newer addresses (jmt17.google.com and its siblings).
  /^jmt\d+\.google\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
]
export function isPushAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)

// The words on the phone, in Arabic like the rest of what a customer reads.
export function noticeText(notice: LoyaltyNotice): string {
  const balance = `رصيدك الآن ${number(notice.balance)} نقطة`
  if (notice.kind === "earned") {
    const first = `حصلت على ${number(notice.points)} نقطة. ${balance}`
    return notice.reward ? `${first}، ويكفي لمكافأة: ${notice.reward}` : `${first}.`
  }
  return `أُضيفت ${number(notice.points)} نقطة إلى بطاقتك. ${balance}.`
}

const MAX_PER_MEMBER = 5
const strip = (value: string) => value.replace(/\/+$/, "")

export class LoyaltyPush {
  // Swapped in tests.
  sender: PushSender = sendWithWebPush
  private keys: PushKeys | null = null

  constructor(
    private readonly db: PostgresDatabase,
    private readonly service: LoyaltyService,
    private readonly appUrl = strip(
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.madar.my"
    )
  ) {}

  // Madar's key pair for signing push messages, made the first time it is needed.
  private async keyPair(): Promise<PushKeys> {
    if (this.keys) return this.keys
    const read = () =>
      this.db.query<Row>(`SELECT public_key, private_key FROM loyalty_push_keys WHERE id = 1`)
    let found = await read()
    if (!found.rows[0]) {
      const made = webpush.generateVAPIDKeys()
      await this.db.query(
        `INSERT INTO loyalty_push_keys (id, public_key, private_key) VALUES (1, $1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [made.publicKey, encryptSecret(made.privateKey)]
      )
      found = await read()
    }
    this.keys = {
      publicKey: String(found.rows[0].public_key),
      privateKey: decryptSecret(String(found.rows[0].private_key)),
      subject: "https://www.madar.my",
    }
    return this.keys
  }

  // The public half, which the phone needs to ask its push service for an address.
  async publicKey(): Promise<string> {
    return (await this.keyPair()).publicKey
  }

  // A phone asks for a card's notifications. The same phone asking again is the same entry.
  async subscribe(token: string, target: PushTarget): Promise<void> {
    if (!isPushAddress(target.endpoint)) {
      throw LOYALTY_ERRORS.invalid("LOYALTY_PUSH_INVALID", "That is not a push address.")
    }
    const member = await this.service.memberByToken(token)
    await this.db.query(`DELETE FROM loyalty_push_subscriptions WHERE endpoint = $1`, [
      target.endpoint,
    ])
    await this.db.query(
      `INSERT INTO loyalty_push_subscriptions
         (id, organization_id, member_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        member.organization_id,
        member.id,
        target.endpoint,
        target.keys.p256dh,
        target.keys.auth,
      ]
    )
    // A member keeps a handful of phones; the oldest go first.
    const held = await this.db.query<Row>(
      `SELECT id FROM loyalty_push_subscriptions WHERE member_id = $1 ORDER BY created_at DESC`,
      [member.id]
    )
    for (const row of held.rows.slice(MAX_PER_MEMBER)) {
      await this.db.query(`DELETE FROM loyalty_push_subscriptions WHERE id = $1`, [row.id])
    }
  }

  async unsubscribe(token: string, endpoint: string): Promise<void> {
    const member = await this.service.memberByToken(token)
    await this.db.query(
      `DELETE FROM loyalty_push_subscriptions WHERE member_id = $1 AND endpoint = $2`,
      [member.id, endpoint]
    )
  }

  // How many members of a business have notifications on.
  async memberCount(organizationId: string): Promise<number> {
    return (await this.subscribedMemberIds(organizationId)).size
  }

  // Kept on the member's card, whether or not their phone takes notifications: the card's own
  // list is where a message is found again after the notification is gone.
  private async keep(
    members: Row[],
    kind: "points" | "message",
    text: string,
    campaignId: string | null = null
  ): Promise<void> {
    for (let start = 0; start < members.length; start += 200) {
      const batch = members.slice(start, start + 200)
      const values: unknown[] = []
      const rows = batch.map((member, index) => {
        values.push(randomUUID(), member.organization_id, member.id, kind, text, campaignId)
        const at = index * 6
        return [1, 2, 3, 4, 5, 6].map((step) => "$" + String(at + step)).join(", ")
      })
      await this.db.query(
        `INSERT INTO loyalty_notices (id, organization_id, member_id, kind, body, campaign_id)
         VALUES ` + rows.map((row) => "(" + row + ")").join(", "),
        values
      )
    }
  }

  // The members of a business whose phones take notifications.
  async subscribedMemberIds(organizationId: string): Promise<Set<string>> {
    const wanted = await this.db.query<Row>(
      `SELECT DISTINCT member_id FROM loyalty_push_subscriptions WHERE organization_id = $1`,
      [organizationId]
    )
    return new Set(wanted.rows.map((row) => String(row.member_id)))
  }

  // A message from the business to a chosen group of its members: kept on each one's card, and
  // sent as a notification to those with notifications on. Answers with the members whose
  // phones took it. campaignId ties the kept lines to the campaign that sent them.
  async sendMessage(
    organizationId: string,
    members: Row[],
    message: string,
    campaignId: string | null = null
  ): Promise<Set<string>> {
    const reached = new Set<string>()
    if (members.length === 0) return reached
    await this.keep(members, "message", message, campaignId)
    const wanted = await this.subscribedMemberIds(organizationId)
    const program = await this.service.getProgram(organizationId)
    for (const member of members) {
      const memberId = String(member.id)
      if (!wanted.has(memberId)) continue
      if ((await this.sendTo(member, program.businessName, message)) > 0) reached.add(memberId)
    }
    return reached
  }

  // Sends one text to every phone of a member. Returns how many phones took it.
  private async sendTo(member: Row, businessName: string, text: string): Promise<number> {
    const targets = await this.db.query<Row>(
      `SELECT id, endpoint, p256dh, auth FROM loyalty_push_subscriptions WHERE member_id = $1`,
      [member.id]
    )
    if (targets.rows.length === 0) return 0
    const keys = await this.keyPair()
    const payload = JSON.stringify({
      title: businessName,
      body: text,
      url: `${this.appUrl}/lc/${String(member.token)}/`,
    })
    let delivered = 0
    for (const row of targets.rows) {
      try {
        const status = await this.sender(
          {
            endpoint: String(row.endpoint),
            keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
          },
          payload,
          keys
        )
        if (status >= 200 && status < 300) delivered += 1
        // The phone removed the card or switched notifications off.
        else if (status === 404 || status === 410) {
          await this.db.query(`DELETE FROM loyalty_push_subscriptions WHERE id = $1`, [row.id])
        } else {
          console.error("loyalty.push_refused", { memberId: String(member.id), status })
        }
      } catch (error) {
        console.error("loyalty.push_failed", { memberId: String(member.id), error })
      }
    }
    return delivered
  }

  // Something happened to one member's card.
  async notify(memberId: string, notice: LoyaltyNotice): Promise<number> {
    const found = await this.db.query<Row>(`SELECT * FROM loyalty_members WHERE id = $1`, [
      memberId,
    ])
    const member = found.rows[0]
    if (!member) return 0
    const program = await this.service.getProgram(String(member.organization_id))
    const text = noticeText(notice)
    await this.keep([member], "points", text)
    return this.sendTo(member, program.businessName, text)
  }

  // A message from the business: kept on every member's card, and sent as a notification to
  // those with notifications on. Returns how many members the notification reached.
  async broadcast(organizationId: string, message: string): Promise<number> {
    const members = await this.db.query<Row>(
      `SELECT * FROM loyalty_members WHERE organization_id = $1`,
      [organizationId]
    )
    return (await this.sendMessage(organizationId, members.rows, message)).size
  }
}

// The one instance the server runs with, reachable from tests.
let registered: LoyaltyPush | null = null
export const registerLoyaltyPush = (push: LoyaltyPush | null) => {
  registered = push
}
export const registeredLoyaltyPush = () => registered
