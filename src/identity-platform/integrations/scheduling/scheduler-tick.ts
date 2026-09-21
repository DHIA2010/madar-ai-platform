// Entrypoint for one scheduler "tick" -- run periodically (see terraform/modules/scheduler)
// as a one-off ECS task, the same way the deploy pipeline already runs the migration task via
// `aws ecs run-task` with a command override. Each tick: finds every connection_sync_schedules
// row that's due, triggers that connector's real sync() in-process (through the same
// IntegrationProviderRegistry the HTTP routes use), and reschedules it.
//
// Deliberately NOT an HTTP call to this backend's own /v1/integrations/*/sync routes -- those
// require a real user session; a scheduled background tick has no browser session to present,
// so it authenticates as a synthetic actor built from the schedule's own
// organization/workspace/creator instead, and calls the sync service directly.

import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { createIdentityPlatformContainer } from "../../dependency-injection/container"

import { ScheduleFailureAlertRepository } from "./failure-alert-repository"
import { computeNextRunAt } from "./next-run"
import {
  ConnectionSyncScheduleRepository,
  type ConnectionSyncScheduleView,
} from "./schedule-repository"

// Bounds how many due schedules a single tick processes -- keeps one tick's runtime
// predictable regardless of how many connections eventually have schedules. Ticking every
// few minutes means anything left over is simply picked up on the next tick.
const MAX_SCHEDULES_PER_TICK = 25
const SYNC_WINDOW_DAYS = 7

function buildSystemActor(schedule: ConnectionSyncScheduleView): AuthenticatedActor {
  return {
    userId: schedule.createdByUserId,
    sessionId: randomUUID(),
    organizationId: schedule.organizationId,
    workspaceId: schedule.workspaceId,
    roles: ["owner"],
    modulePermissions: [],
  }
}

function isCustomerIdResult(value: unknown): value is { customerId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "customerId" in value &&
    typeof (value as { customerId: unknown }).customerId === "string"
  )
}

async function runTick() {
  const container = createIdentityPlatformContainer()
  const database = container.infrastructure.database
  const integrations = container.infrastructure.integrations

  if (!database || !integrations) {
    console.error("[scheduler-tick] database/integrations unavailable -- nothing to do.")
    return
  }

  const scheduleRepository = new ConnectionSyncScheduleRepository(database)
  const failureAlertRepository = new ScheduleFailureAlertRepository(database)

  const due = await scheduleRepository.listDue(new Date().toISOString(), MAX_SCHEDULES_PER_TICK)
  console.log(`[scheduler-tick] ${due.length} schedule(s) due.`)

  for (const schedule of due) {
    const actor = buildSystemActor(schedule)
    const provider = integrations.find(schedule.providerId)

    if (!provider || !provider.sync || !provider.getSelectedAccount) {
      console.error(
        `[scheduler-tick] provider "${schedule.providerId}" unavailable for schedule ${schedule.id} -- rescheduling without running.`
      )
      await scheduleRepository.recordRunResult({
        id: schedule.id,
        status: "failed",
        nextRunAt: computeNextRunAt(schedule, new Date()).toISOString(),
      })
      continue
    }

    try {
      const selected = await provider.getSelectedAccount(actor, {
        connectionId: schedule.connectionId,
      })
      if (!isCustomerIdResult(selected)) {
        throw new Error("No account selected for this connection.")
      }

      const now = new Date()
      const startDate = new Date(now.getTime() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      const endDate = now.toISOString().slice(0, 10)

      await provider.sync(actor, {
        connectionId: schedule.connectionId,
        customerId: selected.customerId,
        startDate,
        endDate,
        idempotencyKey: `scheduled-${schedule.id}-${now.getTime()}`,
        mode: "incremental",
        trigger: "scheduled",
      })

      await scheduleRepository.recordRunResult({
        id: schedule.id,
        status: "completed",
        nextRunAt: computeNextRunAt(schedule, new Date()).toISOString(),
      })
      console.log(`[scheduler-tick] schedule ${schedule.id} (${schedule.providerId}) completed.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scheduled sync failed."
      console.error(
        `[scheduler-tick] schedule ${schedule.id} (${schedule.providerId}) failed: ${message}`
      )

      await scheduleRepository.recordRunResult({
        id: schedule.id,
        status: "failed",
        nextRunAt: computeNextRunAt(schedule, new Date()).toISOString(),
      })

      if (schedule.notifyOnFailure) {
        await failureAlertRepository.create({
          organizationId: schedule.organizationId,
          workspaceId: schedule.workspaceId,
          providerId: schedule.providerId,
          connectionId: schedule.connectionId,
          scheduleId: schedule.id,
          errorCode: null,
          errorMessage: message,
        })
      }
    }
  }
}

runTick()
  .then(() => {
    console.log("[scheduler-tick] done.")
    process.exit(0)
  })
  .catch((error) => {
    console.error("[scheduler-tick] fatal error:", error)
    process.exit(1)
  })
