import { randomUUID } from "node:crypto"

import { cancelSyncJob, completeSyncJob, createSyncJob, failSyncJob, updateSyncJobProgress } from "../../domain/entities"
import type { SyncJobRepository } from "../../domain/repositories"
import { INTEGRATION_ERRORS } from "../../application/errors/IntegrationPlatformError"

export class SyncEngine {
  constructor(private readonly jobs: SyncJobRepository, private readonly now: () => string = () => new Date().toISOString()) {}

  async start(input: { connectionId: string; connectorId: string; mode: "full" | "incremental"; metadata?: Record<string, unknown> }) {
    const job = createSyncJob({ 
      id: randomUUID(),
      connectionId: input.connectionId, 
      connectorId: input.connectorId, 
      mode: input.mode, 
      metadata: input.metadata ?? {}, 
      maxRetries: 3, 
      scheduledAt: this.now(),
      nextAttemptAt: null,
    })
    await this.jobs.save(job)
    return job
  }

  async progress(jobId: string, progress: number) {
    const job = await this.jobs.findById(jobId)
    if (!job) throw INTEGRATION_ERRORS.notFound("Sync job")
    const next = updateSyncJobProgress(job, progress, this.now())
    await this.jobs.save(next)
    return next
  }

  async complete(jobId: string) {
    const job = await this.jobs.findById(jobId)
    if (!job) throw INTEGRATION_ERRORS.notFound("Sync job")
    const next = completeSyncJob(job, this.now())
    await this.jobs.save(next)
    return next
  }

  async fail(jobId: string, error: string) {
    const job = await this.jobs.findById(jobId)
    if (!job) throw INTEGRATION_ERRORS.notFound("Sync job")
    const next = failSyncJob(job, error, this.now())
    await this.jobs.save(next)
    return next
  }

  async cancel(jobId: string, reason: string) {
    const job = await this.jobs.findById(jobId)
    if (!job) throw INTEGRATION_ERRORS.notFound("Sync job")
    const next = cancelSyncJob(job, reason, this.now())
    await this.jobs.save(next)
    return next
  }
}
