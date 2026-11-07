// A promotion of the Promotions app -- mirrors the backend's promotions/service.ts PromotionView.

export type PromotionDiscountType = "percent" | "fixed"
export type PromotionScope = "all" | "products" | "categories"

export interface PromotionInput {
  name: string
  discountType: PromotionDiscountType
  discountValue: number
  // Caps a percentage discount per unit (with or without VAT, per amountIncludesTax).
  maxDiscountPerUnit: number | null
  // Whether a fixed amount and the cap above include VAT (default) or not.
  amountIncludesTax: boolean
  scope: PromotionScope
  productIds: string[]
  categories: string[]
  excludedProductIds: string[]
  // Empty = every branch.
  workspaceIds: string[]
  startsAt: string | null
  endsAt: string | null
  // 0 = Sunday ... 6 = Saturday; empty = every day.
  daysOfWeek: number[]
  // "HH:MM", local time; an end before the start runs past midnight. Both null = all day.
  startTime: string | null
  endTime: string | null
  licenceNumber: string | null
  isPaused: boolean
}

export interface Promotion extends PromotionInput {
  id: string
  createdAt: string
  updatedAt: string
  stats: { invoiceCount: number; unitCount: number; discountTotal: number }
}

export type PromotionStatus = "active" | "scheduled" | "outsideHours" | "expired" | "paused"
