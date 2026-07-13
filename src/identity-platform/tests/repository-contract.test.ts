import { newDb } from "pg-mem"
import { describe, expect, it } from "vitest"

import { loadIdentityPlatformConfig } from "../configuration"
import type { InvitationState, MembershipState, OrganizationState } from "../domain/entities"
import type { IdentityRepositories } from "../domain/repositories"
import { HmacTokenService } from "../infrastructure/jwt/token-service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { createPostgresRepositories } from "../infrastructure/postgres/repositories"
import { createInMemoryRepositories } from "../infrastructure/storage/in-memory"
import { RedisSessionRepository } from "../infrastructure/redis/redis-session-repository"
import { FakeRedisClient } from "./helpers/fake-redis-client"

function createConfig() {
  return loadIdentityPlatformConfig({
    jwtSecret: "test-secret-test-secret",
    tokenHashSecret: "test-token-secret-secret",
    postgresUrl: "postgresql://unused",
    redisUrl: "redis://unused",
    storagePath: ".tmp-identity-tests",
    emailFrom: "identity@test.local",
  })
}

function createPostgresRepositoryBundle() {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  return new PostgresDatabase(new adapter.Pool())
}

async function seedAndAssertContract(repositories: IdentityRepositories) {
  const now = new Date().toISOString()
  await repositories.users.save({
    id: "00000000-0000-0000-0000-000000000010",
    email: "owner-contract@test.local",
    passwordHash: "hash",
    fullName: "Owner Contract",
    avatarUrl: null,
    timezone: "UTC",
    language: "en",
    status: "active",
    emailVerifiedAt: null,
    preferences: {},
    failedLoginAttempts: 0,
    lockoutUntil: null,
    activeWorkspaceId: null,
    primaryOrganizationId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  const organization: OrganizationState = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Contract Org",
    ownerUserId: "00000000-0000-0000-0000-000000000010",
    status: "active",
    metadata: { tier: "gold" },
    branding: { theme: "sand" },
    logoUrl: null,
    timezone: "UTC",
    locale: "en",
    currency: "USD",
    subscriptionReference: "sub_001",
    settings: { notifications: true },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await repositories.organizations.save(organization)
  expect(await repositories.organizations.findById(organization.id)).toMatchObject({
    id: organization.id,
    name: organization.name,
    status: organization.status,
  })
  expect(
    await repositories.organizations.list({ ownerUserId: organization.ownerUserId })
  ).toHaveLength(1)

  const workspaceId = "00000000-0000-0000-0000-000000000020"
  await repositories.workspaces.save({
    id: workspaceId,
    organizationId: organization.id,
    name: "Contract Workspace",
    status: "active",
    metadata: {},
    settings: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })

  const membership: MembershipState = {
    id: "00000000-0000-0000-0000-000000000011",
    organizationId: organization.id,
    workspaceId,
    userId: organization.ownerUserId,
    role: "owner",
    status: "active",
    profile: { title: "Owner" },
    statusReason: null,
    invitedByUserId: null,
    acceptedAt: now,
    suspendedAt: null,
    removedAt: null,
    history: [],
    roleHistory: [{ role: "owner", actorUserId: organization.ownerUserId, occurredAt: now }],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await repositories.memberships.save(membership)
  expect(await repositories.memberships.findById(membership.id)).toMatchObject({
    id: membership.id,
    organizationId: organization.id,
    role: "owner",
  })
  expect(
    await repositories.memberships.findByUserAndOrganization(membership.userId, organization.id)
  ).toMatchObject({
    id: membership.id,
  })
  expect(
    await repositories.memberships.listRolesByUserInOrganization(membership.userId, organization.id)
  ).toEqual(["owner"])

  const invitation: InvitationState = {
    id: "00000000-0000-0000-0000-000000000012",
    token: "contract-token-001",
    email: "invitee@test.local",
    organizationId: organization.id,
    workspaceId,
    role: "viewer",
    invitedBy: organization.ownerUserId,
    status: "pending",
    idempotencyKey: "contract-idempotency-key",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    acceptedAt: null,
    declinedAt: null,
    canceledAt: null,
    lastSentAt: now,
    resendCount: 0,
    createdAt: now,
  }
  await repositories.invitations.save(invitation)
  expect(await repositories.invitations.findById(invitation.id)).toMatchObject({
    id: invitation.id,
    status: "pending",
  })
  expect(await repositories.invitations.findByToken(invitation.token)).toMatchObject({
    id: invitation.id,
    email: invitation.email,
  })
  expect(
    await repositories.invitations.findPendingByIdempotencyKey(
      organization.id,
      invitation.idempotencyKey
    )
  ).toMatchObject({
    id: invitation.id,
  })
  expect(await repositories.invitations.listByOrganizationId(organization.id)).toHaveLength(1)
}

describe("repository contract", () => {
  it("is satisfied by in-memory repositories", async () => {
    const repositories = createInMemoryRepositories()
    await seedAndAssertContract(repositories)
  })

  it("is satisfied by postgres repositories", async () => {
    const config = createConfig()
    const tokenService = new HmacTokenService(config.jwtSecret, config.tokenHashSecret)
    const database = createPostgresRepositoryBundle()
    await runIdentityMigrations(database, process.cwd())
    const sessions = new RedisSessionRepository(new FakeRedisClient(), config)
    const repositories = createPostgresRepositories({ db: database, tokenService, sessions })
    await seedAndAssertContract(repositories)
  })
})
