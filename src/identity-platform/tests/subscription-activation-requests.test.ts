import { describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import type { RequestContext } from "../types"

const context: RequestContext = {
  requestId: "request-sub-1",
  correlationId: "correlation-sub-1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  headers: {},
}

const PLATFORM_ADMIN_EMAIL = "staff@madar.test"

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
      platformAdminEmails: [PLATFORM_ADMIN_EMAIL],
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

describe("subscription activation requests", () => {
  it("lets a customer submit a request and a platform admin approve it, flipping the organization's settings", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "activation-customer@madar.test")
    const staff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "ecommerce",
        planTier: "growth",
        attachmentUrl: "https://storage.test/subscription-receipts/receipt.png",
        attachmentContentType: "image/png",
      },
      context
    )
    expect(request.status).toBe("pending")

    // Customer can see their own pending request.
    const mine = await container.queries.listMyOrganizationSubscriptionRequests(
      customer.actor,
      organizationId
    )
    expect(mine.map((entry) => entry.id)).toContain(request.id)

    // A non-platform-admin (even the organization's own owner) cannot approve/reject.
    await expect(
      container.commands.approveSubscriptionActivationRequest(customer.actor, request.id, context)
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })
    await expect(
      container.queries.listSubscriptionActivationRequests(customer.actor)
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })

    const approved = await container.commands.approveSubscriptionActivationRequest(
      staff.actor,
      request.id,
      context
    )
    expect(approved.status).toBe("approved")

    const organization = await container.queries.getOrganization(customer.actor, organizationId)
    expect(organization.settings.ecommerceEnabled).toBe(true)
    expect(organization.settings.currentPlanTier).toBe("growth")
  })

  it("rejects a request with a reason and refuses a duplicate pending request for the same application", async () => {
    const container = createContainer()
    const customer = await registerAndLogin(container, "activation-customer-2@madar.test")
    const staff = await registerAndLogin(container, `second-${PLATFORM_ADMIN_EMAIL}`)
    // Only the configured allowlist email counts -- re-register it as platform admin for this test.
    const realStaff = await registerAndLogin(container, PLATFORM_ADMIN_EMAIL)
    const organizationId = customer.actor.organizationId

    const request = await container.commands.requestApplicationActivation(
      customer.actor,
      organizationId,
      {
        application: "advertising",
        planTier: "starter",
        attachmentUrl: "https://storage.test/subscription-receipts/receipt-2.png",
        attachmentContentType: "application/pdf",
      },
      context
    )

    // A second request for the same application while one is still pending is refused.
    await expect(
      container.commands.requestApplicationActivation(
        customer.actor,
        organizationId,
        {
          application: "advertising",
          planTier: "pro",
          attachmentUrl: "https://storage.test/subscription-receipts/receipt-3.png",
          attachmentContentType: "image/jpeg",
        },
        context
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })

    // staff.actor (not on the allowlist) cannot reject; realStaff.actor can.
    await expect(
      container.commands.rejectSubscriptionActivationRequest(
        staff.actor,
        request.id,
        { reason: "not allowed" },
        context
      )
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })

    const rejected = await container.commands.rejectSubscriptionActivationRequest(
      realStaff.actor,
      request.id,
      { reason: "الإيصال غير واضح" },
      context
    )
    expect(rejected.status).toBe("rejected")
    expect(rejected.rejectionReason).toBe("الإيصال غير واضح")

    const organization = await container.queries.getOrganization(customer.actor, organizationId)
    expect(organization.settings.advertisingEnabled).not.toBe(true)
  })
})
