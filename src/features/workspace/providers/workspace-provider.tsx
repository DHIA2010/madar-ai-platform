"use client"

import { useCallback, useEffect, useMemo } from "react"

import { AppEmpty, AppLoading } from "@/components/app"

import { buildTenantContext } from "../mappers/workspace.mapper"
import { useWorkspaceStore, WorkspaceContextStore } from "../state"
import type {
  Organization,
  OrganizationCreatePayload,
  Workspace,
  WorkspaceCreatePayload,
  WorkspaceSelectionPayload,
} from "../types"

import { useApplicationServices } from "@/application"

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function withUniqueId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function mergeById<T extends { id: string }>(base: T[], additions: T[]): T[] {
  const merged = new Map<string, T>()
  for (const item of base) {
    merged.set(item.id, item)
  }
  for (const item of additions) {
    merged.set(item.id, item)
  }
  return [...merged.values()]
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { workspaceApplicationService } = useApplicationServices()

  const currentOrganization = useWorkspaceStore((state) => state.currentOrganization)
  const currentWorkspace = useWorkspaceStore((state) => state.currentWorkspace)
  const availableOrganizations = useWorkspaceStore((state) => state.availableOrganizations)
  const availableWorkspaces = useWorkspaceStore((state) => state.availableWorkspaces)
  const customOrganizations = useWorkspaceStore((state) => state.customOrganizations)
  const customWorkspaces = useWorkspaceStore((state) => state.customWorkspaces)
  const workspaceStatus = useWorkspaceStore((state) => state.workspaceStatus)
  const setCurrentOrganization = useWorkspaceStore((state) => state.setCurrentOrganization)
  const setCurrentWorkspace = useWorkspaceStore((state) => state.setCurrentWorkspace)
  const setAvailableOrganizations = useWorkspaceStore((state) => state.setAvailableOrganizations)
  const setAvailableWorkspaces = useWorkspaceStore((state) => state.setAvailableWorkspaces)
  const addCustomOrganization = useWorkspaceStore((state) => state.addCustomOrganization)
  const addCustomWorkspace = useWorkspaceStore((state) => state.addCustomWorkspace)
  const setWorkspaceStatus = useWorkspaceStore((state) => state.setWorkspaceStatus)

  useEffect(() => {
    let cancelled = false

    setWorkspaceStatus("loading")

    void workspaceApplicationService
      .resolveWorkspaceContext({
        organizationId: null,
        workspaceId: null,
      })
      .then((context) => {
        if (cancelled) {
          return
        }

        const mergedOrganizations = mergeById(context.availableOrganizations, customOrganizations)
        const mergedWorkspaces = mergeById(context.availableWorkspaces, customWorkspaces)

        setAvailableOrganizations(mergedOrganizations)
        setAvailableWorkspaces(mergedWorkspaces)

        const nextOrganization =
          mergedOrganizations.find((organization) => organization.id === currentOrganization?.id) ??
          context.currentOrganization ??
          mergedOrganizations[0] ??
          null
        const nextWorkspace =
          mergedWorkspaces.find((workspace) => workspace.id === currentWorkspace?.id) ??
          context.currentWorkspace ??
          mergedWorkspaces.find((workspace) => workspace.organizationId === nextOrganization?.id) ??
          mergedWorkspaces[0] ??
          null

        setCurrentOrganization(nextOrganization)
        setCurrentWorkspace(nextWorkspace)
        setWorkspaceStatus("ready")
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceStatus("error")
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    currentOrganization?.id,
    currentWorkspace?.id,
    customOrganizations,
    customWorkspaces,
    setAvailableOrganizations,
    setAvailableWorkspaces,
    setCurrentOrganization,
    setCurrentWorkspace,
    setWorkspaceStatus,
    workspaceApplicationService,
  ])

  const switchWorkspace = useCallback(
    async (payload: WorkspaceSelectionPayload) => {
      setWorkspaceStatus("switching")

      const localWorkspace = customWorkspaces.find(
        (workspace) => workspace.id === payload.workspaceId
      )
      const localOrganization = [...availableOrganizations, ...customOrganizations].find(
        (organization) => organization.id === payload.organizationId
      )

      if (localWorkspace && localOrganization) {
        setCurrentOrganization(localOrganization)
        setCurrentWorkspace(localWorkspace)
        setWorkspaceStatus("ready")
        return
      }

      try {
        const nextWorkspace = await workspaceApplicationService.switchWorkspace(payload)
        const nextOrganization = [...availableOrganizations, ...customOrganizations].find(
          (organization) => organization.id === payload.organizationId
        )

        setCurrentOrganization(nextOrganization ?? null)
        setCurrentWorkspace(nextWorkspace)
        setWorkspaceStatus("ready")
      } catch (error) {
        setWorkspaceStatus("error")
        throw error
      }
    },
    [
      availableOrganizations,
      customOrganizations,
      customWorkspaces,
      setCurrentOrganization,
      setCurrentWorkspace,
      setWorkspaceStatus,
      workspaceApplicationService,
    ]
  )

  const createOrganization = useCallback(
    async (payload: OrganizationCreatePayload) => {
      const nowIso = new Date().toISOString()
      const slug = toSlug(payload.name)
      const organization: Organization = {
        id: withUniqueId("org_local"),
        name: payload.name.trim(),
        slug: slug || withUniqueId("organization"),
        subscription: {
          id: withUniqueId("sub_local"),
          status: "active",
          seats: 1,
          renewsAt: nowIso,
          plan: {
            id: withUniqueId("plan_local"),
            code: payload.businessType.trim().toLowerCase().replace(/\s+/g, "-") || "custom",
            name: `${payload.businessType.trim() || "Custom"} (${payload.region.trim() || "Global"})`,
            tier: "starter",
            workspaceLimit: 25,
            memberLimit: 100,
          },
        },
      }

      addCustomOrganization(organization)
      setAvailableOrganizations(mergeById(availableOrganizations, [organization]))
      setCurrentOrganization(organization)
      return organization
    },
    [
      addCustomOrganization,
      availableOrganizations,
      setAvailableOrganizations,
      setCurrentOrganization,
    ]
  )

  const createWorkspace = useCallback(
    async (payload: WorkspaceCreatePayload) => {
      const workspace: Workspace = {
        id: withUniqueId("ws_local"),
        organizationId: payload.organizationId,
        name: payload.name.trim(),
        slug: toSlug(payload.name) || withUniqueId("workspace"),
        settings: {
          locale: payload.language.trim() || "en-US",
          timezone: payload.timezone.trim() || "UTC",
          currency: "USD",
          dateFormat: "dd/MM/yyyy",
        },
      }

      const nextOrganization = [...availableOrganizations, ...customOrganizations].find(
        (organization) => organization.id === payload.organizationId
      )

      addCustomWorkspace(workspace)
      setAvailableWorkspaces(mergeById(availableWorkspaces, [workspace]))
      setCurrentOrganization(nextOrganization ?? null)
      setCurrentWorkspace(workspace)
      setWorkspaceStatus("ready")
      return workspace
    },
    [
      addCustomWorkspace,
      availableOrganizations,
      availableWorkspaces,
      customOrganizations,
      setAvailableWorkspaces,
      setCurrentOrganization,
      setCurrentWorkspace,
      setWorkspaceStatus,
    ]
  )

  const tenantContext = useMemo(
    () => buildTenantContext(currentOrganization, currentWorkspace),
    [currentOrganization, currentWorkspace]
  )

  const value = useMemo(
    () => ({
      currentWorkspace,
      currentOrganization,
      availableWorkspaces,
      availableOrganizations,
      tenantContext,
      workspaceStatus,
      switchWorkspace,
      createOrganization,
      createWorkspace,
    }),
    [
      availableOrganizations,
      availableWorkspaces,
      createOrganization,
      createWorkspace,
      currentOrganization,
      currentWorkspace,
      switchWorkspace,
      tenantContext,
      workspaceStatus,
    ]
  )

  if (workspaceStatus === "loading") {
    return <AppLoading variant="page" />
  }

  if (workspaceStatus === "error") {
    return (
      <AppEmpty
        title="Workspace context unavailable"
        description="The tenant context could not be restored from mock services."
      />
    )
  }

  return <WorkspaceContextStore.Provider value={value}>{children}</WorkspaceContextStore.Provider>
}
