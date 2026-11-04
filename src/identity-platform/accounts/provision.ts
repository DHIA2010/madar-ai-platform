import { randomBytes, randomUUID } from "node:crypto"

import type { Clock, PasswordHasher } from "../application/ports"
import {
  MembershipEntity,
  OrganizationEntity,
  UserEntity,
  WorkspaceEntity,
} from "../domain/entities"
import type {
  MembershipRepository,
  OrganizationRepository,
  UserRepository,
  WorkspaceRepository,
} from "../domain/repositories"
import type { Role } from "../types"

export interface AccountProvisionDeps {
  users: UserRepository
  organizations: OrganizationRepository
  workspaces: WorkspaceRepository
  memberships: MembershipRepository
  hasher: PasswordHasher
  clock: Clock
}

// A new Madar account the same shape as a normal registration: the person owns a new organization
// with one branch. No password is set that anyone knows -- they sign in another way (Google, a
// sign-in or set-password link) and set one themselves.
export async function provisionOwnerAccount(
  deps: AccountProvisionDeps,
  input: { email: string; fullName: string; organizationName: string; emailVerified: boolean }
): Promise<{ userId: string; organizationId: string; workspaceId: string }> {
  const now = deps.clock.nowIso()
  const userId = randomUUID()
  const organizationId = randomUUID()
  const workspaceId = randomUUID()

  const user = UserEntity.register({
    id: userId,
    email: input.email,
    passwordHash: deps.hasher.hash(randomBytes(32).toString("hex")),
    fullName: input.fullName,
    timezone: "Asia/Riyadh",
    language: "ar",
    organizationId,
    workspaceId,
    now,
  })
  if (input.emailVerified) user.verifyEmail(now)
  const organization = OrganizationEntity.create({
    id: organizationId,
    ownerUserId: userId,
    name: input.organizationName,
    settings: {},
    now,
  })
  const workspace = WorkspaceEntity.create({
    id: workspaceId,
    organizationId,
    name: `${input.organizationName} - الفرع الرئيسي`,
    now,
  })
  const membership = MembershipEntity.create({
    id: randomUUID(),
    organizationId,
    workspaceId,
    userId,
    role: "owner" as Role,
    now,
  })

  // users and organizations reference each other: insert the user without those links, then
  // re-save it once the organization and workspace exist (same as register()).
  await deps.users.save({ ...user.toState(), primaryOrganizationId: null, activeWorkspaceId: null })
  await deps.organizations.save(organization.toState())
  await deps.workspaces.save(workspace.toState())
  await deps.users.save(user.toState())
  await deps.memberships.save(membership.toState())
  return { userId, organizationId, workspaceId }
}
