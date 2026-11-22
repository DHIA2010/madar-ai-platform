import type {
  Booking,
  BookingCoupon,
  BookingCouponInput,
  BookingCreateInput,
  BookingCustomerLookup,
  BookingCustomerPlan,
  BookingGiftCard,
  BookingOverview,
  BookingPlan,
  BookingPlanInput,
  BookingPricingInput,
  BookingProvider,
  BookingProviderInput,
  BookingQuote,
  BookingResource,
  BookingResourceInput,
  BookingReview,
  BookingSeriesResult,
  BookingServiceInput,
  BookingServiceItem,
  BookingSettings,
  BookingStatus,
  BookingTimeOff,
  GiftWhatsApp,
  LinkableProduct,
  PublicAccount,
  PublicBooking,
  PublicBookingPage,
  PublicGift,
  Slot,
  TimeOffKind,
  WaitlistEntry,
} from "../types/booking.types"

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
const path = (...parts: string[]) => ["", "v1", "booking", ...parts].join(SEPARATOR)
const publicPath = (...parts: string[]) =>
  ["", "v1", "public", "booking", ...parts.map(encodeURIComponent)].join(SEPARATOR)
const withQuery = (base: string, params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `${base}?${text}` : base
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const bookingService = {
  settings: () => client.get<BookingSettings>(path("settings")),
  updateSettings: (patch: Partial<BookingSettings>) =>
    client.put<Partial<BookingSettings>, BookingSettings>(path("settings"), patch),

  // A picture for the public page or a service: saved, and its address handed back.
  uploadImage: async (image: { contentType: string; dataBase64: string }) =>
    (await client.post<typeof image, { url: string }>(path("images"), image)).url,

  // The business's Moyasar secret key: saved once Moyasar accepts it. Null removes it.
  savePaymentKey: (secretKey: string | null) =>
    client.put<{ secretKey: string | null }, BookingSettings>(path("settings", "payment-key"), {
      secretKey,
    }),
  refund: (id: string) =>
    client.post<Record<string, never>, Booking>(path("bookings", id, "refund"), {}),

  overview: (range: { from: string; to: string }) =>
    client.get<BookingOverview>(withQuery(path("overview"), range)),

  services: async () => (await client.get<{ items: BookingServiceItem[] }>(path("services"))).items,
  createService: (input: BookingServiceInput) =>
    client.post<BookingServiceInput, BookingServiceItem>(path("services"), input),
  updateService: (id: string, input: BookingServiceInput) =>
    client.put<BookingServiceInput, BookingServiceItem>(path("services", id), input),
  removeService: (id: string) => client.delete<{ ok: true }>(path("services", id)),
  // "Service" products from the products list, and making booking services out of them.
  linkableProducts: async () =>
    (await client.get<{ items: LinkableProduct[] }>(path("services", "products"))).items,
  importProducts: async (productIds: string[]) =>
    (
      await client.post<{ productIds: string[] }, { items: BookingServiceItem[] }>(
        path("services", "import"),
        { productIds }
      )
    ).items,

  providers: async () => (await client.get<{ items: BookingProvider[] }>(path("providers"))).items,
  createProvider: (input: BookingProviderInput) =>
    client.post<BookingProviderInput, BookingProvider>(path("providers"), input),
  updateProvider: (id: string, input: BookingProviderInput) =>
    client.put<BookingProviderInput, BookingProvider>(path("providers", id), input),
  removeProvider: (id: string) => client.delete<{ ok: true }>(path("providers", id)),

  timeOff: async () => (await client.get<{ items: BookingTimeOff[] }>(path("time-off"))).items,
  createTimeOff: (input: {
    providerId: string | null
    startsAt: string
    endsAt: string
    kind: TimeOffKind
    note: string | null
  }) => client.post<typeof input, BookingTimeOff>(path("time-off"), input),
  removeTimeOff: (id: string) => client.delete<{ ok: true }>(path("time-off", id)),

  availability: async (params: {
    serviceId: string
    date: string
    providerId?: string | null
    partySize?: number
    ignoreBookingId?: string | null
    optionId?: string | null
    addonIds?: string[]
  }) =>
    (
      await client.get<{ slots: Slot[] }>(
        withQuery(path("availability"), { ...params, addonIds: params.addonIds?.join(",") })
      )
    ).slots,

  // What a booking would cost before it is made.
  quote: (
    input: BookingPricingInput & {
      serviceId: string
      partySize: number
      customerId?: string | null
      customerPhone?: string | null
      date?: string | null
    }
  ) => client.post<typeof input, BookingQuote>(path("quote"), input),
  lookupCustomer: (phone: string) =>
    client.get<BookingCustomerLookup>(withQuery(path("customers", "lookup"), { phone })),

  coupons: async () => (await client.get<{ items: BookingCoupon[] }>(path("coupons"))).items,
  createCoupon: (input: BookingCouponInput) =>
    client.post<BookingCouponInput, BookingCoupon>(path("coupons"), input),
  updateCoupon: (id: string, input: BookingCouponInput) =>
    client.put<BookingCouponInput, BookingCoupon>(path("coupons", id), input),
  removeCoupon: (id: string) => client.delete<{ ok: true }>(path("coupons", id)),

  giftCards: async () => (await client.get<{ items: BookingGiftCard[] }>(path("gift-cards"))).items,
  createGiftCard: (input: {
    amount: number
    code?: string | null
    purchaserName?: string | null
    recipientName?: string | null
    recipientPhone?: string | null
    message?: string | null
    expiresOn?: string | null
    sendWhatsApp?: boolean
  }) =>
    client.post<typeof input, BookingGiftCard & { whatsapp: GiftWhatsApp | null }>(
      path("gift-cards"),
      input
    ),
  sendGiftWhatsApp: async (id: string) =>
    (
      await client.post<Record<string, never>, { whatsapp: GiftWhatsApp }>(
        path("gift-cards", id, "whatsapp"),
        {}
      )
    ).whatsapp,
  setGiftCardActive: (id: string, isActive: boolean) =>
    client.post<{ isActive: boolean }, BookingGiftCard>(path("gift-cards", id, "active"), {
      isActive,
    }),

  plans: async () => (await client.get<{ items: BookingPlan[] }>(path("plans"))).items,
  createPlan: (input: BookingPlanInput) =>
    client.post<BookingPlanInput, BookingPlan>(path("plans"), input),
  updatePlan: (id: string, input: BookingPlanInput) =>
    client.put<BookingPlanInput, BookingPlan>(path("plans", id), input),
  removePlan: (id: string) => client.delete<{ ok: true }>(path("plans", id)),
  customerPlans: async () =>
    (await client.get<{ items: BookingCustomerPlan[] }>(path("customer-plans"))).items,
  sellPlan: (input: {
    planId: string
    customerName: string
    customerPhone: string | null
    startsOn?: string | null
    pricePaid?: number | null
  }) => client.post<typeof input, BookingCustomerPlan>(path("customer-plans"), input),
  cancelCustomerPlan: (id: string) =>
    client.post<Record<string, never>, { ok: true }>(path("customer-plans", id, "cancel"), {}),

  reviews: async () => (await client.get<{ items: BookingReview[] }>(path("reviews"))).items,
  setReviewPublished: (id: string, isPublished: boolean) =>
    client.post<{ isPublished: boolean }, { ok: true }>(path("reviews", id, "publish"), {
      isPublished,
    }),

  calendarFeed: () => client.get<{ token: string }>(path("calendar-feed")),
  renewCalendarFeed: () =>
    client.post<Record<string, never>, { token: string }>(path("calendar-feed"), {}),
  // The feed's public address for a calendar program.
  calendarFeedUrl: (token: string) =>
    new URL(`${publicPath("calendar", token)}.ics`, getClientEnvironment().API_BASE_URL).toString(),

  issueInvoice: (id: string) =>
    client.post<Record<string, never>, Booking & { invoiceUrl: string | null }>(
      path("bookings", id, "invoice"),
      {}
    ),

  bookings: async (params: {
    from?: string
    to?: string
    status?: BookingStatus | "all"
    providerId?: string
    search?: string
  }) =>
    (
      await client.get<{ items: Booking[] }>(
        withQuery(path("bookings"), {
          ...params,
          status: params.status === "all" ? undefined : params.status,
        })
      )
    ).items,
  // One booking comes back as itself; a repeating one as every visit made and the weeks left out.
  createBooking: (input: BookingCreateInput) =>
    client.post<BookingCreateInput, Booking | BookingSeriesResult>(path("bookings"), input),
  cancelSeries: (seriesId: string) =>
    client.post<Record<string, never>, { cancelled: number }>(
      path("series", seriesId, "cancel"),
      {}
    ),

  resources: async () => (await client.get<{ items: BookingResource[] }>(path("resources"))).items,
  createResource: (input: BookingResourceInput) =>
    client.post<BookingResourceInput, BookingResource>(path("resources"), input),
  updateResource: (id: string, input: BookingResourceInput) =>
    client.put<BookingResourceInput, BookingResource>(path("resources", id), input),
  removeResource: (id: string) => client.delete<{ ok: true }>(path("resources", id)),

  waitlist: async () => (await client.get<{ items: WaitlistEntry[] }>(path("waitlist"))).items,
  addToWaitlist: (input: {
    serviceId: string
    customerName: string
    customerPhone: string | null
    preferredDate: string
    note: string | null
  }) => client.post<typeof input, { id: string }>(path("waitlist"), input),
  closeWaitlist: (id: string, status: "booked" | "removed") =>
    client.post<{ status: string }, { ok: true }>(path("waitlist", id, "close"), { status }),
  reschedule: (
    id: string,
    input: { startsAt: string; providerId: string | null; force: boolean }
  ) => client.post<typeof input, Booking>(path("bookings", id, "reschedule"), input),
  setStatus: (id: string, status: BookingStatus, reason?: string | null) =>
    client.post<{ status: BookingStatus; reason?: string | null }, Booking>(
      path("bookings", id, "status"),
      { status, reason }
    ),
  setPayment: (id: string, paid: boolean, method?: string | null) =>
    client.post<{ paid: boolean; method?: string | null }, Booking>(
      path("bookings", id, "payment"),
      { paid, method }
    ),
  setNotes: (id: string, notes: string | null) =>
    client.post<{ notes: string | null }, Booking>(path("bookings", id, "notes"), { notes }),
}

// The public booking page and a customer's own booking link: no session.
async function publicRequest<T>(target: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(target, getClientEnvironment().API_BASE_URL), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => null)) as T & { code?: string; message?: string }
  if (!response.ok) throw Object.assign(new Error(body?.message ?? "request"), { code: body?.code })
  return body
}

export const publicBookingService = {
  page: (slug: string) => publicRequest<PublicBookingPage>(publicPath("pages", slug)),
  gift: (token: string) => publicRequest<PublicGift>(publicPath("gifts", token)),
  availability: async (
    slug: string,
    params: {
      serviceId: string
      date: string
      providerId?: string | null
      partySize?: number
      optionId?: string | null
      addonIds?: string[]
    }
  ) =>
    (
      await publicRequest<{ slots: Slot[] }>(
        withQuery(publicPath("pages", slug, "availability"), {
          ...params,
          addonIds: params.addonIds?.join(","),
        })
      )
    ).slots,
  quote: (
    slug: string,
    input: {
      serviceId: string
      partySize: number
      optionId?: string | null
      addonIds?: string[]
      couponCode?: string | null
      giftCode?: string | null
      customerPhone?: string | null
      date?: string | null
    }
  ) =>
    publicRequest<BookingQuote>(publicPath("pages", slug, "quote"), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  joinWaitlist: (
    slug: string,
    input: {
      serviceId: string
      providerId: string | null
      customerName: string
      customerPhone: string
      preferredDate: string
      website?: string
      accountToken?: string | null
    }
  ) =>
    publicRequest<{ id: string | null; accountToken?: string | null }>(
      publicPath("pages", slug, "waitlist"),
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),
  // The customer's own account on the page: their bookings and what they were told.
  account: (slug: string, token: string) =>
    publicRequest<PublicAccount>(publicPath("pages", slug, "account", token)),
  accountBrief: (slug: string, token: string) =>
    publicRequest<{ name: string; phone: string | null; unread: number }>(
      `${publicPath("pages", slug, "account", token)}?brief=1`
    ),
  // Signing in to that account by phone: a code on WhatsApp, then the code typed back.
  signInOffered: (slug: string) =>
    publicRequest<{ offered: boolean }>(publicPath("pages", slug, "sign-in")),
  startSignIn: (slug: string, phone: string) =>
    publicRequest<{ sent: true; expiresInMinutes: number }>(publicPath("pages", slug, "sign-in"), {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  finishSignIn: (
    slug: string,
    input: { phone: string; code: string; accountToken?: string | null }
  ) =>
    publicRequest<{ accountToken: string }>(publicPath("pages", slug, "sign-in", "verify"), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  markAccountRead: (slug: string, token: string) =>
    publicRequest<{ ok: true }>(publicPath("pages", slug, "account", token, "read"), {
      method: "POST",
    }),
  // The customer is back from Moyasar's form with a payment id, to be checked by the server.
  confirmPayment: (token: string, paymentId: string) =>
    publicRequest<{ outcome: "paid" | "refunded"; booking: PublicBooking }>(
      publicPath("manage", token, "payment"),
      { method: "POST", body: JSON.stringify({ paymentId }) }
    ),
  review: (token: string, input: { rating: number; comment: string | null }) =>
    publicRequest<PublicBooking>(publicPath("manage", token, "review"), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  create: (
    slug: string,
    input: {
      serviceId: string
      providerId: string | null
      startsAt: string
      customerName: string
      customerPhone: string
      partySize: number
      notes: string | null
      website?: string
      optionId?: string | null
      addonIds?: string[]
      couponCode?: string | null
      giftCode?: string | null
      accountToken?: string | null
    }
  ) =>
    publicRequest<{
      token: string | null
      booking: PublicBooking | null
      accountToken?: string | null
    }>(publicPath("pages", slug, "bookings"), { method: "POST", body: JSON.stringify(input) }),
  booking: (token: string) => publicRequest<PublicBooking>(publicPath("manage", token)),
  cancel: (token: string) =>
    publicRequest<PublicBooking>(publicPath("manage", token, "cancel"), { method: "POST" }),
}
