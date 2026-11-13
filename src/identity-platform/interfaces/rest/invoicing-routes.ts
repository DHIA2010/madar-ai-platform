import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import type { SalesInvoicesService } from "../../invoicing/invoices-service"
import type { QuotationsService } from "../../invoicing/quotations-service"
import {
  invoiceInputSchema,
  invoiceListQuerySchema,
  noteInputSchema,
  paymentInputSchema,
  publicResponseSchema,
  quotationInputSchema,
  quotationListQuerySchema,
  quotationStatusSchema,
} from "../../invoicing/schemas"
import { loadSeller } from "../../invoicing/shared"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import type { ZatcaDevicesService } from "../../zatca/zatca-devices-service"

type Send = (status: number, body: unknown) => void
type SendRaw = (status: number, body: string, headers: Record<string, string>) => void

interface Services {
  quotations: QuotationsService | null
  invoices: SalesInvoicesService | null
  devices: ZatcaDevicesService | null
  database: PostgresDatabase | null
}

const query = (url: URL) => Object.fromEntries(url.searchParams.entries())

// The customer's links: a quotation to read and accept or decline, an issued invoice to read.
export async function handlePublicInvoicingRoute(input: {
  method: string
  url: URL
  services: Services
  send: Send
  sendRaw: SendRaw
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, services } = input
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  const quotation = url.pathname.match(/^\/v1\/public\/quotations\/([^/]+)(\/respond)?$/)
  if (quotation && services.quotations) {
    const token = decodeURIComponent(quotation[1])
    if (method === "GET" && !quotation[2])
      return send(200, await services.quotations.getPublic(token))
    if (method === "POST" && quotation[2]) {
      const body = publicResponseSchema.parse(await input.readJsonBody())
      return send(
        200,
        await services.quotations.respondPublic(token, body.action, body.name, body.reason)
      )
    }
  }
  const invoice = url.pathname.match(/^\/v1\/public\/sales-invoices\/([^/]+)(\/xml)?$/)
  if (invoice && method === "GET" && services.invoices) {
    const token = decodeURIComponent(invoice[1])
    if (!invoice[2]) return send(200, await services.invoices.getPublic(token))
    const xml = await services.invoices.getPublicXml(token)
    input.sendRaw(200, xml.xml, {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${xml.number}.xml"`,
    })
    return true
  }
  return false
}

export async function handleInvoicingRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  services: Services
  send: Send
  sendRaw: SendRaw
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, services } = input
  if (!url.pathname.startsWith("/v1/invoicing/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  const { quotations, invoices } = services
  if (!quotations || !invoices) {
    return send(503, { code: "INVOICING_UNAVAILABLE", message: "Invoicing is unavailable." })
  }
  const requireView = () => {
    if (!actor.modulePermissions.includes("invoicing:view")) throw ERRORS.forbidden()
  }
  const requireManage = () => {
    if (!actor.modulePermissions.includes("invoicing:manage")) throw ERRORS.forbidden()
  }
  const org = actor.organizationId
  const path = url.pathname.slice("/v1/invoicing".length)

  // What issuing to ZATCA still needs: a device that may issue tax invoices, the seller address.
  if (method === "GET" && path === "/zatca-readiness") {
    requireView()
    const devices = services.devices ? await services.devices.list(org) : []
    const production = devices.filter(
      (device) => device.status === "production" && !device.deactivatedAt
    )
    const seller = await loadSeller(services.database!, org)
    const missing = [
      ["vatNumber", seller.vatNumber],
      ["commercialRegistration", seller.commercialRegistration],
      ["street", seller.address.street],
      ["buildingNumber", seller.address.buildingNumber],
      ["district", seller.address.district],
      ["city", seller.address.city],
      ["postalCode", seller.address.postalCode],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key)
    return send(200, {
      hasDevice: production.length > 0,
      supportsStandard: production.some((device) => device.supportsStandard),
      supportsSimplified: production.some((device) => device.supportsSimplified),
      environment: production[0]?.environment ?? null,
      sellerMissing: missing,
      seller,
    })
  }

  // ---- quotations ----
  if (path === "/quotations") {
    if (method === "GET") {
      requireView()
      return send(200, {
        items: await quotations.list(org, quotationListQuerySchema.parse(query(url))),
      })
    }
    if (method === "POST") {
      requireManage()
      const body = quotationInputSchema.parse(await input.readJsonBody())
      return send(201, await quotations.create(org, actor.workspaceId, actor.userId, body))
    }
  }
  if (method === "GET" && path === "/quotations/summary") {
    requireView()
    return send(200, await quotations.summary(org))
  }
  const quotationMatch = path.match(/^\/quotations\/([0-9a-f-]{36})(\/[a-z-]+)?$/)
  if (quotationMatch) {
    const [, id, action] = quotationMatch
    if (!action) {
      if (method === "GET") {
        requireView()
        return send(200, await quotations.get(org, id))
      }
      if (method === "PUT") {
        requireManage()
        return send(
          200,
          await quotations.update(org, id, quotationInputSchema.parse(await input.readJsonBody()))
        )
      }
      if (method === "DELETE") {
        requireManage()
        await quotations.remove(org, id)
        return send(200, { ok: true })
      }
    }
    if (method === "POST" && action === "/status") {
      requireManage()
      const body = quotationStatusSchema.parse(await input.readJsonBody())
      return send(200, await quotations.setStatus(org, id, body.status, body.declineReason))
    }
    if (method === "POST" && action === "/revise") {
      requireManage()
      return send(201, await quotations.revise(org, id, actor.userId))
    }
    if (method === "POST" && action === "/duplicate") {
      requireManage()
      return send(201, await quotations.duplicate(org, id, actor.userId))
    }
  }

  // ---- invoices ----
  if (path === "/invoices") {
    if (method === "GET") {
      requireView()
      return send(200, {
        items: await invoices.list(org, invoiceListQuerySchema.parse(query(url))),
      })
    }
    if (method === "POST") {
      requireManage()
      const body = invoiceInputSchema.parse(await input.readJsonBody())
      return send(201, await invoices.create(org, actor.workspaceId, actor.userId, body))
    }
  }
  if (method === "GET" && path === "/invoices/summary") {
    requireView()
    return send(200, await invoices.summary(org))
  }
  if (method === "GET" && path === "/invoices/advances") {
    requireView()
    return send(200, {
      items: await invoices.listAdvances(org, {
        customerId: url.searchParams.get("customerId"),
        quotationId: url.searchParams.get("quotationId"),
        excludeInvoiceId: url.searchParams.get("excludeInvoiceId"),
      }),
    })
  }
  const paymentMatch = path.match(/^\/invoices\/([0-9a-f-]{36})\/payments\/([0-9a-f-]{36})$/)
  if (paymentMatch && method === "DELETE") {
    requireManage()
    return send(200, await invoices.removePayment(org, paymentMatch[1], paymentMatch[2]))
  }
  const invoiceMatch = path.match(/^\/invoices\/([0-9a-f-]{36})(\/[a-z-]+)?$/)
  if (invoiceMatch) {
    const [, id, action] = invoiceMatch
    if (!action) {
      if (method === "GET") {
        requireView()
        return send(200, await invoices.get(org, id))
      }
      if (method === "PUT") {
        requireManage()
        return send(
          200,
          await invoices.update(org, id, invoiceInputSchema.parse(await input.readJsonBody()))
        )
      }
      if (method === "DELETE") {
        requireManage()
        await invoices.remove(org, id)
        return send(200, { ok: true })
      }
    }
    if (method === "POST" && action === "/issue") {
      requireManage()
      return send(200, await invoices.issue(org, id))
    }
    if (method === "POST" && action === "/zatca-retry") {
      requireManage()
      return send(200, await invoices.retryZatca(org, id))
    }
    if (method === "POST" && action === "/notes") {
      requireManage()
      const body = noteInputSchema.parse(await input.readJsonBody())
      return send(201, await invoices.createNote(org, actor.userId, id, body))
    }
    if (method === "POST" && action === "/payments") {
      requireManage()
      const body = paymentInputSchema.parse(await input.readJsonBody())
      return send(201, await invoices.addPayment(org, actor.userId, id, body))
    }
    if (method === "GET" && action === "/xml") {
      requireView()
      const xml = await invoices.getXml(org, id)
      input.sendRaw(200, xml.xml, {
        "content-type": "application/xml; charset=utf-8",
        "content-disposition": `attachment; filename="${xml.number}.xml"`,
      })
      return true
    }
  }
  return false
}
