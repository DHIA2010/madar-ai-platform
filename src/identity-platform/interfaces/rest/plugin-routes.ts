import { z } from "zod"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import type { PluginsService } from "../../plugins/service"

type Send = (status: number, body: unknown) => void

const toggleSchema = z.object({ enabled: z.boolean() })

// GET /v1/plugins -- the sector plugins and which are on. PUT /v1/plugins/:id -- switching one
// on or off (whoever may change the account's settings).
export async function handlePluginRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: PluginsService | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service } = input
  if (url.pathname !== "/v1/plugins" && !url.pathname.startsWith("/v1/plugins/")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) return send(503, { code: "PLUGINS_UNAVAILABLE", message: "Unavailable." })
  if (url.pathname === "/v1/plugins" && method === "GET") {
    return send(200, { items: await service.list(actor.organizationId) })
  }
  const match = url.pathname.match(/^\/v1\/plugins\/([a-z-]+)$/)
  if (match && method === "PUT") {
    if (!actor.modulePermissions.includes("settings:edit")) throw ERRORS.forbidden()
    const { enabled } = toggleSchema.parse(await input.readJsonBody())
    return send(200, {
      items: await service.setEnabled(actor.organizationId, match[1], enabled, actor.userId),
    })
  }
  return false
}
