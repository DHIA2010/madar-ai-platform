export const workspaceQueryKeys = {
  all: ["workspace"] as const,
  organizations: () => [...workspaceQueryKeys.all, "organizations"] as const,
  workspaces: (organizationId?: string) =>
    organizationId
      ? ([...workspaceQueryKeys.all, "workspaces", organizationId] as const)
      : ([...workspaceQueryKeys.all, "workspaces"] as const),
  currentWorkspace: (organizationId?: string, workspaceId?: string) =>
    organizationId && workspaceId
      ? ([...workspaceQueryKeys.all, "current-workspace", organizationId, workspaceId] as const)
      : ([...workspaceQueryKeys.all, "current-workspace"] as const),
} as const
