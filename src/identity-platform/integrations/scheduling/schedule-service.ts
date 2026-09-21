import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { IntegrationProviderError } from "../provider-error"
import type { IntegrationProviderRegistry } from "../provider-registry"

import { computeNextRunAt } from "./next-run"
import type {
  ConnectionSyncScheduleRepository,
  ConnectionSyncScheduleView,
} from "./schedule-repository"

function assertActorCanManageSchedule(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "SCHEDULE_FORBIDDEN", false, 403)
  }
}

// A schedule's default shape before anything has ever been saved -- matches the settings
// page's own pre-filled defaults (hourly, every day, starting now, organization's timezone),
// but `enabled: false` so a page nobody has actually reviewed and saved never silently starts
// running automatic syncs.
function buildDefaultSchedule(input: {
  providerId: string
  connectionId: string
  organizationId: string
  workspaceId: string | null
  timezone: string
  actorUserId: string
}): ConnectionSyncScheduleView {
  return {
    id: "",
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    providerId: input.providerId,
    connectionId: input.connectionId,
    enabled: false,
    frequencyMinutes: 60,
    customCron: null,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    startTimeLocal: "00:00",
    timezone: input.timezone,
    retryOnConnectionFailure: true,
    retryMaxAttempts: 3,
    notifyOnFailure: true,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    createdByUserId: input.actorUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export interface SaveScheduleInput {
  enabled: boolean
  frequencyMinutes: number | null
  customCron: string | null
  activeDays: number[]
  startTimeLocal: string
  timezone: string
  retryOnConnectionFailure: boolean
  retryMaxAttempts: number
  notifyOnFailure: boolean
}

export class ConnectionSyncScheduleService {
  constructor(
    private readonly repository: ConnectionSyncScheduleRepository,
    private readonly integrations: IntegrationProviderRegistry
  ) {}

  // Verifies the connection is real and actually owned by the actor's org/workspace by
  // resolving it through the connector's own provider (getSelectedAccount already does exactly
  // this ownership check for every connector) -- this is what keeps GET/PUT from being an IDOR
  // against another organization's connection.
  private async resolveOwnedConnection(
    actor: AuthenticatedActor,
    providerId: string,
    connectionId: string
  ) {
    const provider = this.integrations.find(providerId)
    if (!provider || !provider.getSelectedAccount) {
      throw new IntegrationProviderError(
        "Integration provider not found.",
        "SCHEDULE_PROVIDER_NOT_FOUND",
        false,
        404
      )
    }

    // Throws (connection-not-found style IntegrationProviderError) when connectionId doesn't
    // belong to this actor's organization/workspace -- propagates as-is to the route handler.
    await provider.getSelectedAccount(actor, { connectionId })
    return provider
  }

  async getSchedule(
    actor: AuthenticatedActor,
    providerId: string,
    connectionId: string
  ): Promise<ConnectionSyncScheduleView> {
    assertActorCanManageSchedule(actor)
    await this.resolveOwnedConnection(actor, providerId, connectionId)

    const existing = await this.repository.findByConnection(providerId, connectionId)
    if (existing) {
      return existing
    }

    return buildDefaultSchedule({
      providerId,
      connectionId,
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      timezone: "Asia/Riyadh",
      actorUserId: actor.userId,
    })
  }

  async saveSchedule(
    actor: AuthenticatedActor,
    providerId: string,
    connectionId: string,
    input: SaveScheduleInput
  ): Promise<ConnectionSyncScheduleView> {
    assertActorCanManageSchedule(actor)
    await this.resolveOwnedConnection(actor, providerId, connectionId)

    // A disabled schedule still stores a next-run estimate (what WOULD run if re-enabled)
    // rather than null, so the "المزامنة القادمة" card can show it grayed out instead of
    // losing the information entirely; the scheduler tick itself only ever picks up rows
    // where enabled = true (see listDue), so this never causes a disabled schedule to fire.
    const nextRunAt = computeNextRunAt({
      frequencyMinutes: input.frequencyMinutes,
      customCron: input.customCron,
      activeDays: input.activeDays,
      startTimeLocal: input.startTimeLocal,
      timezone: input.timezone,
    }).toISOString()

    return this.repository.upsert({
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      providerId,
      connectionId,
      enabled: input.enabled,
      frequencyMinutes: input.frequencyMinutes,
      customCron: input.customCron,
      activeDays: input.activeDays,
      startTimeLocal: input.startTimeLocal,
      timezone: input.timezone,
      retryOnConnectionFailure: input.retryOnConnectionFailure,
      retryMaxAttempts: input.retryMaxAttempts,
      notifyOnFailure: input.notifyOnFailure,
      nextRunAt,
      actorUserId: actor.userId,
    })
  }
}
