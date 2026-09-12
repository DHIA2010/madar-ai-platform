export interface ListAuditLogsQuery {
  page: number
  pageSize: number
  // Narrows to one member's own events -- the user profile drawer's real "Recent Activity" card.
  actorUserId?: string
}

export interface ListOrganizationsQuery {
  page: number
  pageSize: number
  status?: "active" | "archived" | "deleted"
  sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
}

export interface ListInvitationsQuery {
  page: number
  pageSize: number
  status?: "pending" | "accepted" | "declined" | "canceled" | "expired"
}
