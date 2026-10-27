import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS } from "../application/errors/IdentityError"

// Every Madar Admin endpoint is cross-tenant, so none of the usual organization/workspace
// membership checks apply -- this is the whole gate. Platform staff are the PLATFORM_ADMIN_EMAILS
// allowlist today (see AuthenticatedActor.isPlatformAdmin).
export function requirePlatformAdmin(actor: AuthenticatedActor): void {
  if (!actor.isPlatformAdmin) throw ERRORS.forbidden()
}
