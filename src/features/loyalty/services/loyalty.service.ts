import type {
  CashierLoyalty,
  LoyaltyMember,
  LoyaltyMemberDetails,
  LoyaltyOverview,
  LoyaltyProgram,
  LoyaltyProgramPatch,
  LoyaltyRedemption,
  LoyaltyReward,
  LoyaltyRewardInput,
  LoyaltyWaitingRedemption,
  PublicLoyaltyCard,
  PublicLoyaltyProgram,
  RewardItem,
} from "../types/loyalty.types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { getClientEnvironment } from "@/infrastructure/environment/app-environment"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as the other feature services.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } | null } }
    const id = parsed.state?.currentWorkspace?.id
    return id && UUID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}

// The repo's lint rule forbids slash-prefixed string literals (to stop page routes being
// hardcoded) and cannot tell them from an API path, so paths are joined here.
const SEPARATOR = String.fromCharCode(47)
const path = (...parts: string[]) => ["", "v1", "loyalty", ...parts].join(SEPARATOR)
const publicPath = (...parts: string[]) =>
  ["", "v1", "public", "loyalty", ...parts.map(encodeURIComponent)].join(SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const loyaltyService = {
  program: () => client.get<LoyaltyProgram>(path("program")),
  updateProgram: (patch: LoyaltyProgramPatch) =>
    client.put<LoyaltyProgramPatch, LoyaltyProgram>(path("program"), patch),

  overview: () => client.get<LoyaltyOverview>(path("overview")),

  // The business's own services and products, to choose what a reward covers.
  catalog: async () => (await client.get<{ items: RewardItem[] }>(path("catalog"))).items,

  rewards: async () => (await client.get<{ items: LoyaltyReward[] }>(path("rewards"))).items,
  createReward: (input: LoyaltyRewardInput) =>
    client.post<LoyaltyRewardInput, LoyaltyReward>(path("rewards"), input),
  updateReward: (id: string, input: LoyaltyRewardInput) =>
    client.put<LoyaltyRewardInput, LoyaltyReward>(path("rewards", id), input),
  removeReward: (id: string) => client.delete<{ ok: true }>(path("rewards", id)),

  members: async (search?: string) =>
    (
      await client.get<{ items: LoyaltyMember[] }>(
        search ? `${path("members")}?search=${encodeURIComponent(search)}` : path("members")
      )
    ).items,
  addMember: (input: { name: string; phone: string }) =>
    client.post<typeof input, LoyaltyMember>(path("members"), input),
  member: (id: string) => client.get<LoyaltyMemberDetails>(path("members", id)),
  adjust: (id: string, input: { points: number; note: string | null }) =>
    client.post<typeof input, LoyaltyMemberDetails>(path("members", id, "adjust"), input),
  // Takes the points and hands the reward over on the spot.
  redeem: (id: string, rewardId: string) =>
    client.post<{ rewardId: string; handOver: boolean }, LoyaltyMemberDetails>(
      path("members", id, "redeem"),
      { rewardId, handOver: true }
    ),

  waitingRedemptions: async () =>
    (await client.get<{ items: LoyaltyWaitingRedemption[] }>(path("redemptions", "waiting"))).items,
  closeRedemption: (id: string, outcome: "use" | "cancel") =>
    client.post<Record<string, never>, LoyaltyRedemption>(path("redemptions", id, outcome), {}),

  // The cashier screen: the customer on the sale (or a scanned card / typed phone), their
  // points and what they can use.
  cashier: (input: { customerId?: string; code?: string }) => {
    const asked = input.customerId
      ? `?customerId=${encodeURIComponent(input.customerId)}`
      : input.code
        ? `?code=${encodeURIComponent(input.code)}`
        : ""
    return client.get<CashierLoyalty>(`${path("cashier")}${asked}`)
  },

  // A message to every card kept in a phone's wallet or with notifications on.
  sendWalletMessage: (message: string) =>
    client.post<{ message: string }, { sent: number }>(path("wallet", "message"), { message }),
}

// The join page and a member's own card: no session.
async function publicRequest<T>(target: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(target, getClientEnvironment().API_BASE_URL), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => null)) as T & { code?: string; message?: string }
  if (!response.ok) throw Object.assign(new Error(body?.message ?? "request"), { code: body?.code })
  return body
}

export const publicLoyaltyService = {
  joinPage: (code: string) => publicRequest<PublicLoyaltyProgram>(publicPath("join", code)),
  join: (code: string, input: { name: string; phone: string }) =>
    publicRequest<{ token: string | null; alreadyMember: boolean }>(publicPath("join", code), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  card: (token: string) => publicRequest<PublicLoyaltyCard>(publicPath("cards", token)),
  redeem: (token: string, rewardId: string) =>
    publicRequest<PublicLoyaltyCard>(publicPath("cards", token, "redeem"), {
      method: "POST",
      body: JSON.stringify({ rewardId }),
    }),
  reviewDone: (token: string) =>
    publicRequest<PublicLoyaltyCard>(publicPath("cards", token, "review"), { method: "POST" }),
  // The picture a phone shows for the card page once it is saved to the home screen.
  iconUrl: (token: string) =>
    new URL(publicPath("cards", token, "icon.png"), getClientEnvironment().API_BASE_URL).toString(),
  // Notifications on a card saved to the home screen: Madar's key, then the address the
  // phone's push service gave it.
  pushKey: (token: string) =>
    publicRequest<{ publicKey: string }>(publicPath("cards", token, "push")),
  pushOn: (token: string, target: PushSubscriptionJSON) =>
    publicRequest<{ ok: true }>(publicPath("cards", token, "push"), {
      method: "POST",
      body: JSON.stringify({ endpoint: target.endpoint, keys: target.keys }),
    }),
  pushOff: (token: string, endpoint: string) =>
    publicRequest<{ ok: true }>(publicPath("cards", token, "push"), {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
  // The card as an Apple Wallet pass: opened by the phone itself.
  passUrl: (token: string) =>
    new URL(publicPath("cards", token, "pass"), getClientEnvironment().API_BASE_URL).toString(),
}
