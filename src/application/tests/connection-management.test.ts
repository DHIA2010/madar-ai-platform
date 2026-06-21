import { beforeEach, describe, expect, it } from "vitest"

import { createIntegrationRepository, resetIntegrationRepositoryState } from "@/infrastructure"

import { ConnectionManager } from "../services"

function createManager() {
  return new ConnectionManager(createIntegrationRepository())
}

describe("connection management platform", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("tracks connection lifecycle, registry auto-registration, and history", async () => {
    const manager = createManager()

    const created = await manager.createConnection({
      workspaceId: "ws_cm_1",
      connectorDefinitionId: "connector_def_salla",
      connectorId: "connector_salla_main",
      credential: {
        type: "oauth",
        payload: {
          clientId: "cid",
          clientSecret: "secret",
        },
      },
    })

    const registry = manager.getRegistry()
    expect(registry.connectors).toHaveLength(1)
    expect(registry.connectors[0]?.connectorDefinitionId).toBe("connector_def_salla")

    const connected = await manager.connect({
      connectionId: created.connectionId,
      authorizationCode: "oauth_code_cm",
    })

    expect(connected.status).toBe("valid")

    const state = manager.getState(created.connectionId)
    expect(state?.state).toBe("connected")

    await manager.refreshConnection({ connectionId: created.connectionId })
    await manager.disconnectConnection({ connectionId: created.connectionId })

    const finalState = manager.getState(created.connectionId)
    expect(finalState?.state).toBe("disconnected")

    const history = manager.getHistory(created.connectionId)
    expect(history?.events.some((event) => event.eventType === "connection_created")).toBe(true)
    expect(history?.events.some((event) => event.eventType === "connected")).toBe(true)
    expect(history?.events.some((event) => event.eventType === "token_refreshed")).toBe(true)
    expect(history?.events.some((event) => event.eventType === "disconnected")).toBe(true)
  })

  it("tracks scheduler activity and webhook trigger history", async () => {
    const manager = createManager()

    const created = await manager.createConnection({
      workspaceId: "ws_cm_2",
      connectorDefinitionId: "connector_def_salla",
      connectorId: "connector_salla_sched",
      metadata: {
        sallaWebhookEvent: "inventory.updated",
        sallaWebhookResourceId: "inv-99",
      },
      credential: {
        type: "oauth",
        payload: {
          clientId: "cid",
          clientSecret: "secret",
        },
      },
    })

    await manager.connect({
      connectionId: created.connectionId,
      authorizationCode: "oauth_code_sched",
    })

    await manager.scheduleSync({
      connectionId: created.connectionId,
      cron: "*/10 * * * *",
      timezone: "Asia/Riyadh",
      enabled: true,
    })

    await manager.runSync({
      connectionId: created.connectionId,
      trigger: "manual",
    })

    const webhookRun = await manager.runSync({
      connectionId: created.connectionId,
      trigger: "webhook",
    })

    await manager.pauseSync(webhookRun.syncJobId)
    const pausedState = manager.getState(created.connectionId)
    expect(pausedState?.state).toBe("paused")

    await manager.resumeSync(webhookRun.syncJobId)
    const resumedState = manager.getState(created.connectionId)
    expect(resumedState?.state).toBe("connected")

    const scheduler = manager.getScheduler(created.connectionId)
    expect(scheduler?.manualSyncCount).toBeGreaterThan(0)
    expect(scheduler?.webhookTriggerCount).toBeGreaterThan(0)

    const history = manager.getHistory(created.connectionId)
    expect(history?.events.some((event) => event.eventType === "webhook_triggered")).toBe(true)
    expect(history?.events.some((event) => event.eventType === "sync_completed")).toBe(true)
  })

  it("computes health and metrics read model after sync activity", async () => {
    const manager = createManager()

    const created = await manager.createConnection({
      workspaceId: "ws_cm_3",
      connectorDefinitionId: "connector_def_salla",
      connectorId: "connector_salla_metrics",
      credential: {
        type: "oauth",
        payload: {
          clientId: "cid",
          clientSecret: "secret",
        },
      },
    })

    await manager.connect({
      connectionId: created.connectionId,
      authorizationCode: "oauth_code_metrics",
    })

    const run = await manager.runSync({
      connectionId: created.connectionId,
      trigger: "scheduled",
    })

    await manager.runRetryQueue(created.connectionId)

    const health = manager.getHealth(created.connectionId)
    expect(health?.lastSyncAt).toBeTruthy()
    expect(health?.averageSyncDurationMs).toBeGreaterThan(0)
    expect(["healthy", "degraded", "unhealthy"]).toContain(health?.status)

    const metrics = manager.getMetrics(created.connectionId)
    expect(metrics?.syncSuccessRate).toBeGreaterThanOrEqual(0)
    expect(metrics?.failureRate).toBeGreaterThanOrEqual(0)
    expect(metrics?.averageDurationMs).toBeGreaterThan(0)

    const metricsReadModel = manager.getMetricsReadModel(created.connectionId)
    expect(metricsReadModel?.id).toBe(`connection-metrics:${created.connectionId}`)
    expect(metricsReadModel?.payload.metrics.connectionId).toBe(created.connectionId)

    await manager.pauseSync(run.syncJobId)
    await manager.resumeSync(run.syncJobId)

    const state = manager.getState(created.connectionId)
    expect(state?.state).toBe("connected")
  })
})
