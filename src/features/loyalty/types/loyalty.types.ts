// What the Loyalty app's screens read and send (the server side: identity-platform/loyalty).

export interface LoyaltyLocation {
  name: string
  latitude: number
  longitude: number
}

export interface LoyaltyProgram {
  isActive: boolean
  joinCode: string
  displayName: string | null
  businessName: string
  pointsPerSar: number
  pointValue: number
  reviewBonusEnabled: boolean
  reviewBonusPoints: number
  googleReviewUrl: string | null
  onlineBonusEnabled: boolean
  onlineBonusPoints: number
  cardColor: string
  textColor: string
  cardTitle: string | null
  cardNote: string | null
  terms: string | null
  walletNotifyPoints: boolean
  nearbyEnabled: boolean
  nearbyMessage: string | null
  locations: LoyaltyLocation[]
  // Whether Madar can issue Apple Wallet cards at all (a certificate on the server).
  walletAvailable: boolean
}

export type LoyaltyProgramPatch = Partial<Omit<LoyaltyProgram, "joinCode" | "businessName">>

export type RewardKind = "amount" | "percent" | "free"

export interface RewardItem {
  kind: "service" | "product"
  id: string
  name: string
}

export interface LoyaltyReward {
  id: string
  name: string
  pointsCost: number
  kind: RewardKind
  value: number
  items: RewardItem[]
  isActive: boolean
}
export type LoyaltyRewardInput = Omit<LoyaltyReward, "id">

export interface LoyaltyMember {
  id: string
  customerId: string | null
  name: string
  phone: string | null
  cardCode: string
  token: string
  points: number
  lifetimePoints: number
  source: string
  inWallet: boolean
  createdAt: string
}

export interface LoyaltyLedgerLine {
  id: string
  points: number
  kind: string
  source: string
  note: string | null
  createdAt: string
}

export interface LoyaltyRedemption {
  id: string
  memberId: string
  rewardName: string
  pointsCost: number
  kind: RewardKind
  value: number
  items: RewardItem[]
  code: string
  status: "active" | "used" | "cancelled"
  createdAt: string
  closedAt: string | null
}

export interface LoyaltyWaitingRedemption extends LoyaltyRedemption {
  memberName: string
  memberPhone: string | null
}

export interface LoyaltyMemberDetails {
  member: LoyaltyMember
  ledger: LoyaltyLedgerLine[]
  redemptions: LoyaltyRedemption[]
}

export interface LoyaltyOverview {
  isActive: boolean
  members: number
  newMembers: number
  inWallet: number
  // Members who switched notifications on for a card saved to their home screen.
  withNotifications: number
  outstandingPoints: number
  outstandingValue: number
  earned: number
  redeemed: number
  earnedFromBooking: number
  earnedFromCashier: number
  bonusPoints: number
  waitingRewards: number
  top: Array<{ id: string; name: string; points: number }>
  recent: Array<LoyaltyLedgerLine & { memberId: string; memberName: string }>
}

export interface PublicReward {
  id: string
  name: string
  pointsCost: number
  kind: RewardKind
  value: number
  items: string[]
}

export interface PublicLoyaltyProgram {
  businessName: string
  cardColor: string
  textColor: string
  cardTitle: string | null
  cardNote: string | null
  terms: string | null
  pointsPerSar: number
  rewards: PublicReward[]
}

export interface PublicLoyaltyCard extends PublicLoyaltyProgram {
  isActive: boolean
  name: string
  cardCode: string
  points: number
  pointsValue: number
  waitingReward: { name: string; code: string } | null
  review: { url: string; points: number; done: boolean } | null
  onlineBonus: number | null
  // What the member was told (new points, the business's messages), newest first.
  notices?: Array<{
    id: string
    kind: "points" | "message"
    text: string
    createdAt: string
    read: boolean
  }>
  activity: Array<{ points: number; kind: string; createdAt: string }>
  walletAvailable: boolean
}

// What the cashier screen shows for the customer on a sale.
export interface CashierLoyalty {
  isActive: boolean
  pointsPerSar: number
  pointValue: number
  member: {
    id: string
    customerId: string | null
    name: string
    phone: string | null
    points: number
  } | null
  rewards: LoyaltyReward[]
  // A reward the customer already took for points and has not been handed yet.
  waiting: LoyaltyRedemption | null
}

// ---- Internal campaigns ----

export type CampaignAudienceKind =
  | "all"
  | "inactive"
  | "recent"
  | "new"
  | "never"
  | "points"
  | "members"

// Who a campaign goes to: one plain rule, worked out when it is sent.
export interface CampaignAudience {
  kind: CampaignAudienceKind
  days?: number | null
  minPoints?: number | null
  memberIds?: string[]
}

export interface CampaignResults {
  recipients: number
  // Had the notification delivered to a phone.
  delivered: number
  // Opened their card and saw it.
  seen: number
  // Bought within the counted days, how many times, and what they paid.
  buyers: number
  purchases: number
  revenue: number
  // Still inside the counted days.
  tracking: boolean
}

export interface LoyaltyCampaign {
  id: string
  name: string
  message: string
  channel: "card"
  audience: CampaignAudience
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled"
  scheduledAt: string | null
  sentAt: string | null
  trackDays: number
  createdAt: string
  results: CampaignResults
}

export interface CampaignDetails extends LoyaltyCampaign {
  recipientList: Array<{
    memberId: string
    name: string
    phone: string | null
    delivered: boolean
    seen: boolean
    purchases: number
    spent: number
  }>
}

export interface CampaignInput {
  name: string
  message: string
  audience: CampaignAudience
  // now: sent at once. later: at scheduledAt. draft: only saved.
  when: "now" | "later" | "draft"
  scheduledAt: string | null
  trackDays: number
}
