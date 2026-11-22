// Mirrors identity-platform/booking/service.ts.

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show"
export const BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]
export const TIME_OFF_KINDS = ["vacation", "sick", "break", "holiday", "other"] as const
export type TimeOffKind = (typeof TIME_OFF_KINDS)[number]

export interface BookingSettings {
  slug: string | null
  onlineEnabled: boolean
  // How the public page looks.
  coverUrl: string | null
  logoUrl: string | null
  tagline: string | null
  accentColor: string | null
  instagramUrl: string | null
  mapUrl: string | null
  gallery: string[]
  displayName: string | null
  description: string | null
  phone: string | null
  address: string | null
  slotIntervalMinutes: number
  leadTimeMinutes: number
  advanceDays: number
  autoConfirm: boolean
  cancellationAllowed: boolean
  cancellationDeadlineMinutes: number
  reviewsEnabled: boolean
  whatsappConfirmation: boolean
  whatsappReminder: boolean
  reminderHoursBefore: number
  invoiceOnCompletion: boolean
  calendarToken: string | null
  paymentMode: "off" | "deposit" | "full"
  depositPercent: number
  moyasarPublishableKey: string | null
  moyasarSecretSet: boolean
}

// The same service in several sizes, and extras taken with it.
export interface ServiceOption {
  id?: string | null
  name: string
  durationMinutes: number
  price: number
}
export interface ServiceAddon {
  id?: string | null
  name: string
  price: number
  extraMinutes: number
}

// A product from the products list that can become a booking service.
export interface LinkableProduct {
  id: string
  name: string
  isService: boolean
  category: string | null
  price: number
  durationMinutes: number
  imageUrl: string | null
}

export interface BookingServiceItem {
  id: string
  // The cashier product this service is the same thing as, when it was brought in from the
  // products list: their names and prices follow each other.
  productId?: string | null
  name: string
  description: string | null
  category: string | null
  durationMinutes: number
  price: number
  bufferMinutes: number
  capacity: number
  color: string | null
  imageUrl: string | null
  visibility: "published" | "internal"
  isActive: boolean
  options: ServiceOption[]
  addons: ServiceAddon[]
  bundleServiceIds: string[]
  resourceIds: string[]
}

export interface BookingResource {
  id: string
  name: string
  kind: "room" | "equipment"
  quantity: number
  isActive: boolean
}
export type BookingResourceInput = Omit<BookingResource, "id">

export interface WaitlistEntry {
  id: string
  serviceId: string
  serviceName: string
  providerId: string | null
  providerName: string | null
  customerName: string
  customerPhone: string | null
  preferredDate: string
  note: string | null
  source: "staff" | "online"
  createdAt: string
  // The first time that has opened on the day they asked for, if any.
  openTime: string | null
}

export interface BookingSeriesResult {
  seriesId: string
  created: Booking[]
  skipped: Array<{ startsAt: string; code: string }>
}
export type BookingServiceInput = Omit<BookingServiceItem, "id">

export interface WorkingPeriod {
  weekday: number
  startMinute: number
  endMinute: number
}

export interface BookingProvider {
  id: string
  workspaceId: string | null
  userId: string | null
  name: string
  title: string | null
  phone: string | null
  color: string | null
  imageUrl: string | null
  isActive: boolean
  commissionRate: number
  serviceIds: string[]
  hours: WorkingPeriod[]
}
export type BookingProviderInput = Pick<
  BookingProvider,
  | "name"
  | "title"
  | "phone"
  | "color"
  | "imageUrl"
  | "isActive"
  | "commissionRate"
  | "serviceIds"
  | "hours"
>

export interface BookingTimeOff {
  id: string
  providerId: string | null
  startsAt: string
  endsAt: string
  kind: TimeOffKind
  note: string | null
}

export interface Booking {
  id: string
  number: number
  serviceId: string
  serviceName: string
  serviceColor: string | null
  providerId: string
  providerName: string
  // The customer left the choice of provider open online; the system picked this one.
  providerUnchosen: boolean
  customerId: string | null
  customerName: string
  customerPhone: string | null
  partySize: number
  startsAt: string
  endsAt: string
  price: number
  status: BookingStatus
  paymentStatus: "unpaid" | "paid"
  paymentMethod: string | null
  source: "staff" | "online"
  notes: string | null
  customerNotes: string | null
  cancelReason: string | null
  cancelledBy: string | null
  publicToken: string
  createdAt: string
  optionName: string | null
  addons: Array<{ id: string; name: string; price: number }>
  subtotal: number
  discount: number
  couponCode: string | null
  giftAmount: number
  loyaltyPoints: number
  loyaltyDiscount: number
  loyaltyEarned: number
  customerPlanId: string | null
  commissionAmount: number
  invoiceId: string | null
  invoiceNumber: string | null
  confirmationSentAt: string | null
  reminderSentAt: string | null
  seriesId: string | null
  paymentDue: number
  paidOnline: number
  refundedOnline: number
  paymentExpiresAt: string | null
}

// What a price depends on beyond the service.
export interface BookingPricingInput {
  optionId?: string | null
  addonIds?: string[]
  couponCode?: string | null
  giftCode?: string | null
  customerPlanId?: string | null
  redeemPoints?: number | null
}

export interface BookingCreateInput extends BookingPricingInput {
  serviceId: string
  providerId: string | null
  startsAt: string
  customerName: string
  customerPhone: string | null
  partySize: number
  notes: string | null
  force: boolean
  // Every so many weeks, this many visits in all.
  repeat?: { everyWeeks: number; count: number } | null
}

export interface BookingQuote {
  optionId: string | null
  optionName: string | null
  addons: Array<{ id: string; name: string; price: number }>
  durationMinutes: number
  subtotal: number
  discount: number
  coupon: { id: string; code: string } | null
  loyaltyPoints: number
  loyaltyDiscount: number
  gift: { id: string; code: string } | null
  giftAmount: number
  customerPlanId: string | null
  total: number
}

export interface BookingCoupon {
  id: string
  code: string
  kind: "percent" | "fixed"
  value: number
  maxDiscount: number | null
  minAmount: number
  startsOn: string | null
  endsOn: string | null
  usageLimit: number | null
  perCustomerLimit: number | null
  usedCount: number
  serviceIds: string[]
  isActive: boolean
}
export type BookingCouponInput = Omit<BookingCoupon, "id" | "usedCount">

export interface BookingGiftCard {
  id: string
  code: string
  initialAmount: number
  balance: number
  purchaserName: string | null
  recipientName: string | null
  recipientPhone: string | null
  message: string | null
  expiresOn: string | null
  isActive: boolean
  createdAt: string
  shareToken: string
}

// How sending a gift card on WhatsApp by itself went.
export type GiftWhatsApp = "sent" | "no_phone" | "limit" | "failed"

// A gift card as the person it is for sees it, on the page behind their link.
export interface PublicGift {
  business: {
    name: string
    logoUrl: string | null
    accentColor: string | null
    slug: string | null
  }
  recipientName: string | null
  purchaserName: string | null
  message: string | null
  amount: number
  balance: number
  code: string | null
  expiresOn: string | null
  state: "ready" | "used" | "expired" | "stopped"
}

export interface BookingPlan {
  id: string
  kind: "package" | "membership"
  name: string
  description: string | null
  price: number
  uses: number | null
  validityDays: number
  serviceIds: string[]
  isActive: boolean
}
export type BookingPlanInput = Omit<BookingPlan, "id">

export interface BookingCustomerPlan {
  id: string
  planId: string
  planName: string
  kind: "package" | "membership"
  customerId: string | null
  customerName: string
  customerPhone: string | null
  usesTotal: number | null
  usesLeft: number | null
  startsOn: string
  expiresOn: string
  status: "active" | "cancelled"
  pricePaid: number
  serviceIds: string[]
  usable: boolean
  createdAt: string
}

export interface BookingCustomerLookup {
  customerId: string | null
  name: string | null
  points: number
  plans: BookingCustomerPlan[]
}

export interface BookingReview {
  id: string
  bookingId: string
  providerId: string | null
  providerName: string | null
  serviceName: string | null
  customerName: string
  rating: number
  comment: string | null
  isPublished: boolean
  createdAt: string
}

export interface Slot {
  startsAt: string
  time: string
  providerIds: string[]
  remaining: number
}

export interface BookingOverview {
  range: { from: string; to: string }
  totals: {
    bookings: number
    pending: number
    confirmed: number
    completed: number
    cancelled: number
    noShow: number
    online: number
    revenue: number
    expected: number
    collected: number
    discounts: number
    commissions: number
  }
  services: Array<{ name: string; bookings: number; value: number }>
  providers: Array<{
    name: string
    bookings: number
    bookedMinutes: number
    value: number
    commission: number
  }>
  hours: number[]
  today: Booking[]
}

// The public booking page.
export interface PublicBookingPage {
  name: string
  logoUrl: string | null
  coverUrl: string | null
  tagline: string | null
  accentColor: string | null
  instagramUrl: string | null
  mapUrl: string | null
  gallery: string[]
  description: string | null
  phone: string | null
  address: string | null
  advanceDays: number
  cancellationAllowed: boolean
  cancellationDeadlineMinutes: number
  autoConfirm: boolean
  services: Array<{
    id: string
    name: string
    description: string | null
    category: string | null
    imageUrl: string | null
    durationMinutes: number
    price: number
    capacity: number
    options: Array<Required<ServiceOption> & { id: string }>
    addons: Array<Required<ServiceAddon> & { id: string }>
    providerIds: string[]
  }>
  providers: Array<{ id: string; name: string; title: string | null; imageUrl: string | null }>
  reviews: {
    average: number | null
    count: number
    latest: Array<{
      customerName: string
      rating: number
      comment: string | null
      serviceName: string | null
      createdAt: string
    }>
  } | null
}

export interface PublicBooking {
  number: number
  status: BookingStatus
  serviceName: string
  // Empty when the customer chose "anyone available": decided on arrival.
  providerName: string | null
  customerName: string
  partySize: number
  startsAt: string
  endsAt: string
  price: number
  optionName: string | null
  addons: string[]
  subtotal: number
  reduction: number
  canReview: boolean
  review: { rating: number; comment: string | null } | null
  // Still to be paid online for the booking to stand, with what Moyasar's form needs.
  payment: {
    amount: number
    publishableKey: string
    bookingId: string
    expiresAt: string | null
    full: boolean
  } | null
  paidOnline: number
  refundedOnline: number
  business: {
    name: string
    logoUrl: string | null
    phone: string | null
    address: string | null
    slug: string | null
    accentColor: string | null
  }
  canCancel: boolean
  cancelDeadline: string
}

// A customer's own account on a business's page.
export type AccountNoticeKind =
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "waitlist_booked"
  | "waitlist_removed"

export interface PublicAccountBooking {
  token: string
  number: number
  status: BookingStatus
  serviceName: string
  providerName: string | null
  startsAt: string
  endsAt: string
  price: number
  needsPayment: boolean
  canCancel: boolean
  canReview: boolean
}

export interface PublicAccount {
  name: string
  phone: string | null
  // The number was proved with a code: the account shows every booking made for it.
  verified: boolean
  upcoming: PublicAccountBooking[]
  past: PublicAccountBooking[]
  waitlist: Array<{
    id: string
    serviceName: string
    preferredDate: string
    status: "waiting" | "booked" | "removed"
    createdAt: string
  }>
  notices: Array<{
    id: string
    kind: AccountNoticeKind
    params: { serviceName?: string; startsAt?: string | null; date?: string | null }
    read: boolean
    createdAt: string
  }>
  unread: number
}
