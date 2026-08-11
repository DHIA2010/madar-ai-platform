import type { Role } from "../../types"
import type { CustomRoleListItem, CustomRoleRepository } from "../repositories"
import { SYSTEM_ROLE_DEFINITIONS } from "./system-roles"

// Resolves a membership's effective module/action permission set (the
// vocabulary the Administration -> Roles permission matrix and frontend
// gating use -- distinct from the coarse org:*/workspace:* set that
// resolvePermissions()/hasPermission() gate real backend actions with).
// A custom role, when assigned, fully replaces the base role's defaults
// rather than merging with them -- an admin picking a specific curated
// role expects exactly that role's grants, not an addition on top.
export function resolveModulePermissions(
  role: Role,
  customRole: CustomRoleListItem | null
): string[] {
  if (customRole) {
    return customRole.permissions.map((permission) => `${permission.module}:${permission.action}`)
  }

  const definition = SYSTEM_ROLE_DEFINITIONS.find((candidate) => candidate.role === role)
  if (!definition) {
    return []
  }

  return Object.entries(definition.permissions).flatMap(([module, actions]) =>
    actions.map((action) => `${module}:${action}`)
  )
}

// Looks up the assigned custom role (if any) and resolves the effective
// module/action permission set for a membership. Shared by both the
// command and query handlers so actor resolution and session/profile reads
// stay consistent. An explicit "None" (moduleAccessRevoked) always wins --
// it's a deliberate zero-access state, distinct from simply never having
// set a custom role (which falls back to the base role's defaults).
export async function resolveMembershipModulePermissions(
  membership: { role: Role; customRoleId: string | null; moduleAccessRevoked: boolean },
  customRoles: CustomRoleRepository
): Promise<string[]> {
  if (membership.moduleAccessRevoked) {
    return []
  }
  const customRole = membership.customRoleId
    ? await customRoles.findByIdWithPermissions(membership.customRoleId)
    : null
  return resolveModulePermissions(membership.role, customRole)
}
