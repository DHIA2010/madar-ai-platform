import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import {
  addStaffSchema,
  couponInputSchema,
  createFlagSchema,
  flagInputSchema,
  flagOverrideSchema,
  updateStaffSchema,
  customerListQuerySchema,
  grantSubscriptionSchema,
  packageInputSchema,
  paymentListQuerySchema,
  platformSettingsPatchSchema,
  pricingModeSchema,
  applicationVisibilitySchema,
  purchasableApplicationSchema,
  receiptListQuerySchema,
  renewSubscriptionSchema,
  reorderPackagesSchema,
  storeListQuerySchema,
  subscriptionListQuerySchema,
} from "../../platform-admin/schemas"
import { requirePlatformPermission } from "../../platform-admin/guard"
import type { PlatformGovernanceService } from "../../platform-admin/governance-service"
import type { PlatformOperationsService } from "../../platform-admin/operations-service"
import {
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformPermission,
} from "../../platform-admin/staff-roles"
import type { PlatformAdminService } from "../../platform-admin/service"

type Send = (status: number, body: unknown) => void

// The trial/renewal settings shown on the packages page -- editable with pricing:manage, while the
// rest of the platform settings need settings:manage.
const PRICING_SETTINGS_KEYS = new Set(["trialDays", "renewalReminderDays", "gracePeriodDays"])

// Which permission each route needs. Reads that several pages share (the pricing catalog for the
// grant dialog, settings) only need any staff access; changes need the specific permission.
function requiredPermission(method: string, path: string): PlatformPermission | "settings" {
  const read = method === "GET"
  if (path.startsWith("/overview")) return "customers:view"
  if (path.startsWith("/customers") || path.startsWith("/subscriptions")) {
    return read ? "customers:view" : "subscriptions:manage"
  }
  if (path.startsWith("/pricing") || path.startsWith("/packages")) {
    return read ? "customers:view" : "pricing:manage"
  }
  if (path.startsWith("/coupons")) return "coupons:manage"
  if (path.startsWith("/payments") || path.startsWith("/receipts")) return "billing:view"
  if (path.startsWith("/billing/maintenance")) return "settings:manage"
  if (
    path.startsWith("/stores") ||
    path.startsWith("/integrations") ||
    path.startsWith("/tracking") ||
    path.startsWith("/system-health")
  ) {
    return "operations:view"
  }
  if (path.startsWith("/settings")) return read ? "customers:view" : "settings"
  if (path.startsWith("/staff") || path.startsWith("/roles")) {
    return read && path.startsWith("/roles") ? "customers:view" : "staff:manage"
  }
  if (path.startsWith("/feature-flags")) return "flags:manage"
  return "staff:manage"
}

// Every /v1/platform-admin/* route (the Madar Admin console's backend), kept out of server.ts's
// main route chain. Returns whether it handled (and responded to) the request -- false means the
// path isn't one of ours and server.ts falls through to its other routes.
export async function handlePlatformAdminRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: PlatformAdminService | null
  operations: PlatformOperationsService | null
  governance: PlatformGovernanceService | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service, operations, governance, readJsonBody } = input
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!url.pathname.startsWith("/v1/platform-admin/")) return false
  if (!service || !operations || !governance) {
    return send(503, {
      code: "PLATFORM_ADMIN_UNAVAILABLE",
      message: "The Madar Admin backend is unavailable in memory mode.",
    })
  }
  const query = Object.fromEntries(url.searchParams.entries())
  const path = url.pathname.slice("/v1/platform-admin".length)

  const permission = requiredPermission(method, path)
  if (permission !== "settings") requirePlatformPermission(actor, permission)

  if (method === "GET" && path === "/customers") {
    const { page, pageSize, ...filters } = customerListQuerySchema.parse(query)
    return send(200, await service.listCustomers(actor, filters, { page, pageSize }))
  }
  if (method === "GET" && path === "/customers/summary") {
    return send(200, await service.getCustomerSummary(actor))
  }

  const customerMatch = path.match(/^\/customers\/([^/]+)$/)
  if (method === "GET" && customerMatch) {
    return send(200, await service.getCustomer(actor, customerMatch[1]))
  }

  const customerSubscriptionsMatch = path.match(/^\/customers\/([^/]+)\/subscriptions$/)
  if (method === "POST" && customerSubscriptionsMatch) {
    const body = grantSubscriptionSchema.parse(await readJsonBody())
    return send(201, await service.grantSubscription(actor, customerSubscriptionsMatch[1], body))
  }

  if (method === "GET" && path === "/subscriptions") {
    const { page, pageSize, ...filters } = subscriptionListQuerySchema.parse(query)
    return send(200, await service.listSubscriptions(actor, filters, { page, pageSize }))
  }
  if (method === "GET" && path === "/subscriptions/summary") {
    return send(200, await service.getSubscriptionSummary(actor))
  }

  const subscriptionActionMatch = path.match(/^\/subscriptions\/([^/]+)\/(renew|cancel)$/)
  if (method === "POST" && subscriptionActionMatch) {
    const [, subscriptionId, action] = subscriptionActionMatch
    if (action === "renew") {
      const body = renewSubscriptionSchema.parse(await readJsonBody())
      return send(200, await service.renewSubscription(actor, subscriptionId, body))
    }
    return send(200, await service.cancelSubscription(actor, subscriptionId))
  }

  if (method === "GET" && path === "/pricing") {
    return send(200, await service.getPricing(actor))
  }
  const pricingMatch = path.match(/^\/pricing\/([^/]+)\/(mode|visibility|packages|order)$/)
  if (pricingMatch) {
    const application = purchasableApplicationSchema.parse(pricingMatch[1])
    if (method === "PUT" && pricingMatch[2] === "mode") {
      const { mode, freeDays } = pricingModeSchema.parse(await readJsonBody())
      await service.setPricingMode(actor, application, mode, freeDays)
      return send(200, { ok: true })
    }
    if (method === "PUT" && pricingMatch[2] === "visibility") {
      const { visible } = applicationVisibilitySchema.parse(await readJsonBody())
      await service.setApplicationVisibility(actor, application, visible)
      return send(200, { ok: true })
    }
    if (method === "POST" && pricingMatch[2] === "packages") {
      const body = packageInputSchema.parse(await readJsonBody())
      return send(201, await service.createPackage(actor, application, body))
    }
    if (method === "PUT" && pricingMatch[2] === "order") {
      const { packageIds } = reorderPackagesSchema.parse(await readJsonBody())
      await service.reorderPackages(actor, application, packageIds)
      return send(200, { ok: true })
    }
  }
  const packageMatch = path.match(/^\/packages\/([^/]+)$/)
  if (packageMatch && method === "PATCH") {
    const body = packageInputSchema.parse(await readJsonBody())
    return send(200, await service.updatePackage(actor, packageMatch[1], body))
  }
  if (packageMatch && method === "DELETE") {
    await service.deletePackage(actor, packageMatch[1])
    return send(200, { ok: true })
  }

  if (method === "GET" && path === "/overview") {
    return send(200, await service.getOverview(actor))
  }
  if (method === "GET" && path === "/roles") {
    return send(200, PLATFORM_ROLE_PERMISSIONS)
  }
  if (method === "GET" && path === "/staff") {
    return send(200, await governance.listStaff())
  }
  if (method === "POST" && path === "/staff") {
    await governance.addStaff(actor, addStaffSchema.parse(await readJsonBody()))
    return send(201, { ok: true })
  }
  const staffMatch = path.match(/^\/staff\/([^/]+)$/)
  if (staffMatch && method === "PATCH") {
    await governance.updateStaff(
      actor,
      staffMatch[1],
      updateStaffSchema.parse(await readJsonBody())
    )
    return send(200, { ok: true })
  }
  if (method === "GET" && path === "/feature-flags") {
    return send(200, await governance.listFlags())
  }
  if (method === "POST" && path === "/feature-flags") {
    await governance.createFlag(actor, createFlagSchema.parse(await readJsonBody()))
    return send(201, { ok: true })
  }
  const flagMatch = path.match(/^\/feature-flags\/([^/]+)(\/overrides)?$/)
  if (flagMatch && method === "PATCH" && !flagMatch[2]) {
    await governance.updateFlag(actor, flagMatch[1], flagInputSchema.parse(await readJsonBody()))
    return send(200, { ok: true })
  }
  if (flagMatch && method === "PUT" && flagMatch[2]) {
    const body = flagOverrideSchema.parse(await readJsonBody())
    await governance.setFlagOverride(actor, flagMatch[1], body.organizationId, body.enabled)
    return send(200, { ok: true })
  }
  if (flagMatch && method === "DELETE" && !flagMatch[2]) {
    await governance.deleteFlag(actor, flagMatch[1])
    return send(200, { ok: true })
  }

  if (method === "GET" && path === "/stores") {
    const { page, pageSize, ...filters } = storeListQuerySchema.parse(query)
    return send(200, await operations.listStores(actor, filters, { page, pageSize }))
  }
  if (method === "GET" && path === "/stores/summary") {
    return send(200, await operations.getStoreSummary(actor))
  }
  if (method === "GET" && path === "/integrations") {
    return send(200, await operations.getIntegrations(actor))
  }
  if (method === "GET" && path === "/tracking") {
    return send(200, await operations.getTracking(actor))
  }
  if (method === "GET" && path === "/system-health") {
    return send(200, await operations.getSystemHealth(actor))
  }

  if (method === "GET" && path === "/payments") {
    const { page, pageSize, ...filters } = paymentListQuerySchema.parse(query)
    return send(200, await service.listPayments(actor, filters, { page, pageSize }))
  }
  if (method === "GET" && path === "/payments/summary") {
    return send(200, await service.getPaymentSummary(actor))
  }
  if (method === "GET" && path === "/receipts") {
    const { page, pageSize, ...filters } = receiptListQuerySchema.parse(query)
    return send(200, await service.listReceipts(actor, filters, { page, pageSize }))
  }
  const receiptMatch = path.match(/^\/receipts\/([^/]+)$/)
  if (receiptMatch && method === "GET") {
    return send(200, await service.getReceipt(actor, receiptMatch[1]))
  }
  if (method === "POST" && path === "/billing/maintenance") {
    return send(200, await service.runBillingMaintenance(actor))
  }

  if (method === "GET" && path === "/coupons") {
    return send(200, await service.listCoupons(actor))
  }
  if (method === "POST" && path === "/coupons") {
    return send(
      201,
      await service.createCoupon(actor, couponInputSchema.parse(await readJsonBody()))
    )
  }
  const couponMatch = path.match(/^\/coupons\/([^/]+)$/)
  if (couponMatch && method === "PATCH") {
    const body = couponInputSchema.parse(await readJsonBody())
    return send(200, await service.updateCoupon(actor, couponMatch[1], body))
  }
  if (couponMatch && method === "DELETE") {
    await service.deleteCoupon(actor, couponMatch[1])
    return send(200, { ok: true })
  }

  if (method === "GET" && path === "/settings") {
    return send(200, await service.getSettings(actor))
  }
  if (method === "PATCH" && path === "/settings") {
    const patch = platformSettingsPatchSchema.parse(await readJsonBody())
    const onlyPricingKeys = Object.keys(patch).every((key) => PRICING_SETTINGS_KEYS.has(key))
    requirePlatformPermission(actor, onlyPricingKeys ? "pricing:manage" : "settings:manage")
    return send(200, await service.updateSettings(actor, patch))
  }

  return send(404, { code: "NOT_FOUND", message: "Route not found." })
}
