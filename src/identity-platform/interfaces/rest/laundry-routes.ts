import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import {
  laundryCollectSchema,
  laundryItemSchema,
  laundryNotifiedSchema,
  laundryOrderPatchSchema,
  laundryOrderSchema,
  laundryPhotoSchema,
  laundryPlanSchema,
  laundryPricesSchema,
  laundryQuoteSchema,
  laundryServiceSchema,
  laundrySettingsSchema,
  laundryStatusSchema,
  laundrySubscriptionSchema,
} from "../../laundry/schemas"
import type { LaundryService, LaundryStatus } from "../../laundry/service"

type Send = (status: number, body: unknown) => void

const STATUS_FILTERS = [
  "received",
  "processing",
  "ready",
  "delivered",
  "cancelled",
  "open",
  "unclaimed",
]

// Every /v1/laundry/* route (the Laundry plugin). The POS subscription is checked before this is
// reached (subscriptions/app-access.ts); here the plugin must be switched on, and the person's
// own cashier permission decides: pos:view to see, pos:manage to change anything.
export async function handleLaundryRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: LaundryService | null
  // Whether the business has the Laundry plugin switched on.
  isEnabled: (organizationId: string) => Promise<boolean>
  // The branch's active staff (drivers are picked from them).
  listStaff: (
    organizationId: string,
    workspaceId: string | null
  ) => Promise<Array<{ userId: string; name: string }>>
  uploadImage:
    | ((organizationId: string, body: Buffer, contentType: string) => Promise<string>)
    | null
  // The branch's enabled payment methods (money only), for taking payments in the app.
  listPaymentMethods: (
    organizationId: string,
    workspaceId: string | null
  ) => Promise<Array<{ code: string; name: string; kind: string }>>
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service } = input
  if (!url.pathname.startsWith("/v1/laundry/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service)
    return send(503, { code: "LAUNDRY_UNAVAILABLE", message: "Laundry is unavailable." })
  if (!(await input.isEnabled(actor.organizationId))) {
    return send(403, {
      code: "LAUNDRY_PLUGIN_OFF",
      message: "The Laundry plugin is switched off for this account.",
    })
  }
  const requireView = () => {
    if (
      !actor.modulePermissions.includes("pos:view") &&
      !actor.modulePermissions.includes("pos:manage")
    ) {
      throw ERRORS.forbidden()
    }
  }
  const requireManage = () => {
    if (!actor.modulePermissions.includes("pos:manage")) throw ERRORS.forbidden()
  }
  const org = actor.organizationId
  const who = actor.userId
  const path = url.pathname.slice("/v1/laundry".length)
  const body = () => input.readJsonBody()
  const query = (key: string) => url.searchParams.get(key)

  if (path === "/settings") {
    if (method === "GET") {
      requireView()
      return send(200, await service.getSettings(org))
    }
    if (method === "PUT") {
      requireManage()
      return send(200, await service.updateSettings(org, laundrySettingsSchema.parse(await body())))
    }
  }

  if (path === "/catalog" && method === "GET") {
    requireView()
    return send(200, await service.getCatalog(org))
  }
  if (path === "/items" && method === "POST") {
    requireManage()
    return send(201, await service.saveItem(org, null, laundryItemSchema.parse(await body())))
  }
  const itemMatch = path.match(/^\/items\/([^/]+)$/)
  if (itemMatch && method === "DELETE") {
    requireManage()
    return send(200, await service.deleteItem(org, itemMatch[1]))
  }
  if (itemMatch && method === "PUT") {
    requireManage()
    return send(
      200,
      await service.saveItem(org, itemMatch[1], laundryItemSchema.parse(await body()))
    )
  }
  if (path === "/services" && method === "POST") {
    requireManage()
    return send(201, await service.saveService(org, null, laundryServiceSchema.parse(await body())))
  }
  const serviceMatch = path.match(/^\/services\/([^/]+)$/)
  if (serviceMatch && method === "DELETE") {
    requireManage()
    return send(200, await service.deleteService(org, serviceMatch[1]))
  }
  if (serviceMatch && method === "PUT") {
    requireManage()
    return send(
      200,
      await service.saveService(org, serviceMatch[1], laundryServiceSchema.parse(await body()))
    )
  }
  if (path === "/prices" && method === "PUT") {
    requireManage()
    return send(200, await service.setPrices(org, laundryPricesSchema.parse(await body()).prices))
  }

  if (path === "/payment-methods" && method === "GET") {
    requireView()
    return send(200, { items: await input.listPaymentMethods(org, actor.workspaceId ?? null) })
  }

  if (path === "/staff" && method === "GET") {
    requireView()
    return send(200, { items: await input.listStaff(org, actor.workspaceId ?? null) })
  }

  if (path === "/orders") {
    if (method === "GET") {
      requireView()
      const status = query("status")
      return send(200, {
        items: await service.listOrders(org, {
          status:
            status && STATUS_FILTERS.includes(status)
              ? (status as LaundryStatus | "open" | "unclaimed")
              : null,
          search: query("search"),
          workspaceId: query("workspaceId"),
          from: query("from"),
          to: query("to"),
        }),
      })
    }
    if (method === "POST") {
      requireManage()
      const payload = laundryOrderSchema.parse(await body())
      return send(
        201,
        await service.createOrder(org, { ...payload, workspaceId: actor.workspaceId ?? null }, who)
      )
    }
  }

  // What the cashier's laundry cart would cost (the customer's subscription included).
  if (path === "/orders/quote" && method === "POST") {
    requireView()
    return send(200, await service.quote(org, laundryQuoteSchema.parse(await body())))
  }

  const orderMatch = path.match(/^\/orders\/([0-9a-f-]{36})(\/.*)?$/)
  if (orderMatch) {
    const id = orderMatch[1]
    const rest = orderMatch[2] ?? ""
    if (rest === "" && method === "GET") {
      requireView()
      return send(200, await service.getOrder(org, id))
    }
    if (rest === "" && method === "PATCH") {
      requireManage()
      return send(
        200,
        await service.updateDelivery(org, id, laundryOrderPatchSchema.parse(await body()), who)
      )
    }
    if (rest === "/status" && method === "POST") {
      requireManage()
      const { status } = laundryStatusSchema.parse(await body())
      return send(200, await service.setStatus(org, id, status, who))
    }
    if (rest === "/collect" && method === "POST") {
      requireManage()
      const { paymentMethodCode, payments } = laundryCollectSchema.parse(await body())
      return send(200, await service.collect(org, id, paymentMethodCode ?? null, who, payments))
    }
    if (rest === "/cancel" && method === "POST") {
      requireManage()
      return send(200, await service.cancel(org, id, who))
    }
    if (rest === "/notified" && method === "POST") {
      requireManage()
      const { kind } = laundryNotifiedSchema.parse(await body())
      return send(200, await service.markNotified(org, id, kind, who))
    }
    if (rest === "/reminder" && method === "POST") {
      requireManage()
      return send(200, await service.sendReminder(org, id, who))
    }
    if (rest === "/photos" && method === "POST") {
      requireManage()
      if (!input.uploadImage) {
        return send(503, {
          code: "LAUNDRY_UPLOAD_UNAVAILABLE",
          message: "Uploads are unavailable.",
        })
      }
      const payload = laundryPhotoSchema.parse(await body())
      const buffer = Buffer.from(payload.dataBase64, "base64")
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        return send(422, { code: "LAUNDRY_IMAGE_TOO_LARGE", message: "A photo of up to 5 MB." })
      }
      const url = await input.uploadImage(org, buffer, payload.contentType)
      return send(201, await service.addPhoto(org, id, url, payload.note ?? null))
    }
    const photoMatch = rest.match(/^\/photos\/([0-9a-f-]{36})$/)
    if (photoMatch && method === "DELETE") {
      requireManage()
      return send(200, await service.removePhoto(org, id, photoMatch[1]))
    }
  }

  if (path === "/plans") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listPlans(org) })
    }
    if (method === "POST") {
      requireManage()
      return send(201, {
        items: await service.savePlan(org, null, laundryPlanSchema.parse(await body())),
      })
    }
  }
  const planMatch = path.match(/^\/plans\/([^/]+)$/)
  if (planMatch && method === "PUT") {
    requireManage()
    return send(200, {
      items: await service.savePlan(org, planMatch[1], laundryPlanSchema.parse(await body())),
    })
  }

  if (path === "/subscriptions") {
    if (method === "GET") {
      requireView()
      return send(200, {
        items: await service.listSubscriptions(org, { customerId: query("customerId") }),
      })
    }
    if (method === "POST") {
      requireManage()
      const payload = laundrySubscriptionSchema.parse(await body())
      return send(
        201,
        await service.sellSubscription(
          org,
          { ...payload, workspaceId: actor.workspaceId ?? null },
          who
        )
      )
    }
  }

  if (path === "/report" && method === "GET") {
    requireView()
    const to = query("to") ?? new Date().toISOString()
    const from = query("from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString()
    return send(200, await service.report(org, { from, to, workspaceId: query("workspaceId") }))
  }

  return false
}
