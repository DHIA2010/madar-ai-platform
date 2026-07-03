import type { GoogleAdsEntityType } from "./models"

export interface GoogleAdsSyncRequest {
  connectionId: string
  customerId: string
  startDate: string
  endDate: string
  idempotencyKey: string
  mode?: "full" | "incremental"
}

export interface GoogleAdsSyncRunView {
  id: string
  connectionId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  customerId: string
  dateStart: string
  dateEnd: string
  idempotencyKey: string
  status: "pending" | "running" | "completed" | "failed"
  metrics: Record<string, number>
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface GoogleAdsRecordView {
  id: string
  entityType: GoogleAdsEntityType
  customerId: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
  updatedAt: string
}

export interface GoogleAdsRecordQuery {
  connectionId: string
  customerId: string
  entityType?: GoogleAdsEntityType
  startDate?: string
  endDate?: string
  pageSize?: number
}
