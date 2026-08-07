export const administrationQueryKeys = {
  all: ["administration"] as const,
  auditLogs: (page: number, pageSize: number) =>
    [...administrationQueryKeys.all, "audit-logs", page, pageSize] as const,
  users: (organizationId: string | null | undefined) =>
    [...administrationQueryKeys.all, "users", organizationId ?? "none"] as const,
  invitations: (organizationId: string | null | undefined) =>
    [...administrationQueryKeys.all, "invitations", organizationId ?? "none"] as const,
  sessions: () => [...administrationQueryKeys.all, "sessions"] as const,
  teams: (organizationId: string | null | undefined) =>
    [...administrationQueryKeys.all, "teams", organizationId ?? "none"] as const,
  roles: (organizationId: string | null | undefined) =>
    [...administrationQueryKeys.all, "roles", organizationId ?? "none"] as const,
} as const
