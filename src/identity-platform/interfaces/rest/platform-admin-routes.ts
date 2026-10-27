import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import {
  customerListQuerySchema,
  grantSubscriptionSchema,
  renewSubscriptionSchema,
  subscriptionListQuerySchema,
} from "../../platform-admin/schemas"
import type { PlatformAdminService } from "../../platform-admin/service"

type Send = (status: number, body: unknown) => void

// Every /v1/platform-admin/* route (the Madar Admin console's backend), kept out of server.ts's
// main route chain. Returns whether it handled (and responded to) the request -- false means the
// path isn't one of ours and server.ts falls through to its other routes.
export async function handlePlatformAdminRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: PlatformAdminService | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service, readJsonBody } = input
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!url.pathname.startsWith("/v1/platform-admin/")) return false
  if (!service) {
    return send(503, {
      code: "PLATFORM_ADMIN_UNAVAILABLE",
      message: "The Madar Admin backend is unavailable in memory mode.",
    })
  }
  const query = Object.fromEntries(url.searchParams.entries())
  const path = url.pathname.slice("/v1/platform-admin".length)

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

  return send(404, { code: "NOT_FOUND", message: "Route not found." })
}
