import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import {
  availabilityQuerySchema,
  bookingActiveSchema,
  bookingImageSchema,
  bookingCouponSchema,
  bookingCreateSchema,
  bookingGiftCardSchema,
  bookingListQuerySchema,
  bookingLookupQuerySchema,
  bookingNotesSchema,
  bookingPaymentKeySchema,
  bookingPaymentSchema,
  bookingPlanSchema,
  bookingProviderSchema,
  bookingQuoteSchema,
  bookingRangeQuerySchema,
  bookingRescheduleSchema,
  bookingResourceSchema,
  bookingReviewPublishSchema,
  bookingSellPlanSchema,
  bookingImportSchema,
  bookingServiceSchema,
  bookingSettingsSchema,
  bookingStatusSchema,
  bookingTimeOffSchema,
  bookingWaitlistCloseSchema,
  bookingWaitlistSchema,
  publicBookingSchema,
  publicPaymentSchema,
  publicQuoteSchema,
  publicReviewSchema,
  publicSignInCodeSchema,
  publicSignInSchema,
  publicWaitlistSchema,
} from "../../booking/schemas"
import {
  bookingCalendarFeed,
  bookingCalendarToken,
  type BookingInvoicer,
} from "../../booking/automation"
import type { BookingAccounts } from "../../booking/accounts"
import type { BookingPayments } from "../../booking/payments"
import type { BookingService } from "../../booking/service"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"

type Send = (status: number, body: unknown) => void

const query = (url: URL) => Object.fromEntries(url.searchParams.entries())
const unavailable = { code: "BOOKING_UNAVAILABLE", message: "Booking is unavailable." }

// Every /v1/booking/* route (the Booking app). The subscription itself is checked before this is
// reached (subscriptions/app-access.ts); here it is the person's own permission: booking:view to
// see the calendar, booking:manage to change anything.
export async function handleBookingRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: BookingService | null
  // Issues a finished visit's invoice; absent where invoices cannot be issued.
  invoicer: BookingInvoicer | null
  payments: BookingPayments | null
  database: PostgresDatabase | null
  // Saves a picture and answers with its address; absent where files cannot be kept.
  uploadImage:
    | ((organizationId: string, body: Buffer, contentType: string) => Promise<string>)
    | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service } = input
  if (!url.pathname.startsWith("/v1/booking/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) return send(503, unavailable)
  const requireView = () => {
    if (!actor.modulePermissions.includes("booking:view")) throw ERRORS.forbidden()
  }
  const requireManage = () => {
    if (!actor.modulePermissions.includes("booking:manage")) throw ERRORS.forbidden()
  }
  const org = actor.organizationId
  const path = url.pathname.slice("/v1/booking".length)
  const body = () => input.readJsonBody()

  // A picture for the public page or a service. Kept beside the product pictures, a folder the
  // live storage already accepts uploads into.
  if (method === "POST" && path === "/images") {
    requireManage()
    if (!input.uploadImage) {
      return send(503, { code: "BOOKING_UPLOAD_UNAVAILABLE", message: "Uploads are unavailable." })
    }
    const payload = bookingImageSchema.parse(await body())
    const buffer = Buffer.from(payload.dataBase64, "base64")
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return send(422, { code: "BOOKING_IMAGE_TOO_LARGE", message: "An image of up to 5 MB." })
    }
    return send(201, { url: await input.uploadImage(org, buffer, payload.contentType) })
  }

  if (path === "/settings") {
    if (method === "GET") {
      requireView()
      return send(200, await service.getSettings(org))
    }
    if (method === "PUT") {
      requireManage()
      return send(200, await service.updateSettings(org, bookingSettingsSchema.parse(await body())))
    }
  }

  // The calendar feed's address, for a calendar program to follow. POST makes a new one, which
  // closes the old.
  if (path === "/calendar-feed" && input.database) {
    if (method === "GET") requireView()
    else if (method === "POST") requireManage()
    else return false
    const token = await bookingCalendarToken(input.database, service, org, method === "POST")
    return send(200, { token })
  }

  // The business's Moyasar secret key: saved once Moyasar accepts it, never sent back.
  if (method === "PUT" && path === "/settings/payment-key" && input.payments) {
    requireManage()
    await input.payments.saveSecretKey(org, bookingPaymentKeySchema.parse(await body()).secretKey)
    return send(200, await service.getSettings(org))
  }

  if (method === "GET" && path === "/overview") {
    requireView()
    return send(200, await service.overview(org, bookingRangeQuerySchema.parse(query(url))))
  }

  if (path === "/services") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listServices(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(201, await service.createService(org, bookingServiceSchema.parse(await body())))
    }
  }
  // "Service" products from the products list that can become booking services.
  if (method === "GET" && path === "/services/products") {
    requireView()
    return send(200, { items: await service.linkableProducts(org) })
  }
  if (method === "POST" && path === "/services/import") {
    requireManage()
    const { productIds } = bookingImportSchema.parse(await body())
    return send(201, { items: await service.importProducts(org, productIds) })
  }
  const serviceMatch = path.match(/^\/services\/([^/]+)$/)
  if (serviceMatch) {
    requireManage()
    if (method === "PUT") {
      return send(
        200,
        await service.updateService(org, serviceMatch[1], bookingServiceSchema.parse(await body()))
      )
    }
    if (method === "DELETE") {
      await service.removeService(org, serviceMatch[1])
      return send(200, { ok: true })
    }
  }

  if (path === "/providers") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listProviders(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(
        201,
        await service.createProvider(
          org,
          actor.workspaceId ?? null,
          bookingProviderSchema.parse(await body())
        )
      )
    }
  }
  const providerMatch = path.match(/^\/providers\/([^/]+)$/)
  if (providerMatch) {
    requireManage()
    if (method === "PUT") {
      return send(
        200,
        await service.updateProvider(
          org,
          providerMatch[1],
          bookingProviderSchema.parse(await body())
        )
      )
    }
    if (method === "DELETE") {
      await service.removeProvider(org, providerMatch[1])
      return send(200, { ok: true })
    }
  }

  if (path === "/time-off") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listTimeOff(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(201, await service.createTimeOff(org, bookingTimeOffSchema.parse(await body())))
    }
  }
  const timeOffMatch = path.match(/^\/time-off\/([^/]+)$/)
  if (timeOffMatch && method === "DELETE") {
    requireManage()
    await service.deleteTimeOff(org, timeOffMatch[1])
    return send(200, { ok: true })
  }

  if (method === "GET" && path === "/availability") {
    requireView()
    return send(
      200,
      await service.availability(org, availabilityQuerySchema.parse(query(url)), { online: false })
    )
  }

  // Rooms and equipment.
  if (path === "/resources") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listResources(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(
        201,
        await service.saveResource(org, null, bookingResourceSchema.parse(await body()))
      )
    }
  }
  const resourceMatch = path.match(/^\/resources\/([^/]+)$/)
  if (resourceMatch) {
    requireManage()
    if (method === "PUT") {
      return send(
        200,
        await service.saveResource(org, resourceMatch[1], bookingResourceSchema.parse(await body()))
      )
    }
    if (method === "DELETE") {
      await service.removeResource(org, resourceMatch[1])
      return send(200, { ok: true })
    }
  }

  // The waiting list.
  if (path === "/waitlist") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listWaitlist(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(
        201,
        await service.addToWaitlist(org, bookingWaitlistSchema.parse(await body()), "staff")
      )
    }
  }
  const waitMatch = path.match(/^\/waitlist\/([^/]+)\/close$/)
  if (waitMatch && method === "POST") {
    requireManage()
    await service.closeWaitlist(
      org,
      waitMatch[1],
      bookingWaitlistCloseSchema.parse(await body()).status
    )
    return send(200, { ok: true })
  }

  const seriesMatch = path.match(/^\/series\/([^/]+)\/cancel$/)
  if (seriesMatch && method === "POST") {
    requireManage()
    return send(200, await service.cancelSeries(org, seriesMatch[1]))
  }

  // What a booking would cost, before it is made.
  if (method === "POST" && path === "/quote") {
    requireView()
    return send(
      200,
      await service.quoteBooking(org, bookingQuoteSchema.parse(await body()), { online: false })
    )
  }
  if (method === "GET" && path === "/customers/lookup") {
    requireView()
    return send(
      200,
      await service.lookupCustomer(org, bookingLookupQuerySchema.parse(query(url)).phone)
    )
  }

  // Coupons and gift cards.
  if (path === "/coupons") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.extras.listCoupons(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(
        201,
        await service.extras.createCoupon(org, bookingCouponSchema.parse(await body()))
      )
    }
  }
  const couponMatch = path.match(/^\/coupons\/([^/]+)$/)
  if (couponMatch) {
    requireManage()
    if (method === "PUT") {
      return send(
        200,
        await service.extras.updateCoupon(
          org,
          couponMatch[1],
          bookingCouponSchema.parse(await body())
        )
      )
    }
    if (method === "DELETE") {
      await service.extras.removeCoupon(org, couponMatch[1])
      return send(200, { ok: true })
    }
  }
  if (path === "/gift-cards") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.extras.listGiftCards(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(
        201,
        await service.extras.createGiftCard(org, bookingGiftCardSchema.parse(await body()))
      )
    }
  }
  const giftMatch = path.match(/^\/gift-cards\/([^/]+)\/active$/)
  if (giftMatch && method === "POST") {
    requireManage()
    return send(
      200,
      await service.extras.setGiftCardActive(
        org,
        giftMatch[1],
        bookingActiveSchema.parse(await body()).isActive
      )
    )
  }

  // Packages and memberships: what is on sale, and what customers hold.
  if (path === "/plans") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.extras.listPlans(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(201, await service.extras.createPlan(org, bookingPlanSchema.parse(await body())))
    }
  }
  const planMatch = path.match(/^\/plans\/([^/]+)$/)
  if (planMatch) {
    requireManage()
    if (method === "PUT") {
      return send(
        200,
        await service.extras.updatePlan(org, planMatch[1], bookingPlanSchema.parse(await body()))
      )
    }
    if (method === "DELETE") {
      await service.extras.removePlan(org, planMatch[1])
      return send(200, { ok: true })
    }
  }
  if (path === "/customer-plans") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.extras.listCustomerPlans(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(
        201,
        await service.extras.sellPlan(org, bookingSellPlanSchema.parse(await body()))
      )
    }
  }
  const heldMatch = path.match(/^\/customer-plans\/([^/]+)\/cancel$/)
  if (heldMatch && method === "POST") {
    requireManage()
    await service.extras.cancelCustomerPlan(org, heldMatch[1])
    return send(200, { ok: true })
  }

  if (method === "GET" && path === "/reviews") {
    requireView()
    return send(200, { items: await service.extras.listReviews(org) })
  }
  const reviewMatch = path.match(/^\/reviews\/([^/]+)\/publish$/)
  if (reviewMatch && method === "POST") {
    requireManage()
    await service.extras.setReviewPublished(
      org,
      reviewMatch[1],
      bookingReviewPublishSchema.parse(await body()).isPublished
    )
    return send(200, { ok: true })
  }

  if (path === "/bookings") {
    if (method === "GET") {
      requireView()
      return send(200, {
        items: await service.listBookings(org, bookingListQuerySchema.parse(query(url))),
      })
    }
    if (method === "POST") {
      requireManage()
      const payload = bookingCreateSchema.parse(await body())
      const by = { userId: actor.userId, workspaceId: actor.workspaceId ?? null }
      // A repeating booking answers with every visit made and the weeks left out.
      if (payload.repeat) {
        return send(201, await service.createSeries(org, { ...payload, ...payload.repeat }, by))
      }
      return send(201, await service.createBooking(org, payload, { source: "staff", ...by }))
    }
  }
  const bookingMatch = path.match(
    /^\/bookings\/([^/]+)(\/(reschedule|status|payment|notes|invoice|refund))?$/
  )
  if (bookingMatch) {
    const [, id, , action] = bookingMatch
    if (method === "GET" && !action) {
      requireView()
      return send(200, await service.getBooking(org, id))
    }
    if (method === "POST" && action) {
      requireManage()
      if (action === "reschedule") {
        return send(
          200,
          await service.rescheduleBooking(org, id, bookingRescheduleSchema.parse(await body()))
        )
      }
      if (action === "status") {
        const payload = bookingStatusSchema.parse(await body())
        return send(
          200,
          await service.setStatus(org, id, payload.status, {
            reason: payload.reason,
            by: "staff",
            userId: actor.userId,
          })
        )
      }
      if (action === "refund") {
        if (!input.payments) return send(503, unavailable)
        return send(200, await input.payments.refund(org, id))
      }
      if (action === "invoice") {
        if (!input.invoicer) {
          return send(503, { code: "BOOKING_INVOICE_UNAVAILABLE", message: "Invoices are off." })
        }
        const invoiced = await input.invoicer.issue(org, id, actor.userId)
        return send(200, {
          ...invoiced,
          invoiceUrl: invoiced.invoiceId ? input.invoicer.linkFor(invoiced.invoiceId) : null,
        })
      }
      if (action === "payment") {
        return send(
          200,
          await service.setPayment(org, id, bookingPaymentSchema.parse(await body()))
        )
      }
      return send(
        200,
        await service.setNotes(org, id, bookingNotesSchema.parse(await body()).notes)
      )
    }
  }

  return false
}

// The public booking page's routes: no login. `limit` answers whether this caller may go on
// (per address), so guessing page addresses or flooding a business with bookings is slowed.
export async function handlePublicBookingRoute(input: {
  method: string
  url: URL
  service: BookingService | null
  payments: BookingPayments | null
  // The customer's own account on a page (booking/accounts.ts).
  accounts: BookingAccounts | null
  database: PostgresDatabase | null
  send: Send
  sendRaw: (status: number, body: string, headers: Record<string, string>) => void
  readJsonBody: () => Promise<unknown>
  limit: (bucket: string, max: number, windowMs: number) => Promise<boolean>
}): Promise<boolean> {
  const { method, url, service } = input
  if (!url.pathname.startsWith("/v1/public/booking/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) return send(503, unavailable)
  const limited = () =>
    send(429, { code: "BOOKING_RATE_LIMITED", message: "Too many requests. Try again shortly." })
  if (!(await input.limit("booking_public", 120, 60_000))) return limited()
  const path = url.pathname.slice("/v1/public/booking".length)

  // The calendar feed a calendar program follows: bookings as events.
  const feed = path.match(/^\/calendar\/([^/]+?)(?:\.ics)?$/)
  if (feed && method === "GET" && input.database) {
    const calendar = await bookingCalendarFeed(
      input.database,
      service,
      decodeURIComponent(feed[1]),
      url.searchParams.get("provider")
    )
    if (calendar === null) {
      return send(404, { code: "BOOKING_NOT_FOUND", message: "Calendar not found." })
    }
    input.sendRaw(200, calendar, {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    })
    return true
  }

  const manage = path.match(/^\/manage\/([^/]+)(\/(cancel|review|payment))?$/)
  if (manage) {
    const token = decodeURIComponent(manage[1])
    if (method === "GET" && !manage[2]) return send(200, await service.publicBooking(token))
    if (method === "POST" && manage[3] === "cancel") {
      return send(200, await service.publicCancel(token))
    }
    if (method === "POST" && manage[3] === "payment" && input.payments) {
      // Guessing payment ids against a booking is slowed.
      if (!(await input.limit("booking_public_payment", 20, 10 * 60_000))) return limited()
      const outcome = await input.payments.confirm(
        token,
        publicPaymentSchema.parse(await input.readJsonBody()).paymentId
      )
      return send(200, { ...outcome, booking: await service.publicBooking(token) })
    }
    if (method === "POST" && manage[3] === "review") {
      return send(
        200,
        await service.publicReview(token, publicReviewSchema.parse(await input.readJsonBody()))
      )
    }
    return false
  }

  // A customer's own account on a page: their bookings and what they were told.
  const account = path.match(/^\/pages\/([^/]+)\/account\/([^/]+)(\/read)?$/)
  if (account && input.accounts) {
    const [accountSlug, accountToken] = [account[1], account[2]].map(decodeURIComponent)
    if (method === "POST" && account[3]) {
      await input.accounts.markRead(accountSlug, accountToken)
      return send(200, { ok: true })
    }
    if (method === "GET" && !account[3]) {
      return send(
        200,
        url.searchParams.get("brief")
          ? await input.accounts.brief(accountSlug, accountToken)
          : await input.accounts.account(accountSlug, accountToken)
      )
    }
  }

  // Signing in to that account by phone: a code on WhatsApp, then the code typed back.
  const signIn = path.match(/^\/pages\/([^/]+)\/sign-in(\/verify)?$/)
  if (signIn && input.accounts) {
    const signInSlug = decodeURIComponent(signIn[1])
    if (method === "GET" && !signIn[2]) {
      return send(200, { offered: await input.accounts.signInOffered(signInSlug) })
    }
    if (method === "POST" && !signIn[2]) {
      if (!(await input.limit("booking_public_sign_in", 10, 10 * 60_000))) return limited()
      const { phone } = publicSignInSchema.parse(await input.readJsonBody())
      return send(200, await input.accounts.startSignIn(signInSlug, phone))
    }
    if (method === "POST" && signIn[2]) {
      // Guessing codes is slowed (each code also allows only a few wrong tries).
      if (!(await input.limit("booking_public_sign_in_code", 20, 10 * 60_000))) return limited()
      return send(
        200,
        await input.accounts.finishSignIn(
          signInSlug,
          publicSignInCodeSchema.parse(await input.readJsonBody())
        )
      )
    }
  }

  const page = path.match(/^\/pages\/([^/]+)(\/(availability|bookings|quote|waitlist))?$/)
  if (!page) return false
  const slug = decodeURIComponent(page[1])
  if (method === "GET" && !page[3]) return send(200, await service.publicPage(slug))
  if (method === "GET" && page[3] === "availability") {
    const parsed = availabilityQuerySchema.parse(query(url))
    return send(200, await service.publicAvailability(slug, parsed))
  }
  if (method === "POST" && page[3] === "waitlist") {
    if (!(await input.limit("booking_public_create", 8, 10 * 60_000))) return limited()
    const payload = publicWaitlistSchema.parse(await input.readJsonBody())
    if (payload.website) return send(201, { id: null })
    return send(
      201,
      input.accounts
        ? await input.accounts.joinWaitlist(slug, payload)
        : await service.publicJoinWaitlist(slug, payload)
    )
  }
  if (method === "POST" && page[3] === "quote") {
    // Trying codes one after another is slowed.
    if (!(await input.limit("booking_public_quote", 40, 10 * 60_000))) return limited()
    return send(
      200,
      await service.publicQuote(slug, publicQuoteSchema.parse(await input.readJsonBody()))
    )
  }
  if (method === "POST" && page[3] === "bookings") {
    if (!(await input.limit("booking_public_create", 8, 10 * 60_000))) return limited()
    const payload = publicBookingSchema.parse(await input.readJsonBody())
    // The trap field: a person never fills it in. Answer as if it worked and keep nothing.
    if (payload.website) return send(201, { token: null, booking: null })
    return send(
      201,
      input.accounts
        ? await input.accounts.book(slug, payload)
        : await service.publicCreate(slug, payload)
    )
  }
  return false
}
