import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import {
  HOME_TARGET_SCOPES,
  type HomeTargetScope,
  type HomeTargets,
  homeTargetInputSchema,
} from "../../home-targets/service"

type Send = (status: number, body: unknown) => void

// /v1/home-targets/:scope -- the home page tab's targets (GET), and choosing its KPI or setting
// a target (PUT). Open to everyone in the organization.
export async function handleHomeTargetRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: HomeTargets | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const match = /^\/v1\/home-targets\/([a-z]+)$/.exec(input.url.pathname)
  if (!match) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  const scope = match[1] as HomeTargetScope
  if (!HOME_TARGET_SCOPES.includes(scope)) return send(404, { code: "NOT_FOUND" })
  if (!input.service) return send(503, { code: "HOME_TARGETS_UNAVAILABLE" })
  const { actor } = input
  if (input.method === "GET") {
    return send(200, await input.service.get(actor.organizationId, scope))
  }
  if (input.method === "PUT") {
    const body = homeTargetInputSchema.parse(await input.readJsonBody())
    return send(200, await input.service.set(actor.organizationId, actor.userId, scope, body))
  }
  return false
}
