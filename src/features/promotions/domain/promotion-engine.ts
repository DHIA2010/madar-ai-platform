import type { Promotion, PromotionStatus } from "../types/promotion.types"

// Decides which promotion a cart line gets and how much it takes off. Runs in the cashier, on the
// device, so promotions keep working while the POS is offline; the server records what was
// applied. The best promotion for the customer wins per line -- promotions don't stack with each
// other (they do stack with the cashier's own line discount, see CashierPage).

export interface PromotionLine {
  productId: string | null
  category: string | null
  // The shown price per unit (VAT-inclusive when priceIncludesTax).
  unitPrice: number
  quantity: number
  priceIncludesTax: boolean
  // This line's effective VAT rate, e.g. 0.15.
  taxRate: number
}

export interface AppliedPromotion {
  promotion: Promotion
  // Off each unit, in the shown price.
  unitDiscount: number
  // Off the whole line, net of VAT -- what the invoice's promotionDiscountAmount carries.
  netDiscount: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function withinHours(promotion: Promotion, now: Date): boolean {
  if (!promotion.startTime || !promotion.endTime) return true
  const minute = now.getHours() * 60 + now.getMinutes()
  const start = toMinutes(promotion.startTime)
  const end = toMinutes(promotion.endTime)
  if (start === end) return true
  // An end before the start runs past midnight (e.g. 22:00-02:00).
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

export function promotionStatus(promotion: Promotion, now: Date): PromotionStatus {
  if (promotion.isPaused) return "paused"
  if (promotion.endsAt && new Date(promotion.endsAt) <= now) return "expired"
  if (promotion.startsAt && new Date(promotion.startsAt) > now) return "scheduled"
  if (promotion.daysOfWeek.length > 0 && !promotion.daysOfWeek.includes(now.getDay())) {
    return "outsideHours"
  }
  if (!withinHours(promotion, now)) return "outsideHours"
  return "active"
}

export function promotionAppliesToBranch(promotion: Promotion, workspaceId: string | null) {
  return (
    promotion.workspaceIds.length === 0 ||
    (workspaceId !== null && promotion.workspaceIds.includes(workspaceId))
  )
}

export function promotionMatchesProduct(
  promotion: Promotion,
  productId: string | null,
  category: string | null
): boolean {
  if (productId && promotion.excludedProductIds.includes(productId)) return false
  if (promotion.scope === "all") return true
  if (promotion.scope === "products") return !!productId && promotion.productIds.includes(productId)
  return !!category && promotion.categories.includes(category)
}

// Off one unit, in the shown price: a percentage (capped by maxDiscountPerUnit) or a fixed amount,
// never more than the price itself.
export function promotionUnitDiscount(promotion: Promotion, unitPrice: number): number {
  if (unitPrice <= 0) return 0
  const raw =
    promotion.discountType === "percent"
      ? unitPrice * (Math.min(100, promotion.discountValue) / 100)
      : promotion.discountValue
  const capped =
    promotion.discountType === "percent" && promotion.maxDiscountPerUnit !== null
      ? Math.min(raw, promotion.maxDiscountPerUnit)
      : raw
  return Math.min(Math.max(0, capped), unitPrice)
}

export function bestPromotionFor(
  promotions: Promotion[],
  line: PromotionLine,
  now: Date,
  workspaceId: string | null
): AppliedPromotion | null {
  let best: AppliedPromotion | null = null
  for (const promotion of promotions) {
    if (promotionStatus(promotion, now) !== "active") continue
    if (!promotionAppliesToBranch(promotion, workspaceId)) continue
    if (!promotionMatchesProduct(promotion, line.productId, line.category)) continue
    const unitDiscount = promotionUnitDiscount(promotion, line.unitPrice)
    if (unitDiscount <= 0 || (best && unitDiscount <= best.unitDiscount)) continue
    const grossDiscount = unitDiscount * line.quantity
    best = {
      promotion,
      unitDiscount,
      netDiscount: round2(
        line.priceIncludesTax ? grossDiscount / (1 + line.taxRate) : grossDiscount
      ),
    }
  }
  return best
}
