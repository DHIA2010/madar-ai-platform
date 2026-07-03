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

async function registerAndLogin(container: ReturnType<typeof createIdentityPlatform>, email: string) {
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
    expect(members.members.some((entry) => entry.userId === owner.actor.userId && entry.status === "removed")).toBe(true)
  })
})
