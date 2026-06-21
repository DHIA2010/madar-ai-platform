export const queryKeys = {
  all: ["madar"] as const,
  config: () => [...queryKeys.all, "config"] as const,
  environment: () => [...queryKeys.all, "environment"] as const,
  session: () => [...queryKeys.all, "session"] as const,
  user: (userId?: string) =>
    userId ? ([...queryKeys.all, "user", userId] as const) : ([...queryKeys.all, "user"] as const),
  workspace: (workspaceId?: string) =>
    workspaceId
      ? ([...queryKeys.all, "workspace", workspaceId] as const)
      : ([...queryKeys.all, "workspace"] as const),
  permissions: (workspaceId?: string) =>
    workspaceId
      ? ([...queryKeys.all, "permissions", workspaceId] as const)
      : ([...queryKeys.all, "permissions"] as const),
  featureFlags: () => [...queryKeys.all, "feature-flags"] as const,
  entity: (entityName: string, id?: string) =>
    id
      ? ([...queryKeys.all, "entity", entityName, id] as const)
      : ([...queryKeys.all, "entity", entityName] as const),
  collection: (entityName: string, scope?: string) =>
    scope
      ? ([...queryKeys.all, "collection", entityName, scope] as const)
      : ([...queryKeys.all, "collection", entityName] as const),
  search: (scope?: string) =>
    scope
      ? ([...queryKeys.all, "search", scope] as const)
      : ([...queryKeys.all, "search"] as const),
  files: () => [...queryKeys.all, "files"] as const,
  notifications: () => [...queryKeys.all, "notifications"] as const,
  metadata: () => [...queryKeys.all, "metadata"] as const,
} as const
