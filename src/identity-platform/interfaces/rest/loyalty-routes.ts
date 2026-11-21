import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import {
  loyaltyAdjustSchema,
  loyaltyCampaignPreviewSchema,
  loyaltyCampaignSchema,
  loyaltyCashierSchema,
  loyaltyMemberListSchema,
  loyaltyMemberSchema,
  loyaltyMessageSchema,
  loyaltyProgramSchema,
  loyaltyRedeemSchema,
  loyaltyRewardSchema,
  publicClaimSchema,
  publicJoinSchema,
  publicPushSchema,
  publicPushStopSchema,
} from "../../loyalty/schemas"
import type { LoyaltyCampaigns } from "../../loyalty/campaigns"
import type { LoyaltyPush } from "../../loyalty/push"
import type { LoyaltyService } from "../../loyalty/service"
import { type LoyaltyWallet, starIcon } from "../../loyalty/wallet"

type Send = (status: number, body: unknown) => void

const query = (url: URL) => Object.fromEntries(url.searchParams.entries())
const unavailable = { code: "LOYALTY_UNAVAILABLE", message: "Loyalty is unavailable." }

// Every /v1/loyalty/* route (the Loyalty app). The subscription itself is checked before this
// is reached (subscriptions/app-access.ts); here it is the person's own permission:
// loyalty:view to see, loyalty:manage to change anything.
export async function handleLoyaltyRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: LoyaltyService | null
  // Present only where a wallet certificate is set up.
  wallet: LoyaltyWallet | null
  // Notifications for cards saved to a phone's home screen.
  push: LoyaltyPush | null
  // Internal campaigns: messages to a chosen group of members, and what came of them.
  campaigns: LoyaltyCampaigns | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service } = input
  if (!url.pathname.startsWith("/v1/loyalty/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) return send(503, unavailable)
  const requireView = () => {
    if (!actor.modulePermissions.includes("loyalty:view")) throw ERRORS.forbidden()
  }
  const requireManage = () => {
    if (!actor.modulePermissions.includes("loyalty:manage")) throw ERRORS.forbidden()
  }
  const org = actor.organizationId
  const path = url.pathname.slice("/v1/loyalty".length)
  const body = () => input.readJsonBody()
  const withWallet = <T extends object>(program: T) => ({
    ...program,
    walletAvailable: input.wallet !== null,
  })

  if (path === "/program") {
    if (method === "GET") {
      requireView()
      return send(200, withWallet(await service.getProgram(org)))
    }
    if (method === "PUT") {
      requireManage()
      return send(
        200,
        withWallet(await service.updateProgram(org, loyaltyProgramSchema.parse(await body())))
      )
    }
  }

  if (method === "GET" && path === "/overview") {
    requireView()
    return send(200, {
      ...(await service.overview(org)),
      withNotifications: input.push ? await input.push.memberCount(org) : 0,
    })
  }

  // The cashier screen: the customer on the sale, their points and what they can use. Open to
  // whoever can sell, not only to those who manage the programme.
  if (method === "GET" && path === "/cashier") {
    const allowed = ["pos:view", "pos:manage", "loyalty:view"]
    if (!allowed.some((permission) => actor.modulePermissions.includes(permission))) {
      throw ERRORS.forbidden()
    }
    return send(200, await service.cashierLookup(org, loyaltyCashierSchema.parse(query(url))))
  }

  if (method === "GET" && path === "/catalog") {
    requireView()
    return send(200, { items: await service.catalog(org) })
  }

  if (path === "/rewards") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listRewards(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(201, await service.createReward(org, loyaltyRewardSchema.parse(await body())))
    }
  }
  const reward = path.match(/^\/rewards\/([0-9a-f-]{36})$/)
  if (reward) {
    requireManage()
    if (method === "PUT") {
      return send(
        200,
        await service.updateReward(org, reward[1], loyaltyRewardSchema.parse(await body()))
      )
    }
    if (method === "DELETE") {
      await service.removeReward(org, reward[1])
      return send(200, { ok: true })
    }
  }

  if (path === "/members") {
    if (method === "GET") {
      requireView()
      const { search } = loyaltyMemberListSchema.parse(query(url))
      return send(200, { items: await service.listMembers(org, search) })
    }
    if (method === "POST") {
      requireManage()
      return send(201, await service.addMember(org, loyaltyMemberSchema.parse(await body())))
    }
  }
  const member = path.match(/^\/members\/([0-9a-f-]{36})(\/(adjust|redeem))?$/)
  if (member) {
    if (method === "GET" && !member[2]) {
      requireView()
      return send(200, await service.getMember(org, member[1]))
    }
    if (method === "POST" && member[3] === "adjust") {
      requireManage()
      return send(
        200,
        await service.adjust(org, member[1], loyaltyAdjustSchema.parse(await body()), actor.userId)
      )
    }
    if (method === "POST" && member[3] === "redeem") {
      requireManage()
      const { rewardId, handOver } = loyaltyRedeemSchema.parse(await body())
      await service.redeem(org, member[1], rewardId, {
        by: actor.userId,
        source: "staff",
        handOver: handOver !== false,
      })
      return send(200, await service.getMember(org, member[1]))
    }
  }

  if (method === "GET" && path === "/redemptions/waiting") {
    requireView()
    return send(200, { items: await service.waitingRedemptions(org) })
  }
  const redemption = path.match(/^\/redemptions\/([0-9a-f-]{36})\/(use|cancel)$/)
  if (redemption && method === "POST") {
    requireManage()
    return send(
      200,
      await service.closeRedemption(
        org,
        redemption[1],
        redemption[2] === "use" ? "used" : "cancelled"
      )
    )
  }

  // Internal campaigns (loyalty/campaigns.ts).
  if (path === "/campaigns" || path.startsWith("/campaigns/")) {
    const campaigns = input.campaigns
    if (!campaigns) return send(503, unavailable)
    if (path === "/campaigns") {
      if (method === "GET") {
        requireView()
        return send(200, { items: await campaigns.list(org) })
      }
      if (method === "POST") {
        requireManage()
        return send(
          201,
          await campaigns.create(org, loyaltyCampaignSchema.parse(await body()), actor.userId)
        )
      }
    }
    if (method === "POST" && path === "/campaigns/preview") {
      requireView()
      const { audience } = loyaltyCampaignPreviewSchema.parse(await body())
      return send(200, await campaigns.preview(org, audience))
    }
    const campaign = path.match(/^\/campaigns\/([0-9a-f-]{36})(\/(send|cancel))?$/)
    if (campaign) {
      if (method === "GET" && !campaign[2]) {
        requireView()
        return send(200, await campaigns.get(org, campaign[1]))
      }
      requireManage()
      if (method === "POST" && campaign[3] === "send") {
        return send(200, await campaigns.send(org, campaign[1]))
      }
      if (method === "POST" && campaign[3] === "cancel") {
        return send(200, await campaigns.cancel(org, campaign[1]))
      }
      if (method === "DELETE" && !campaign[2]) {
        await campaigns.remove(org, campaign[1])
        return send(200, { ok: true })
      }
    }
  }

  // A message from the business: to every card kept in a phone's wallet, and to every member
  // who switched notifications on for a card saved to their home screen.
  if (method === "POST" && path === "/wallet/message") {
    requireManage()
    if (!input.wallet && !input.push) {
      return send(422, {
        code: "LOYALTY_WALLET_UNAVAILABLE",
        message: "Messages are not set up.",
      })
    }
    const { message } = loyaltyMessageSchema.parse(await body())
    const inWallets = input.wallet ? await service.broadcast(org, message) : 0
    const notified = input.push ? await input.push.broadcast(org, message) : 0
    return send(200, { sent: inWallets + notified })
  }

  return false
}

// The public side: the join page, a member's own card, and the routes a phone's wallet calls.
// No session -- a card is opened by the secret in its link.
export async function handlePublicLoyaltyRoute(input: {
  method: string
  url: URL
  service: LoyaltyService | null
  wallet: LoyaltyWallet | null
  push: LoyaltyPush | null
  // The request's Authorization header, for the wallet routes.
  authorization: string | null
  send: Send
  sendRaw: (status: number, body: string | Buffer, headers: Record<string, string>) => void
  readJsonBody: () => Promise<unknown>
  limit: (bucket: string, max: number, windowMs: number) => Promise<boolean>
}): Promise<boolean> {
  const { method, url, service, wallet } = input
  if (!url.pathname.startsWith("/v1/public/loyalty/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) return send(503, unavailable)
  const limited = () =>
    send(429, { code: "LOYALTY_RATE_LIMITED", message: "Too many requests. Try again shortly." })
  if (!(await input.limit("loyalty_public", 240, 60_000))) return limited()
  const path = url.pathname.slice("/v1/public/loyalty".length)

  // ---- What Apple Wallet asks for (its own fixed addresses under the service URL) ----
  if (path.startsWith("/wallet/")) {
    const empty = (status: number) => {
      input.sendRaw(status, "", {})
      return true
    }
    if (!wallet) return empty(404)
    const walletPath = path.slice("/wallet".length)
    const token = input.authorization?.startsWith("ApplePass ")
      ? input.authorization.slice("ApplePass ".length).trim()
      : ""
    if (method === "POST" && walletPath === "/v1/log") return empty(200)

    const registration = walletPath.match(
      /^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)$/
    )
    if (registration) {
      const [, deviceId, passTypeId, serial] = registration.map(decodeURIComponent)
      if (!wallet.matches(passTypeId)) return empty(404)
      if (method === "POST") {
        const parsed = (await input.readJsonBody()) as { pushToken?: unknown } | null
        const pushToken = typeof parsed?.pushToken === "string" ? parsed.pushToken : ""
        if (!pushToken) return empty(400)
        const outcome = await wallet.register(deviceId, serial, token, pushToken)
        return empty(outcome === "refused" ? 401 : outcome === "created" ? 201 : 200)
      }
      if (method === "DELETE") {
        return empty((await wallet.unregister(deviceId, serial, token)) ? 200 : 401)
      }
    }

    const listing = walletPath.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)$/)
    if (listing && method === "GET") {
      const [, deviceId, passTypeId] = listing.map(decodeURIComponent)
      if (!wallet.matches(passTypeId)) return empty(404)
      const changed = await wallet.changedSince(
        deviceId,
        url.searchParams.get("passesUpdatedSince")
      )
      if (!changed) return empty(204)
      return send(200, changed)
    }

    const latest = walletPath.match(/^\/v1\/passes\/([^/]+)\/([^/]+)$/)
    if (latest && method === "GET") {
      const [, passTypeId, serial] = latest.map(decodeURIComponent)
      if (!wallet.matches(passTypeId)) return empty(404)
      const made = await wallet.passForSerial(serial, token)
      if (!made) return empty(401)
      input.sendRaw(200, made.pass, {
        "content-type": "application/vnd.apple.pkpass",
        "last-modified": made.updatedAt.toUTCString(),
      })
      return true
    }
    return empty(404)
  }

  const join = path.match(/^\/join\/([^/]+)$/)
  if (join) {
    const code = decodeURIComponent(join[1])
    if (method === "GET") return send(200, await service.publicJoinPage(code))
    if (method === "POST") {
      // Typing phone after phone to find who is a member is slowed.
      if (!(await input.limit("loyalty_join", 10, 10 * 60_000))) return limited()
      return send(
        200,
        await service.publicJoin(code, publicJoinSchema.parse(await input.readJsonBody()))
      )
    }
  }

  const card = path.match(/^\/cards\/([^/]+)(\/(redeem|review|pass|push|seen|icon\.png))?$/)
  if (card) {
    const token = decodeURIComponent(card[1])
    // Notifications on a card saved to the home screen: the key the phone needs, then the
    // address its push service gave it.
    if (card[3] === "push") {
      const push = input.push
      if (!push) return send(404, { code: "LOYALTY_PUSH_UNAVAILABLE", message: "Not available." })
      if (method === "GET") {
        await service.memberByToken(token)
        return send(200, { publicKey: await push.publicKey() })
      }
      if (!(await input.limit("loyalty_push", 20, 10 * 60_000))) return limited()
      if (method === "POST") {
        await push.subscribe(token, publicPushSchema.parse(await input.readJsonBody()))
        return send(200, { ok: true })
      }
      if (method === "DELETE") {
        const { endpoint } = publicPushStopSchema.parse(await input.readJsonBody())
        await push.unsubscribe(token, endpoint)
        return send(200, { ok: true })
      }
    }
    if (method === "GET" && !card[2]) {
      return send(200, { ...(await service.publicCard(token)), walletAvailable: wallet !== null })
    }
    if (method === "POST" && card[3] === "redeem") {
      const { rewardId } = publicClaimSchema.parse(await input.readJsonBody())
      return send(200, {
        ...(await service.publicRedeem(token, rewardId)),
        walletAvailable: wallet !== null,
      })
    }
    if (method === "POST" && card[3] === "seen") {
      await service.publicNoticesSeen(token)
      return send(200, { ok: true })
    }
    if (method === "POST" && card[3] === "review") {
      return send(200, {
        ...(await service.publicReviewDone(token)),
        walletAvailable: wallet !== null,
      })
    }
    // The picture a phone uses when the card page is saved to its home screen.
    if (method === "GET" && card[3] === "icon.png") {
      const look = await service.publicCard(token)
      // 180 for an iPhone's home screen; the larger two are what Android asks for.
      const asked = Number(url.searchParams.get("size"))
      const size = [192, 512].includes(asked) ? asked : 180
      input.sendRaw(200, starIcon(size, look.cardColor, look.textColor), {
        "content-type": "image/png",
        "cache-control": "public, max-age=3600",
      })
      return true
    }
    if (method === "GET" && card[3] === "pass") {
      if (!wallet) {
        return send(404, { code: "LOYALTY_WALLET_UNAVAILABLE", message: "Not available." })
      }
      const made = await wallet.passForToken(token)
      input.sendRaw(200, made.pass, {
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": 'attachment; filename="loyalty.pkpass"',
        "last-modified": made.updatedAt.toUTCString(),
      })
      return true
    }
  }

  return false
}
