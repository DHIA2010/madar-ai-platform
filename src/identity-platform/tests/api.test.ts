// @vitest-environment node

import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityApiServer } from "../api"
import { IdentityPlatformService } from "../service"

describe("Identity API", () => {
  let server: ReturnType<typeof createIdentityApiServer>
  let baseUrl = ""

  beforeEach(async () => {
    server = createIdentityApiServer(
      new IdentityPlatformService({
        jwtSecret: "test-secret-test-secret",
        tokenHashSecret: "test-token-secret-secret",
        postgresUrl: "postgresql://unused",
        redisUrl: "redis://unused",
        storagePath: ".tmp-identity-tests",
        emailFrom: "identity@test.local",
      })
    )
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (!server) {
      return
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

  it("runs the core auth flow through REST endpoints", async () => {
    const registrationResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "api@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "API User",
        organizationName: "API Org",
      }),
    })

    expect(registrationResponse.status).toBe(201)
    const registration = await registrationResponse.json()

    const verifyResponse = await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: registration.verificationToken }),
    })
    expect(verifyResponse.status).toBe(200)

    const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "api@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })

    expect(loginResponse.status).toBe(200)
    const login = await loginResponse.json()
    expect(login.session.accessToken).toBeTruthy()

    const profileResponse = await fetch(`${baseUrl}/v1/identity/profile`, {
      headers: {
        authorization: `Bearer ${login.session.accessToken}`,
      },
    })

    expect(profileResponse.status).toBe(200)
    const profile = await profileResponse.json()
    expect(profile.email).toBe("api@madar.test")
  })

  it("supports organization platform endpoints for invitations", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "org-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Org Owner",
        organizationName: "Seed Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })

    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "org-owner@madar.test", password: "VeryStrongPassword123!" }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    expect(createOrgRes.status).toBe(201)
    const createdOrg = await createOrgRes.json()

    const inviteRes1 = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        email: "invitee@madar.test",
        role: "viewer",
        idempotencyKey: "idem-invite-1",
      }),
    })

    expect(inviteRes1.status).toBe(201)
    const invite1 = await inviteRes1.json()

    const inviteRes2 = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        email: "invitee@madar.test",
        role: "viewer",
        idempotencyKey: "idem-invite-1",
      }),
    })

    expect(inviteRes2.status).toBe(201)
    const invite2 = await inviteRes2.json()
    expect(invite1.id).toBe(invite2.id)
  })

  it("resending an invitation issues a working new token instead of an unusable empty one", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "resend-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Resend Owner",
        organizationName: "Resend Owner Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })
    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "resend-owner@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const inviteRes = await fetch(
      `${baseUrl}/v1/organizations/${ownerRegistration.organizationId}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerLogin.session.accessToken}`,
        },
        body: JSON.stringify({ email: "resend-invitee@madar.test", role: "viewer" }),
      }
    )
    const invite = await inviteRes.json()

    const resendRes = await fetch(`${baseUrl}/v1/organizations/invitations/${invite.id}/resend`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    expect(resendRes.status).toBe(200)
    const resent = await resendRes.json()

    // the resent token must actually be usable...
    expect(resent.token).toBeTruthy()
    expect(resent.token).not.toBe(invite.token)

    const registerInviteeRes = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "resend-invitee@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Resend Invitee",
        invitationToken: resent.token,
      }),
    })
    expect(registerInviteeRes.status).toBe(201)
  })

  it("lets a brand-new user register via an invitation link and joins the inviting org", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "invite-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Invite Owner",
        organizationName: "Invite Owner Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })
    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "invite-owner@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const inviteRes = await fetch(
      `${baseUrl}/v1/organizations/${ownerRegistration.organizationId}/invitations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerLogin.session.accessToken}`,
        },
        body: JSON.stringify({ email: "new-invitee@madar.test", role: "analyst" }),
      }
    )
    expect(inviteRes.status).toBe(201)
    const invite = await inviteRes.json()

    const registerInviteeRes = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "new-invitee@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "New Invitee",
        invitationToken: invite.token,
      }),
    })
    expect(registerInviteeRes.status).toBe(201)
    const inviteeRegistration = await registerInviteeRes.json()
    // must join the inviting org, not get a brand-new one of their own
    expect(inviteeRegistration.organizationId).toBe(ownerRegistration.organizationId)

    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: inviteeRegistration.verificationToken }),
    })
    const inviteeLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "new-invitee@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    expect(inviteeLoginRes.status).toBe(200)
    const inviteeLogin = await inviteeLoginRes.json()

    const membersRes = await fetch(
      `${baseUrl}/v1/organizations/${ownerRegistration.organizationId}/members`,
      { headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` } }
    )
    const members = await membersRes.json()
    const inviteeMember = members.members.find(
      (member: { userId: string }) => member.userId === inviteeLogin.user.id
    )
    expect(inviteeMember).toBeTruthy()
    expect(inviteeMember.role).toBe("analyst")

    // the invitation is now consumed — reusing it must fail rather than create a duplicate membership
    const secondAttempt = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "another-invitee@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Another Invitee",
        invitationToken: invite.token,
      }),
    })
    expect(secondAttempt.status).toBe(401)
  })

  it("creates a team and lists it with the creator as manager and first member", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Team Owner",
        organizationName: "Team Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })

    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "team-owner@madar.test", password: "VeryStrongPassword123!" }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Teams Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const createTeamRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Growth Marketing",
        description: "Handles paid and organic growth",
      }),
    })
    expect(createTeamRes.status).toBe(201)
    const createdTeam = await createTeamRes.json()
    expect(createdTeam.name).toBe("Growth Marketing")
    expect(typeof createdTeam.managerUserId).toBe("string")

    const listTeamsRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    expect(listTeamsRes.status).toBe(200)
    const listedTeams = await listTeamsRes.json()
    expect(listedTeams.items).toHaveLength(1)
    expect(listedTeams.items[0].name).toBe("Growth Marketing")
    expect(listedTeams.items[0].managerName).toBe("Team Owner")
    expect(listedTeams.items[0].memberCount).toBe(1)
  })

  it("adds and removes a team member", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-members-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Team Members Owner",
        organizationName: "Team Members Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })
    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-members-owner@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Team Members Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const createTeamRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({ name: "Support" }),
    })
    const createdTeam = await createTeamRes.json()

    const registerInvitee = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-members-invitee@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Team Members Invitee",
        organizationName: "Invitee Own Org",
      }),
    })
    const inviteeRegistration = await registerInvitee.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: inviteeRegistration.verificationToken }),
    })
    const inviteeLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-members-invitee@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    const inviteeLogin = await inviteeLoginRes.json()

    const inviteRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/invitations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({ email: "team-members-invitee@madar.test", role: "viewer" }),
    })
    const invite = await inviteRes.json()

    const acceptRes = await fetch(
      `${baseUrl}/v1/organizations/invitations/${invite.token}/accept`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${inviteeLogin.session.accessToken}`,
        },
        body: "{}",
      }
    )
    expect(acceptRes.status).toBe(200)

    const inviteeProfileRes = await fetch(`${baseUrl}/v1/identity/profile`, {
      headers: { authorization: `Bearer ${inviteeLogin.session.accessToken}` },
    })
    const inviteeProfile = await inviteeProfileRes.json()

    const addMemberRes = await fetch(
      `${baseUrl}/v1/organizations/teams/${createdTeam.id}/members`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerLogin.session.accessToken}`,
        },
        body: JSON.stringify({ userId: inviteeProfile.id }),
      }
    )
    expect(addMemberRes.status).toBe(201)

    const membersAfterAddRes = await fetch(
      `${baseUrl}/v1/organizations/teams/${createdTeam.id}/members`,
      { headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` } }
    )
    const membersAfterAdd = await membersAfterAddRes.json()
    expect(membersAfterAdd.items).toHaveLength(2)
    expect(membersAfterAdd.items.map((item: { userId: string }) => item.userId)).toContain(
      inviteeProfile.id
    )

    const removeMemberRes = await fetch(
      `${baseUrl}/v1/organizations/teams/${createdTeam.id}/members/${inviteeProfile.id}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
      }
    )
    expect(removeMemberRes.status).toBe(200)

    const membersAfterRemoveRes = await fetch(
      `${baseUrl}/v1/organizations/teams/${createdTeam.id}/members`,
      { headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` } }
    )
    const membersAfterRemove = await membersAfterRemoveRes.json()
    expect(membersAfterRemove.items).toHaveLength(1)
  })

  it("updates and deletes a team", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-edit-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Team Edit Owner",
        organizationName: "Team Edit Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })
    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-edit-owner@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Team Edit Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const createTeamRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({ name: "Original Name", description: "Original description" }),
    })
    const createdTeam = await createTeamRes.json()

    const updateRes = await fetch(`${baseUrl}/v1/organizations/teams/${createdTeam.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({ name: "Renamed Team", description: "Updated description" }),
    })
    expect(updateRes.status).toBe(200)
    const updatedTeam = await updateRes.json()
    expect(updatedTeam.name).toBe("Renamed Team")
    expect(updatedTeam.description).toBe("Updated description")

    const listAfterUpdateRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    const listAfterUpdate = await listAfterUpdateRes.json()
    expect(listAfterUpdate.items).toHaveLength(1)
    expect(listAfterUpdate.items[0].name).toBe("Renamed Team")

    const deleteRes = await fetch(`${baseUrl}/v1/organizations/teams/${createdTeam.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    expect(deleteRes.status).toBe(200)

    const listAfterDeleteRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    const listAfterDelete = await listAfterDeleteRes.json()
    expect(listAfterDelete.items).toHaveLength(0)
  })

  it("assigns permissions to a team and reflects them on member listings", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-perms-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Team Perms Owner",
        organizationName: "Team Perms Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })
    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "team-perms-owner@madar.test",
        password: "VeryStrongPassword123!",
      }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Team Perms Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const createTeamRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({ name: "Growth", roleReference: "viewer" }),
    })
    expect(createTeamRes.status).toBe(201)
    const createdTeam = await createTeamRes.json()
    expect(createdTeam.roleReference).toBe("viewer")
    expect(createdTeam.permissions.campaigns).toEqual(["view"])
    expect(createdTeam.permissions.dashboard).toEqual(["view"])

    const listTeamsRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/teams`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    const listedTeams = await listTeamsRes.json()
    expect(listedTeams.items[0].permissions.campaigns).toEqual(["view"])

    const createRoleRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Reports Only",
        permissions: [{ module: "reports", action: "view" }],
      }),
    })
    const createdRole = await createRoleRes.json()

    const updateRes = await fetch(`${baseUrl}/v1/organizations/teams/${createdTeam.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({ roleReference: createdRole.id }),
    })
    expect(updateRes.status).toBe(200)
    const updatedTeam = await updateRes.json()
    expect(updatedTeam.roleReference).toBe(createdRole.id)
    expect(updatedTeam.permissions).toEqual({ reports: ["view"] })

    const membersRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/members`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    const membersBody = await membersRes.json()
    const ownerMember = membersBody.members.find(
      (member: { email: string }) => member.email === "team-perms-owner@madar.test"
    )
    expect(ownerMember.teams).toEqual([{ id: createdTeam.id, name: "Growth" }])
  })

  it("lists system roles with real member counts and supports creating/editing a custom role", async () => {
    const registerOwner = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "role-owner@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Role Owner",
        organizationName: "Role Org",
      }),
    })
    const ownerRegistration = await registerOwner.json()
    await fetch(`${baseUrl}/v1/auth/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: ownerRegistration.verificationToken }),
    })

    const ownerLoginRes = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "role-owner@madar.test", password: "VeryStrongPassword123!" }),
    })
    const ownerLogin = await ownerLoginRes.json()

    const createOrgRes = await fetch(`${baseUrl}/v1/organizations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "Roles Platform Org",
        timezone: "Asia/Riyadh",
        locale: "ar-SA",
        currency: "SAR",
      }),
    })
    const createdOrg = await createOrgRes.json()

    const listBeforeRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    expect(listBeforeRes.status).toBe(200)
    const listedBefore = await listBeforeRes.json()
    const ownerRole = listedBefore.items.find((item: { id: string }) => item.id === "owner")
    expect(ownerRole).toBeTruthy()
    expect(ownerRole.userCount).toBe(1)
    expect(ownerRole.editable).toBe(false)
    expect(ownerRole.permissions.campaigns).toContain("publish")

    const createRoleRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        name: "RevOps",
        description: "Custom role for revenue operations",
        permissions: [
          { module: "campaigns", action: "view" },
          { module: "reports", action: "export" },
        ],
      }),
    })
    expect(createRoleRes.status).toBe(201)
    const createdRole = await createRoleRes.json()
    expect(createdRole.name).toBe("RevOps")
    expect(createdRole.permissions).toHaveLength(2)

    const updateRoleRes = await fetch(`${baseUrl}/v1/organizations/roles/${createdRole.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerLogin.session.accessToken}`,
      },
      body: JSON.stringify({
        permissions: [
          { module: "campaigns", action: "view" },
          { module: "campaigns", action: "edit" },
        ],
      }),
    })
    expect(updateRoleRes.status).toBe(200)

    const listAfterRes = await fetch(`${baseUrl}/v1/organizations/${createdOrg.id}/roles`, {
      headers: { authorization: `Bearer ${ownerLogin.session.accessToken}` },
    })
    const listedAfter = await listAfterRes.json()
    const customRole = listedAfter.items.find((item: { id: string }) => item.id === createdRole.id)
    expect(customRole).toBeTruthy()
    expect(customRole.editable).toBe(true)
    expect(customRole.permissions.campaigns).toEqual(expect.arrayContaining(["view", "edit"]))
    expect(customRole.permissions.campaigns).not.toContain("publish")
  })

  it("prevents revoking a session that belongs to a different organization", async () => {
    async function registerAndLogin(email: string, orgName: string) {
      const registerRes = await fetch(`${baseUrl}/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "VeryStrongPassword123!",
          fullName: "Tenant Owner",
          organizationName: orgName,
        }),
      })
      const registration = await registerRes.json()
      await fetch(`${baseUrl}/v1/auth/verify-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: registration.verificationToken }),
      })
      const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
      })
      return loginRes.json()
    }

    const tenantA = await registerAndLogin("tenant-a-owner@madar.test", "Tenant A")
    const tenantB = await registerAndLogin("tenant-b-owner@madar.test", "Tenant B")

    const tenantBSessionRes = await fetch(`${baseUrl}/v1/auth/session`, {
      headers: { authorization: `Bearer ${tenantB.session.accessToken}` },
    })
    const tenantBSession = await tenantBSessionRes.json()
    const tenantBSessionId = tenantBSession.currentSessionId

    // Tenant A's owner must not be able to revoke a session belonging to
    // tenant B, even though "owner" has session:revoke permission -- the
    // target session's organization must match the actor's own.
    const crossTenantRevoke = await fetch(`${baseUrl}/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tenantA.session.accessToken}`,
      },
      body: JSON.stringify({ sessionId: tenantBSessionId }),
    })
    expect(crossTenantRevoke.status).toBe(404)

    // Tenant B's session must still be usable after the rejected cross-tenant attempt.
    const stillValidRes = await fetch(`${baseUrl}/v1/identity/profile`, {
      headers: { authorization: `Bearer ${tenantB.session.accessToken}` },
    })
    expect(stillValidRes.status).toBe(200)

    // A user can always revoke their own session, regardless of role.
    const selfRevoke = await fetch(`${baseUrl}/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tenantB.session.accessToken}`,
      },
      body: JSON.stringify({ sessionId: tenantBSessionId }),
    })
    expect(selfRevoke.status).toBe(200)
  })
})
