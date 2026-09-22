import { describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import type { RequestContext } from "../types"

const context: RequestContext = {
  requestId: "request-org-1",
  correlationId: "correlation-org-1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  headers: {},
}

function createContainer() {
  return createIdentityPlatform({
    mode: "memory",
    config: {
      jwtSecret: "test-secret-test-secret",
      tokenHashSecret: "test-token-secret-secret",
      postgresUrl: "postgresql://unused",
      redisUrl: "redis://unused",
      storagePath: ".tmp-identity-tests",
      emailFrom: "identity@test.local",
    },
  })
}

async function registerAndLogin(
  container: ReturnType<typeof createIdentityPlatform>,
  email: string
) {
  const registration = await container.commands.register(
    {
      email,
      password: "VeryStrongPassword123!",
      fullName: email,
      organizationName: `Org ${email}`,
      timezone: "UTC",
      language: "en",
    },
    context
  )

  await container.commands.verifyEmail({ token: registration.verificationToken }, context)

  const login = await container.commands.login(
    {
      email,
      password: "VeryStrongPassword123!",
    },
    context
  )

  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)
  return { registration, login, actor }
}

describe("organization platform", () => {
  // Regression: listOrganizations used to page the whole organizations table and only then drop
  // the rows the caller was not a member of, so a caller whose own organization sorted past the
  // first page received an empty list. Registering more organizations than fit on one page puts
  // the caller's own (oldest, since the default sort is createdAt:desc) off page one.
  it("returns the caller's organization even when it sorts past the first page", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "paged-owner@madar.test")
    const ownOrganizationId = owner.actor.organizationId

    // Other people's organizations, all newer than the caller's.
    for (let index = 0; index < 5; index += 1) {
      await registerAndLogin(container, `paged-other-${index}@madar.test`)
    }

    const firstPage = await container.queries.listOrganizations(owner.actor, {
      page: 1,
      pageSize: 2,
    })

    expect(firstPage.items.map((organization) => organization.id)).toEqual([ownOrganizationId])
  })

  it("never returns an organization the caller is not a member of", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "scoped-owner@madar.test")
    const stranger = await registerAndLogin(container, "scoped-stranger@madar.test")

    const listed = await container.queries.listOrganizations(owner.actor, {
      page: 1,
      pageSize: 50,
    })

    expect(listed.items.map((organization) => organization.id)).toEqual([
      owner.actor.organizationId,
    ])
    expect(listed.items.map((organization) => organization.id)).not.toContain(
      stranger.actor.organizationId
    )
  })

  it("supports organization lifecycle transitions", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-org@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      {
        name: "MADAR Platform",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
        branding: { theme: "sand" },
      },
      context
    )

    expect(organization.status).toBe("active")
    expect(organization.currency).toBe("SAR")

    const archived = await container.commands.archiveOrganization(
      owner.actor,
      { organizationId: organization.id },
      context
    )
    expect(archived.status).toBe("archived")

    const restored = await container.commands.restoreOrganization(
      owner.actor,
      { organizationId: organization.id },
      context
    )
    expect(restored.status).toBe("active")

    const deleted = await container.commands.deleteOrganization(
      owner.actor,
      { organizationId: organization.id },
      context
    )
    expect(deleted.status).toBe("deleted")
    expect(deleted.deletedAt).toBeTruthy()
  })

  // Regression: a deleted organization's membership rows are untouched (only the organization's
  // own status changes), so listOrganizations's membership-based id filter still included it --
  // the account settings "حذف الحساب" flow deleted the organization for real, but it kept
  // reappearing in the org list and the workspace switcher, looking exactly like the delete had
  // silently failed.
  it("excludes a deleted organization from the default listing", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-deleted-listing@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      { name: "Soon Deleted", timezone: "UTC", locale: "en", currency: "USD", branding: {} },
      context
    )

    await container.commands.deleteOrganization(
      owner.actor,
      { organizationId: organization.id },
      context
    )

    const listed = await container.queries.listOrganizations(owner.actor, {
      page: 1,
      pageSize: 50,
    })

    expect(listed.items.map((item) => item.id)).not.toContain(organization.id)
    // The caller's original (still-active) organization from registration must still be there --
    // this isn't a blanket "hide everything" regression.
    expect(listed.items.map((item) => item.id)).toContain(owner.actor.organizationId)

    // The exclusion is only the *default* -- an explicit status filter still works exactly as
    // before, for any admin surface that deliberately wants to see deleted organizations.
    const explicit = await container.queries.listOrganizations(owner.actor, {
      page: 1,
      pageSize: 50,
      status: "deleted",
    })
    expect(explicit.items.map((item) => item.id)).toContain(organization.id)
  })

  it("supports invitation idempotency, ownership transfer, and membership lifecycle", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "owner-membership@madar.test")
    const member = await registerAndLogin(container, "member-membership@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      {
        name: "MADAR Ops",
      },
      context
    )

    const invitation1 = await container.commands.inviteMember(
      owner.actor,
      {
        organizationId: organization.id,
        email: "member-membership@madar.test",
        role: "viewer",
        idempotencyKey: "invite-member-1",
      },
      context
    )

    const invitation2 = await container.commands.inviteMember(
      owner.actor,
      {
        organizationId: organization.id,
        email: "member-membership@madar.test",
        role: "viewer",
        idempotencyKey: "invite-member-1",
      },
      context
    )

    expect(invitation1.id).toBe(invitation2.id)

    await container.commands.acceptInvitation(member.actor, { token: invitation1.token }, context)

    const transferred = await container.commands.transferOwnership(
      owner.actor,
      {
        organizationId: organization.id,
        newOwnerUserId: member.actor.userId,
      },
      context
    )
    expect(transferred.ownerUserId).toBe(member.actor.userId)

    const assigned = await container.commands.assignMemberRole(
      member.actor,
      {
        organizationId: organization.id,
        memberUserId: owner.actor.userId,
        role: "manager",
      },
      context
    )
    expect(assigned.role).toBe("manager")

    const suspended = await container.commands.suspendMember(
      member.actor,
      {
        organizationId: organization.id,
        memberUserId: owner.actor.userId,
        reason: "policy_violation",
      },
      context
    )
    expect(suspended.status).toBe("suspended")

    const reactivated = await container.commands.reactivateMember(
      member.actor,
      {
        organizationId: organization.id,
        memberUserId: owner.actor.userId,
      },
      context
    )
    expect(reactivated.status).toBe("active")

    const profiled = await container.commands.updateMemberProfile(
      member.actor,
      {
        organizationId: organization.id,
        memberUserId: owner.actor.userId,
        profile: { title: "Platform Manager" },
      },
      context
    )
    expect(profiled.profile.title).toBe("Platform Manager")

    const removed = await container.commands.removeMember(
      member.actor,
      {
        organizationId: organization.id,
        memberUserId: owner.actor.userId,
        reason: "left_company",
      },
      context
    )
    expect(removed.status).toBe("removed")

    const members = await container.queries.listOrganizationMembers(member.actor, organization.id)
    expect(
      members.members.some(
        (entry) => entry.userId === owner.actor.userId && entry.status === "removed"
      )
    ).toBe(true)
  })

  // Regression: role_code staying "owner" was never enough -- a custom role fully replaces the
  // default module permissions, and the revoked flag zeroes them out, either of which could
  // strip the organization's only owner down to zero real access (settings included) while
  // enforceAtLeastOneOwner (which only checks role_code) stayed satisfied. This is exactly what
  // locked a real user out of Settings.
  it("refuses to strip the org's last full-access owner down to zero permissions", async () => {
    const container = createContainer()
    const owner = await registerAndLogin(container, "sole-owner@madar.test")

    const organization = await container.commands.createOrganization(
      owner.actor,
      { name: "Solo Org" },
      context
    )

    await expect(
      container.commands.setMemberModuleAccess(
        owner.actor,
        { organizationId: organization.id, memberUserId: owner.actor.userId, revoked: true },
        context
      )
    ).rejects.toMatchObject({ code: "ORG_OWNER_REQUIRED" })

    const restrictiveRole = await container.commands.createCustomRole(
      owner.actor,
      { organizationId: organization.id, name: "Locked Down", permissions: [] },
      context
    )

    await expect(
      container.commands.assignMemberCustomRole(
        owner.actor,
        {
          organizationId: organization.id,
          memberUserId: owner.actor.userId,
          customRoleId: restrictiveRole.id,
        },
        context
      )
    ).rejects.toMatchObject({ code: "ORG_OWNER_REQUIRED" })

    // A second full-access owner makes it safe to restrict the first -- the org never drops
    // below one owner with real, unrestricted access.
    const second = await registerAndLogin(container, "second-owner@madar.test")
    const invitation = await container.commands.inviteMember(
      owner.actor,
      {
        organizationId: organization.id,
        email: "second-owner@madar.test",
        role: "owner",
        idempotencyKey: "invite-second-owner",
      },
      context
    )
    await container.commands.acceptInvitation(second.actor, { token: invitation.token }, context)

    const revoked = await container.commands.setMemberModuleAccess(
      owner.actor,
      { organizationId: organization.id, memberUserId: owner.actor.userId, revoked: true },
      context
    )
    expect(revoked.moduleAccessRevoked).toBe(true)
  })
})
