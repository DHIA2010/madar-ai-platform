export const dashboardQueryKeys = {
  all: ["dashboard"] as const,
  package: (workspaceId?: string | null, role?: string | null) =>
    workspaceId || role
      ? ([
          ...dashboardQueryKeys.all,
          "package",
          workspaceId ?? "no-workspace",
          role ?? "no-role",
        ] as const)
      : ([...dashboardQueryKeys.all, "package"] as const),
} as const
