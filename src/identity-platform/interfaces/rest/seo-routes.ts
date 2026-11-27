import { z } from "zod"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { requirePlatformPermission } from "../../platform-admin/guard"
import type { SeoService } from "../../seo/service"

type Send = (status: number, body: unknown) => boolean

const connectSchema = z.object({ key: z.string().min(50).max(20_000) })
const keywordsSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
})
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Madar Admin: /v1/platform-admin/seo/* -- Google search numbers for madar.my.
export async function handleAdminSeoRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: SeoService | null
  readJsonBody: () => Promise<unknown>
  send: Send
}): Promise<boolean> {
  const prefix = "/v1/platform-admin/seo"
  const { method, url } = input
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false
  // Marketing work: the same staff who run the CRM, the blog and Instagram.
  requirePlatformPermission(input.actor, "crm:manage")
  const service = input.service
  if (!service) return input.send(503, { code: "UNAVAILABLE", message: "Needs the database." })
  const path = url.pathname.slice(prefix.length) || "/"

  if (method === "GET" && path === "/status") {
    return input.send(200, await service.status())
  }
  if (method === "POST" && path === "/connect") {
    const { key } = connectSchema.parse(await input.readJsonBody())
    return input.send(200, await service.connect(key, input.actor.userId))
  }
  if (method === "POST" && path === "/disconnect") {
    await service.disconnect()
    return input.send(200, { ok: true })
  }
  if (method === "GET" && path === "/report") {
    const param = (name: string) => url.searchParams.get(name)?.trim() || undefined
    const startDate = param("startDate")
    const endDate = param("endDate")
    const country = param("country")?.toLowerCase()
    const device = param("device")
    try {
      const report = await service.report({
        startDate: startDate && ISO_DATE.test(startDate) ? startDate : undefined,
        endDate: endDate && ISO_DATE.test(endDate) ? endDate : undefined,
        country: country && /^[a-z]{3}$/.test(country) ? country : undefined,
        device:
          device === "mobile" || device === "desktop" || device === "tablet" ? device : undefined,
      })
      if (!report) return input.send(200, { status: "not_connected" })
      return input.send(200, { status: "ready", ...report })
    } catch (error) {
      return input.send(502, {
        code: "SEARCH_CONSOLE_FAILED",
        message: error instanceof Error ? error.message : "Search Console didn't answer.",
      })
    }
  }
  if (method === "GET" && path === "/keywords") {
    return input.send(200, { keywords: await service.keywords() })
  }
  if (method === "POST" && path === "/keywords") {
    const { keywords } = keywordsSchema.parse(await input.readJsonBody())
    const added = await service.addKeywords(keywords, input.actor.userId)
    return input.send(200, { added, keywords: await service.keywords() })
  }
  const match = path.match(/^\/keywords\/([0-9a-f-]{36})$/)
  if (match && method === "DELETE") {
    await service.removeKeyword(match[1])
    return input.send(200, { ok: true })
  }
  return false
}
