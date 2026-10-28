import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS } from "../application/errors/IdentityError"
import type { PlatformPermission } from "./staff-roles"

// Every Madar Admin endpoint is cross-tenant, so none of the usual organization/workspace
// membership checks apply -- staff access is the gate. Staff are the PLATFORM_ADMIN_EMAILS
// allowlist (Super Admins) plus active platform_staff members (see resolveActorFromAccessToken).
export function requirePlatformAdmin(actor: AuthenticatedActor): void {
  if (!actor.isPlatformAdmin) throw ERRORS.forbidden()
}

// One Madar Admin capability -- staff roles grant a fixed set (see staff-roles.ts).
export function requirePlatformPermission(
  actor: AuthenticatedActor,
  permission: PlatformPermission
): void {
  requirePlatformAdmin(actor)
  if (!actor.platformPermissions?.includes(permission)) throw ERRORS.forbidden()
}
