"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AppError } from "@/lib/app-errors"

import { AppEmpty, AppLoading } from "@/components/app"

import { useAuth } from "@/features/authentication"

import { emitWorkspaceLifecycleChanged } from "../events"
import { buildTenantContext } from "../mappers/workspace.mapper"
import { useWorkspaceStore, WorkspaceContextStore } from "../state"
import type {
  OrganizationCreatePayload,
  WorkspaceCreatePayload,
  WorkspaceSelectionPayload,
} from "../types"

import { useApplicationServices } from "@/application"

function getConfigurationErrorMessage(error: unknown): string | null {
  if (!(error instanceof AppError)) {
    return null
  }

  if (error.code !== "configuration_error" && error.code !== "repository_configuration_error") {
    return null
  }

  return error.message || "Runtime configuration is invalid."
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
  const { authStatus } = useAuth()
  const [configurationError, setConfigurationError] = useState<string | null>(null)

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
    if (authStatus !== "authenticated") {
      setWorkspaceStatus("idle")
      return
    }

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
      .catch((error) => {
        if (!cancelled) {
          const message = getConfigurationErrorMessage(error)
          if (message) {
            setConfigurationError(message)
          }
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
    authStatus,
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
      setConfigurationError(null)

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
        emitWorkspaceLifecycleChanged()
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
        emitWorkspaceLifecycleChanged()
      } catch (error) {
        const message = getConfigurationErrorMessage(error)
        if (message) {
          setConfigurationError(message)
        }
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
      const organization = await workspaceApplicationService.createOrganization({
        name: payload.name.trim(),
        metadata: {
          businessType: payload.businessType.trim(),
          region: payload.region.trim(),
        },
      })

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
      workspaceApplicationService,
    ]
  )

  const createWorkspace = useCallback(
    async (payload: WorkspaceCreatePayload) => {
      const workspace = await workspaceApplicationService.createWorkspace({
        organizationId: payload.organizationId,
        name: payload.name.trim(),
        metadata: payload.description.trim()
          ? { description: payload.description.trim() }
          : undefined,
        settings: {
          locale: payload.language.trim() || "en-US",
          timezone: payload.timezone.trim() || "UTC",
        },
      })

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
      workspaceApplicationService,
    ]
  )

  const updateOrganization = useCallback(
    async (organizationId: string, payload: { name?: string }) => {
      const organization = await workspaceApplicationService.updateOrganization(
        organizationId,
        payload
      )
      setAvailableOrganizations(mergeById(availableOrganizations, [organization]))
      if (currentOrganization?.id === organizationId) {
        setCurrentOrganization(organization)
      }
      return organization
    },
    [
      availableOrganizations,
      currentOrganization?.id,
      setAvailableOrganizations,
      setCurrentOrganization,
      workspaceApplicationService,
    ]
  )

  const archiveOrganization = useCallback(
    async (organizationId: string) => {
      const organization = await workspaceApplicationService.archiveOrganization(organizationId)
      setAvailableOrganizations(mergeById(availableOrganizations, [organization]))
      return organization
    },
    [availableOrganizations, setAvailableOrganizations, workspaceApplicationService]
  )

  const restoreOrganization = useCallback(
    async (organizationId: string) => {
      const organization = await workspaceApplicationService.restoreOrganization(organizationId)
      setAvailableOrganizations(mergeById(availableOrganizations, [organization]))
      return organization
    },
    [availableOrganizations, setAvailableOrganizations, workspaceApplicationService]
  )

  const updateWorkspace = useCallback(
    async (workspaceId: string, payload: { name?: string }) => {
      const workspace = await workspaceApplicationService.updateWorkspace(workspaceId, payload)
      setAvailableWorkspaces(mergeById(availableWorkspaces, [workspace]))
      if (currentWorkspace?.id === workspaceId) {
        setCurrentWorkspace(workspace)
      }
      return workspace
    },
    [
      availableWorkspaces,
      currentWorkspace?.id,
      setAvailableWorkspaces,
      setCurrentWorkspace,
      workspaceApplicationService,
    ]
  )

  const archiveWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = await workspaceApplicationService.archiveWorkspace(workspaceId)
      setAvailableWorkspaces(mergeById(availableWorkspaces, [workspace]))
      return workspace
    },
    [availableWorkspaces, setAvailableWorkspaces, workspaceApplicationService]
  )

  const restoreWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = await workspaceApplicationService.restoreWorkspace(workspaceId)
      setAvailableWorkspaces(mergeById(availableWorkspaces, [workspace]))
      return workspace
    },
    [availableWorkspaces, setAvailableWorkspaces, workspaceApplicationService]
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
      updateOrganization,
      archiveOrganization,
      restoreOrganization,
      updateWorkspace,
      archiveWorkspace,
      restoreWorkspace,
    }),
    [
      archiveOrganization,
      archiveWorkspace,
      availableOrganizations,
      availableWorkspaces,
      createOrganization,
      createWorkspace,
      currentOrganization,
      currentWorkspace,
      restoreOrganization,
      restoreWorkspace,
      switchWorkspace,
      tenantContext,
      updateOrganization,
      updateWorkspace,
      workspaceStatus,
    ]
  )

  return (
    <WorkspaceContextStore.Provider value={value}>
      {authStatus === "authenticated" && workspaceStatus === "loading" && (
        <AppLoading variant="page" />
      )}
      {authStatus === "authenticated" && workspaceStatus === "error" && (
        <AppEmpty
          title="Workspace context unavailable"
          description={
            configurationError ??
            "The tenant context could not be restored from configured services."
          }
        />
      )}
      {(authStatus !== "authenticated" || workspaceStatus !== "loading") &&
        workspaceStatus !== "error" &&
        children}
    </WorkspaceContextStore.Provider>
  )
}
