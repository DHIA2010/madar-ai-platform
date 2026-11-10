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
  setExtraBranchesSchema,
  addonPriceSchema,
  grantAddonSchema,
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
  whatsAppPlatformConfigPatchSchema,
  whatsAppTemplateSubmitSchema,
  whatsAppWebhookActivationSchema,
} from "../../platform-admin/schemas"
import {
  crmActivateAccountSchema,
  crmActivationListQuerySchema,
  crmActivitySchema,
  crmCustomFieldInputSchema,
  crmStageDeleteQuerySchema,
  crmStageInputSchema,
  crmStageOrderSchema,
  crmTermsSchema,
  crmViewInputSchema,
  crmViewListQuerySchema,
  crmConvertQuoteSchema,
  crmInvoiceInputSchema,
  crmInvoicePeriodSchema,
  crmInvoiceListQuerySchema,
  crmMarkPaidSchema,
  crmQuoteInputSchema,
  crmQuoteListQuerySchema,
  crmQuoteStatusSchema,
  crmDashboardQuerySchema,
  crmLeadInputSchema,
  crmLeadListQuerySchema,
  crmLeadPatchSchema,
  crmPipelineQuerySchema,
  crmStageSchema,
  crmTaskDoneSchema,
  crmTaskInputSchema,
  crmTaskListQuerySchema,
} from "../../crm/schemas"
import type { SalesDocumentsService } from "../../crm/sales-documents"
import type { CrmService } from "../../crm/service"
import { requirePlatformPermission } from "../../platform-admin/guard"
import type { PlatformGovernanceService } from "../../platform-admin/governance-service"
import type { PlatformOperationsService } from "../../platform-admin/operations-service"
import {
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformPermission,
} from "../../platform-admin/staff-roles"
import type { PlatformAdminService } from "../../platform-admin/service"
import type { WhatsAppPlatformService } from "../../whatsapp/platform-config"
import type { WhatsAppTemplatesService } from "../../whatsapp/templates"

type Send = (status: number, body: unknown) => void

// The trial/renewal settings shown on the packages page -- editable with pricing:manage, while the
// rest of the platform settings need settings:manage.
const PRICING_SETTINGS_KEYS = new Set(["trialDays", "renewalReminderDays", "gracePeriodDays"])

// Which permission each route needs. Reads that several pages share (the pricing catalog for the
// grant dialog, settings) only need any staff access; changes need the specific permission.
function requiredPermission(method: string, path: string): PlatformPermission | "settings" {
  const read = method === "GET"
  if (path.startsWith("/crm")) return "crm:manage"
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
  crm: CrmService | null
  salesDocuments: SalesDocumentsService | null
  whatsapp: WhatsAppPlatformService | null
  whatsappTemplates: WhatsAppTemplatesService | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const {
    method,
    url,
    actor,
    service,
    operations,
    governance,
    crm,
    salesDocuments,
    whatsapp,
    whatsappTemplates,
    readJsonBody,
  } = input
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!url.pathname.startsWith("/v1/platform-admin/")) return false
  if (!service || !operations || !governance || !crm || !salesDocuments) {
    return send(503, {
      code: "PLATFORM_ADMIN_UNAVAILABLE",
      message: "The Madar Admin backend is unavailable in memory mode.",
    })
  }
  const query = Object.fromEntries(url.searchParams.entries())
  const path = url.pathname.slice("/v1/platform-admin".length)

  const permission = requiredPermission(method, path)
  if (permission !== "settings") requirePlatformPermission(actor, permission)

  if (path.startsWith("/crm"))
    return handleCrmRoute({ method, path, query, actor, crm, salesDocuments, send, readJsonBody })

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

  const subscriptionBranchesMatch = path.match(/^\/subscriptions\/([^/]+)\/branches$/)
  if (method === "PUT" && subscriptionBranchesMatch) {
    const { extraBranches } = setExtraBranchesSchema.parse(await readJsonBody())
    return send(
      200,
      await service.setExtraBranches(actor, subscriptionBranchesMatch[1], extraBranches)
    )
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
  if (method === "GET" && path === "/pricing/addons") {
    return send(200, await service.listAddons(actor))
  }
  const addonPriceMatch = path.match(/^\/pricing\/addons\/([^/]+)$/)
  if (method === "PATCH" && addonPriceMatch) {
    const body = addonPriceSchema.parse(await readJsonBody())
    return send(200, await service.updateAddonPrice(actor, addonPriceMatch[1], body))
  }
  const customerAddonMatch = path.match(/^\/customers\/([^/]+)\/addons\/([^/]+)$/)
  if (method === "PUT" && customerAddonMatch) {
    const { interval } = grantAddonSchema.parse(await readJsonBody())
    return send(
      200,
      await service.grantAddon(actor, customerAddonMatch[1], customerAddonMatch[2], interval)
    )
  }
  if (method === "DELETE" && customerAddonMatch) {
    await service.revokeAddon(actor, customerAddonMatch[1], customerAddonMatch[2])
    return send(200, { ok: true })
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

  // WhatsApp Business Platform setup -- see whatsapp/platform-config.ts. Holds secrets, so even
  // reading it needs settings:manage.
  if (path.startsWith("/settings/whatsapp")) {
    requirePlatformPermission(actor, "settings:manage")
    if (!whatsapp) return send(503, { code: "WHATSAPP_UNAVAILABLE", message: "Unavailable." })
    if (method === "GET" && path === "/settings/whatsapp") return send(200, await whatsapp.get())
    if (method === "PATCH" && path === "/settings/whatsapp") {
      const patch = whatsAppPlatformConfigPatchSchema.parse(await readJsonBody())
      return send(200, await whatsapp.update(patch, actor.userId))
    }
    if (method === "POST" && path === "/settings/whatsapp/test") {
      return send(200, await whatsapp.testConnection())
    }
    if (path === "/settings/whatsapp/templates" && method === "GET" && whatsappTemplates) {
      return send(200, { items: await whatsappTemplates.statuses() })
    }
    if (path === "/settings/whatsapp/templates/submit" && method === "POST" && whatsappTemplates) {
      const { name } = whatsAppTemplateSubmitSchema.parse(await readJsonBody())
      return send(200, await whatsappTemplates.submit(name))
    }
    if (method === "POST" && path === "/settings/whatsapp/webhook") {
      const { callbackUrl } = whatsAppWebhookActivationSchema.parse(await readJsonBody())
      return send(200, await whatsapp.activateWebhook(callbackUrl))
    }
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

// Madar Admin's CRM (crm:manage): leads, their timeline and follow-ups, and the sales dashboard.
async function handleCrmRoute(input: {
  method: string
  path: string
  query: Record<string, string>
  actor: AuthenticatedActor
  crm: CrmService
  salesDocuments: SalesDocumentsService
  send: (status: number, body: unknown) => boolean
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, path, query, actor, crm, salesDocuments: docs, send, readJsonBody } = input
  const route = path.slice("/crm".length)

  // ---- Quotes and invoices ----
  if (method === "GET" && route === "/catalog") return send(200, await docs.catalog(actor))
  if (method === "GET" && route === "/quotes") {
    return send(200, await docs.listQuotes(actor, crmQuoteListQuerySchema.parse(query)))
  }
  const leadInvoicesMatch = route.match(/^\/leads\/([0-9a-f-]{36})\/invoices$/)
  if (leadInvoicesMatch && method === "POST") {
    const body = crmInvoiceInputSchema.parse(await readJsonBody())
    return send(201, await docs.createInvoice(actor, leadInvoicesMatch[1], body))
  }
  const leadQuotesMatch = route.match(/^\/leads\/([0-9a-f-]{36})\/quotes$/)
  if (leadQuotesMatch && method === "POST") {
    const body = crmQuoteInputSchema.parse(await readJsonBody())
    return send(201, await docs.createQuote(actor, leadQuotesMatch[1], body))
  }
  const termsMatch = route.match(/^\/(quotes|invoices)\/([0-9a-f-]{36})\/terms$/)
  if (termsMatch && method === "PUT") {
    const { terms } = crmTermsSchema.parse(await readJsonBody())
    const kind = termsMatch[1] === "quotes" ? "quote" : "invoice"
    return send(200, await docs.setTerms(actor, kind, termsMatch[2], terms))
  }
  const quoteMatch = route.match(/^\/quotes\/([0-9a-f-]{36})(\/status|\/convert)?$/)
  if (quoteMatch) {
    const [, quoteId, action] = quoteMatch
    if (!action && method === "GET") return send(200, await docs.getQuote(actor, quoteId))
    if (!action && method === "PATCH") {
      const body = crmQuoteInputSchema.parse(await readJsonBody())
      return send(200, await docs.updateQuote(actor, quoteId, body))
    }
    if (!action && method === "DELETE") {
      await docs.deleteQuote(actor, quoteId)
      return send(200, { ok: true })
    }
    if (action === "/status" && method === "POST") {
      const body = crmQuoteStatusSchema.parse(await readJsonBody())
      return send(200, await docs.setQuoteStatus(actor, quoteId, body.status))
    }
    if (action === "/convert" && method === "POST") {
      const body = crmConvertQuoteSchema.parse(await readJsonBody())
      return send(201, await docs.convertToInvoice(actor, quoteId, body))
    }
  }
  if (method === "GET" && route === "/invoices") {
    return send(200, await docs.listInvoices(actor, crmInvoiceListQuerySchema.parse(query)))
  }
  if (method === "GET" && route === "/activations") {
    const filters = crmActivationListQuerySchema.parse(query)
    return send(200, await docs.listAwaitingActivation(actor, filters))
  }
  const invoiceMatch = route.match(
    /^\/invoices\/([0-9a-f-]{36})(\/mark-paid|\/void|\/activate-account|\/period)?$/
  )
  if (invoiceMatch) {
    const [, invoiceId, action] = invoiceMatch
    if (!action && method === "GET") return send(200, await docs.getInvoice(actor, invoiceId))
    if (action === "/mark-paid" && method === "POST") {
      const body = crmMarkPaidSchema.parse(await readJsonBody())
      return send(200, await docs.markPaid(actor, invoiceId, body))
    }
    if (action === "/void" && method === "POST") {
      return send(200, await docs.voidInvoice(actor, invoiceId))
    }
    if (action === "/period" && method === "PUT") {
      const { start, end } = crmInvoicePeriodSchema.parse(await readJsonBody())
      const period = start && end ? { start, end } : null
      return send(200, await docs.setSubscriptionPeriod(actor, invoiceId, period))
    }
    if (action === "/activate-account" && method === "POST") {
      const body = crmActivateAccountSchema.parse(await readJsonBody())
      return send(200, await docs.activateAccount(actor, invoiceId, body))
    }
  }

  // ---- Pipeline stages ----
  if (method === "GET" && route === "/stages") return send(200, await crm.stages(actor))
  if (method === "POST" && route === "/stages") {
    return send(
      201,
      await crm.saveStage(actor, null, crmStageInputSchema.parse(await readJsonBody()))
    )
  }
  if (method === "PUT" && route === "/stages/order") {
    const { order } = crmStageOrderSchema.parse(await readJsonBody())
    return send(200, await crm.reorderStages(actor, order))
  }
  const stageMatch = route.match(/^\/stages\/(c_[0-9a-f]{10})$/)
  if (stageMatch && method === "PATCH") {
    const body = crmStageInputSchema.parse(await readJsonBody())
    return send(200, await crm.saveStage(actor, stageMatch[1], body))
  }
  if (stageMatch && method === "DELETE") {
    const { moveTo } = crmStageDeleteQuerySchema.parse(query)
    return send(200, await crm.deleteStage(actor, stageMatch[1], moveTo))
  }

  // ---- Custom lead fields and saved views ----
  if (method === "GET" && route === "/fields") return send(200, await crm.listCustomFields(actor))
  if (method === "POST" && route === "/fields") {
    const body = crmCustomFieldInputSchema.parse(await readJsonBody())
    return send(201, await crm.saveCustomField(actor, null, body))
  }
  const fieldMatch = route.match(/^\/fields\/([0-9a-f-]{36})$/)
  if (fieldMatch && method === "PATCH") {
    const body = crmCustomFieldInputSchema.parse(await readJsonBody())
    return send(200, await crm.saveCustomField(actor, fieldMatch[1], body))
  }
  if (fieldMatch && method === "DELETE") {
    return send(200, await crm.deleteCustomField(actor, fieldMatch[1]))
  }
  if (method === "GET" && route === "/views") {
    const { page } = crmViewListQuerySchema.parse(query)
    return send(200, await crm.listViews(actor, page))
  }
  if (method === "POST" && route === "/views") {
    return send(201, await crm.saveView(actor, crmViewInputSchema.parse(await readJsonBody())))
  }
  const viewMatch = route.match(/^\/views\/([0-9a-f-]{36})$/)
  if (viewMatch && method === "DELETE") return send(200, await crm.deleteView(actor, viewMatch[1]))

  if (method === "GET" && route === "/owners") return send(200, await crm.owners(actor))
  if (method === "GET" && route === "/dashboard") {
    const { rangeDays } = crmDashboardQuerySchema.parse(query)
    return send(200, await crm.dashboard(actor, rangeDays))
  }
  if (method === "GET" && route === "/pipeline") {
    return send(200, await crm.pipeline(actor, crmPipelineQuerySchema.parse(query)))
  }
  if (method === "GET" && route === "/leads") {
    const { page, pageSize, ...filters } = crmLeadListQuerySchema.parse(query)
    return send(200, await crm.listLeads(actor, filters, { page, pageSize }))
  }
  if (method === "POST" && route === "/leads") {
    return send(201, await crm.createLead(actor, crmLeadInputSchema.parse(await readJsonBody())))
  }
  if (method === "GET" && route === "/tasks") {
    return send(200, await crm.listTasks(actor, crmTaskListQuerySchema.parse(query)))
  }

  const leadMatch = route.match(/^\/leads\/([0-9a-f-]{36})(\/stage|\/activities|\/tasks)?$/)
  if (leadMatch) {
    const [, leadId, action] = leadMatch
    if (!action && method === "GET") return send(200, await crm.getLead(actor, leadId))
    if (!action && method === "PATCH") {
      return send(
        200,
        await crm.updateLead(actor, leadId, crmLeadPatchSchema.parse(await readJsonBody()))
      )
    }
    if (!action && method === "DELETE") {
      await crm.deleteLead(actor, leadId)
      return send(200, { ok: true })
    }
    if (action === "/stage" && method === "POST") {
      const body = crmStageSchema.parse(await readJsonBody())
      return send(200, await crm.changeStage(actor, leadId, body.stage, body.lostReason))
    }
    if (action === "/activities" && method === "POST") {
      return send(
        201,
        await crm.logActivity(actor, leadId, crmActivitySchema.parse(await readJsonBody()))
      )
    }
    if (action === "/tasks" && method === "POST") {
      return send(
        201,
        await crm.createTask(actor, leadId, crmTaskInputSchema.parse(await readJsonBody()))
      )
    }
  }

  const taskMatch = route.match(/^\/tasks\/([0-9a-f-]{36})$/)
  if (taskMatch && method === "PATCH") {
    const body = crmTaskDoneSchema.parse(await readJsonBody())
    return send(200, await crm.setTaskDone(actor, taskMatch[1], body.done))
  }
  if (taskMatch && method === "DELETE") return send(200, await crm.deleteTask(actor, taskMatch[1]))

  return send(404, { code: "NOT_FOUND", message: "Route not found." })
}
