export interface DashboardLoaded {
  type: "DashboardLoaded"
  dashboardId: string
  occurredAt: string
}

export interface DashboardRefreshRequested {
  type: "DashboardRefreshRequested"
  dashboardId: string
  occurredAt: string
}

export interface ReadModelBuilt {
  type: "ReadModelBuilt"
  readModelId: string
  occurredAt: string
}

export interface WorkspaceResolved {
  type: "WorkspaceResolved"
  workspaceId: string | null
  occurredAt: string
}

export interface SessionRestored {
  type: "SessionRestored"
  userId: string | null
  occurredAt: string
}

export interface ReadModelExpired {
  type: "ReadModelExpired"
  readModelId: string
  occurredAt: string
}
