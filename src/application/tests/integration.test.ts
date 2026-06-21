import { beforeEach, describe, expect, it } from "vitest"

import { createIntegrationRepository, resetIntegrationRepositoryState } from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("integration platform", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports connection lifecycle with token lifecycle", async () => {
    const service = createService()

    const created = await service.createConnection({
      workspaceId: "ws_main",
      connectorDefinitionId: "connector_def_commerce_generic",
      connectorId: "connector_commerce_alpha",
      metadata: { environment: "sandbox" },
      credential: {
        type: "oauth",
        payload: { clientId: "cid", clientSecret: "csec" },
      },
    })

    expect(created.payload.status).toBe("draft")
    expect(created.payload.credentialId).toBeTruthy()

    const authorized = await service.authorizeConnector({
      connectionId: created.payload.connectionId,
      authorizationCode: "code_123",
    })

    expect(authorized.payload.status).toBe("authorized")
    const firstAccessToken = authorized.payload.accessToken?.value
    expect(firstAccessToken).toBeTruthy()

    const refreshed = await service.refreshConnection({
      connectionId: created.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).toBeTruthy()
    expect(refreshed.payload.accessToken?.value).not.toBe(firstAccessToken)

    const validated = await service.validateConnection({
      connectionId: created.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const disconnected = await service.disconnectConnection({
      connectionId: created.payload.connectionId,
      reason: "maintenance",
    })

    expect(disconnected.payload.status).toBe("disconnected")
  })

  it("supports sync lifecycle with run, pause, resume, and retry", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_main",
      connectorDefinitionId: "connector_def_ads_generic",
      connectorId: "connector_ads_alpha",
    })

    const run = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "manual",
    })

    expect(run.payload.status).toBe("completed")
    expect(run.payload.result?.recordsWritten).toBeGreaterThan(0)

    const paused = await service.pauseSync({ syncJobId: run.payload.syncJobId })
    expect(paused.status).toBe("paused")

    const resumed = await service.resumeSync({ syncJobId: run.payload.syncJobId })
    expect(resumed.status).toBe("queued")

    const retried = await service.retrySync({ syncJobId: run.payload.syncJobId })
    expect(retried.payload.status).toBe("completed")
    expect(retried.payload.attempt).toBe(2)
  })

  it("provides integration status transitions and sync history", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_reporting",
      connectorDefinitionId: "connector_def_commerce_generic",
      connectorId: "connector_reporting",
    })

    await service.authorizeConnector({ connectionId: connection.payload.connectionId })
    await service.validateConnection({ connectionId: connection.payload.connectionId })

    const syncA = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "manual",
    })
    await service.retrySync({ syncJobId: syncA.payload.syncJobId })
    await service.runSync({ connectionId: connection.payload.connectionId, trigger: "scheduled" })

    const status = await service.getIntegrationStatus({
      connectionId: connection.payload.connectionId,
    })

    expect(status.payload.connection.status).toBe("connected")
    expect(status.payload.recentEvents.length).toBeGreaterThan(0)
    expect(status.payload.latestRun?.status).toBe("completed")

    const history = await service.getSyncHistory({
      connectionId: connection.payload.connectionId,
      limit: 5,
    })

    expect(history.payload.jobs.length).toBeGreaterThan(0)
    expect(history.payload.runs.length).toBeGreaterThan(0)
  })

  it("supports scheduling and connector health monitoring", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_health",
      connectorDefinitionId: "connector_def_ads_generic",
      connectorId: "connector_health",
    })

    const schedule = await service.scheduleSync({
      connectionId: connection.payload.connectionId,
      cron: "*/15 * * * *",
      timezone: "Asia/Riyadh",
      enabled: true,
    })

    expect(schedule.enabled).toBe(true)
    expect(schedule.scheduleId).toBeTruthy()

    await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "scheduled",
    })

    const health = await service.getConnectorHealth({
      connectorId: connection.payload.connectorId,
    })

    expect(["healthy", "degraded", "unhealthy"]).toContain(health.payload.status)
    expect(health.payload.score).toBeGreaterThan(0)
    expect(health.payload.checks.length).toBeGreaterThan(0)
  })
})
