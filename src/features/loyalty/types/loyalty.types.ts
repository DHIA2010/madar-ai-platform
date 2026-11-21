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
