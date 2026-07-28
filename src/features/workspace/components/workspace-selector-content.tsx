"use client"

import { useMemo, useState } from "react"
import { Building2, Check, Search, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppBadge, AppButton, AppCard, AppInput } from "@/components/app"

import { useWorkspace, useWorkspaceSwitcher } from "../hooks"
import type { Organization, Workspace } from "../types"

interface WorkspaceSelectorContentProps {
  onComplete?: () => void
}

function getOrganizationPlanName(organization: Organization) {
  return organization.subscription?.plan?.name ?? "No Plan"
}

function matchesSearch(organization: Organization, workspace: Workspace, searchTerm: string) {
  const normalizedTerm = searchTerm.trim().toLowerCase()

  if (!normalizedTerm) {
    return true
  }

  return [
    organization.name,
    organization.slug,
    workspace.name,
    workspace.slug,
    workspace.settings.locale,
    workspace.settings.timezone,
  ].some((value) => value.toLowerCase().includes(normalizedTerm))
}

function matchesOrganization(organization: Organization, searchTerm: string) {
  const normalizedTerm = searchTerm.trim().toLowerCase()

  if (!normalizedTerm) {
    return true
  }

  return [organization.name, organization.slug, getOrganizationPlanName(organization)].some(
    (value) => value.toLowerCase().includes(normalizedTerm)
  )
}

export function WorkspaceSelectorContent({ onComplete }: WorkspaceSelectorContentProps) {
  const { currentOrganization, currentWorkspace } = useWorkspace()
  const {
    availableOrganizations,
    availableWorkspaces,
    switchWorkspace,
    createOrganization,
    createWorkspace,
    workspaceStatus,
  } = useWorkspaceSwitcher()

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false)
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceDescription, setWorkspaceDescription] = useState("")
  const [workspaceLanguage, setWorkspaceLanguage] = useState("en-US")
  const [workspaceTimezone, setWorkspaceTimezone] = useState("Asia/Riyadh")
  const [showOrganizationForm, setShowOrganizationForm] = useState(false)
  const [organizationName, setOrganizationName] = useState("")
  const [organizationBusinessType, setOrganizationBusinessType] = useState("Retail")
  const [organizationRegion, setOrganizationRegion] = useState("Middle East")

  const filteredOrganizations = useMemo(
    () =>
      availableOrganizations.filter((organization) => {
        if (matchesOrganization(organization, searchTerm)) {
          return true
        }

        return availableWorkspaces.some(
          (workspace) =>
            workspace.organizationId === organization.id &&
            matchesSearch(organization, workspace, searchTerm)
        )
      }),
    [availableOrganizations, availableWorkspaces, searchTerm]
  )

  const effectiveSelectedOrganizationId = (() => {
    if (selectedOrganizationId) {
      return filteredOrganizations.some(
        (organization) => organization.id === selectedOrganizationId
      )
        ? selectedOrganizationId
        : null
    }

    if (currentOrganization?.id) {
      return filteredOrganizations.some(
        (organization) => organization.id === currentOrganization.id
      )
        ? currentOrganization.id
        : null
    }

    return null
  })()

  const selectedOrganization = useMemo(
    () =>
      filteredOrganizations.find(
        (organization) => organization.id === effectiveSelectedOrganizationId
      ) ?? null,
    [effectiveSelectedOrganizationId, filteredOrganizations]
  )

  const filteredWorkspaces = useMemo(() => {
    if (!selectedOrganization) {
      return []
    }

    return availableWorkspaces.filter(
      (workspace) =>
        workspace.organizationId === selectedOrganization.id &&
        matchesSearch(selectedOrganization, workspace, searchTerm)
    )
  }, [availableWorkspaces, searchTerm, selectedOrganization])

  const activeHighlightedIndex =
    filteredWorkspaces.length > 0 ? Math.min(highlightedIndex, filteredWorkspaces.length - 1) : -1

  async function handleWorkspaceSelect(workspace: Workspace) {
    if (!selectedOrganization) {
      return
    }

    await switchWorkspace({
      organizationId: selectedOrganization.id,
      workspaceId: workspace.id,
    })

    onComplete?.()
  }

  async function handleCreateOrganization() {
    if (!organizationName.trim()) {
      return
    }

    const created = await createOrganization({
      name: organizationName,
      businessType: organizationBusinessType,
      region: organizationRegion,
    })

    setSelectedOrganizationId(created.id)
    setOrganizationName("")
    setOrganizationBusinessType("Retail")
    setOrganizationRegion("Middle East")
    setShowOrganizationForm(false)
  }

  async function handleCreateWorkspace() {
    if (!selectedOrganization || !workspaceName.trim()) {
      return
    }

    await createWorkspace({
      organizationId: selectedOrganization.id,
      name: workspaceName,
      description: workspaceDescription,
      language: workspaceLanguage,
      timezone: workspaceTimezone,
    })

    setWorkspaceName("")
    setWorkspaceDescription("")
    setWorkspaceLanguage("en-US")
    setWorkspaceTimezone("Asia/Riyadh")
    setShowWorkspaceForm(false)
    onComplete?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <AppInput
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        onKeyDown={async (event) => {
          if (!filteredWorkspaces.length) {
            return
          }

          if (event.key === "ArrowDown") {
            event.preventDefault()
            setHighlightedIndex((currentIndex) =>
              currentIndex >= filteredWorkspaces.length - 1 ? 0 : currentIndex + 1
            )
          }

          if (event.key === "ArrowUp") {
            event.preventDefault()
            setHighlightedIndex((currentIndex) =>
              currentIndex <= 0 ? filteredWorkspaces.length - 1 : currentIndex - 1
            )
          }

          if (event.key === "Enter") {
            event.preventDefault()
            const highlightedWorkspace = filteredWorkspaces[activeHighlightedIndex]
            if (highlightedWorkspace) {
              await handleWorkspaceSelect(highlightedWorkspace)
            }
          }
        }}
        aria-label="Search organizations and workspaces"
        className="w-full"
        wrapperClassName="mb-1"
        placeholder="Search organization or workspace"
        startIcon={<Search className="size-4" />}
      />

      <div className="hidden grid-cols-[320px_minmax(0,1fr)] gap-6 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:grid">
        <div className="truncate whitespace-nowrap">Organizations</div>
        <div className="truncate whitespace-nowrap">Workspaces</div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden md:grid-cols-2 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AppCard
          className="flex min-h-0 flex-col overflow-hidden border-foreground/10 shadow-sm"
          title="Organizations"
          subtitle="Switch organizations or create a new one."
          icon={<Building2 className="size-4" />}
          headerClassName="border-b border-border/60 pb-4"
          contentClassName="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1 pt-5"
        >
          <div className="mb-3 flex justify-end">
            <AppButton
              size="sm"
              variant="outline"
              onClick={() => setShowOrganizationForm((current) => !current)}
            >
              + New Organization
            </AppButton>
          </div>

          {showOrganizationForm ? (
            <div className="mb-4 space-y-2 rounded-xl border bg-muted/20 p-3">
              <AppInput
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder="Organization Name"
                aria-label="Organization Name"
              />
              <AppInput
                value={organizationBusinessType}
                onChange={(event) => setOrganizationBusinessType(event.target.value)}
                placeholder="Business Type"
                aria-label="Business Type"
              />
              <AppInput
                value={organizationRegion}
                onChange={(event) => setOrganizationRegion(event.target.value)}
                placeholder="Region"
                aria-label="Region"
              />
              <AppButton size="sm" onClick={() => void handleCreateOrganization()}>
                Create
              </AppButton>
            </div>
          ) : null}

          <div role="list" aria-label="Organizations" className="space-y-3">
            {filteredOrganizations.map((organization) => {
              const isActive = organization.id === effectiveSelectedOrganizationId
              const planName = getOrganizationPlanName(organization)

              return (
                <AppButton
                  key={organization.id}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  className={cn(
                    "h-auto w-full justify-start overflow-hidden rounded-xl px-3 py-3 text-left transition-colors",
                    "[&>span:last-child]:min-w-0 [&>span:last-child]:w-full [&>span:last-child]:flex-1",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    !isActive && "hover:bg-accent/40"
                  )}
                  onClick={() => {
                    setSelectedOrganizationId(organization.id)
                    setHighlightedIndex(0)
                  }}
                  aria-label={`Select organization ${organization.name}`}
                  aria-pressed={isActive}
                  icon={<Building2 className="size-4 shrink-0" />}
                  iconPosition="start"
                >
                  <span className="flex min-w-0 w-full items-center justify-between gap-3">
                    <span className="min-w-0 space-y-1">
                      <span
                        className={cn(
                          "block min-w-0 truncate whitespace-nowrap font-medium",
                          isActive ? "text-primary-foreground" : "text-foreground"
                        )}
                        title={organization.name}
                      >
                        {organization.name}
                      </span>
                      <span
                        className={cn(
                          "block min-w-0 truncate whitespace-nowrap text-xs",
                          isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                        title={organization.slug}
                      >
                        {organization.slug}
                      </span>
                    </span>
                    <AppBadge
                      variant={isActive ? "secondary" : "outline"}
                      className={cn(
                        "max-w-[9.5rem] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap",
                        isActive &&
                          "border-primary-foreground/20 bg-primary-foreground/15 text-primary-foreground"
                      )}
                      title={planName}
                    >
                      {planName}
                    </AppBadge>
                  </span>
                </AppButton>
              )
            })}

            {!filteredOrganizations.length ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
                No organizations match the current search.
              </div>
            ) : null}
          </div>
        </AppCard>

        <AppCard
          className="flex min-h-0 flex-col overflow-hidden border-foreground/10 shadow-sm"
          title="Workspaces"
          subtitle="Use arrow keys to move through results and press Enter to switch."
          icon={<Sparkles className="size-4" />}
          footer={
            <div
              className="truncate whitespace-nowrap text-sm text-muted-foreground"
              title={selectedOrganization?.name}
            >
              {selectedOrganization ? selectedOrganization.name : "Select an organization"}
            </div>
          }
          headerClassName="border-b border-border/60 pb-4"
          contentClassName="min-h-0 flex-1 overflow-y-auto pe-1 pt-5"
        >
          <div className="mb-3 flex justify-end">
            <AppButton
              size="sm"
              variant="outline"
              disabled={!selectedOrganization}
              onClick={() => setShowWorkspaceForm((current) => !current)}
            >
              + New Workspace
            </AppButton>
          </div>

          {showWorkspaceForm ? (
            <div className="mb-4 space-y-2 rounded-xl border bg-muted/20 p-3">
              <AppInput
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace Name"
                aria-label="Workspace Name"
              />
              <AppInput
                value={workspaceDescription}
                onChange={(event) => setWorkspaceDescription(event.target.value)}
                placeholder="Description"
                aria-label="Description"
              />
              <AppInput
                value={workspaceLanguage}
                onChange={(event) => setWorkspaceLanguage(event.target.value)}
                placeholder="Language"
                aria-label="Language"
              />
              <AppInput
                value={workspaceTimezone}
                onChange={(event) => setWorkspaceTimezone(event.target.value)}
                placeholder="Time Zone"
                aria-label="Time Zone"
              />
              <AppButton
                size="sm"
                disabled={!selectedOrganization}
                onClick={() => void handleCreateWorkspace()}
              >
                Create Workspace
              </AppButton>
            </div>
          ) : null}

          {selectedOrganization && filteredWorkspaces.length ? (
            <div role="listbox" aria-label="Workspaces" className="grid gap-3">
              {filteredWorkspaces.map((workspace, index) => {
                const isCurrent = currentWorkspace?.id === workspace.id
                const isHighlighted = index === activeHighlightedIndex

                return (
                  <AppButton
                    key={workspace.id}
                    type="button"
                    disabled={workspaceStatus === "switching"}
                    onClick={() => void handleWorkspaceSelect(workspace)}
                    className={cn(
                      "h-auto w-full justify-start rounded-xl border px-4 py-4 text-left transition-colors",
                      "[&>span:last-child]:min-w-0 [&>span:last-child]:w-full [&>span:last-child]:flex-1",
                      "hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "disabled:cursor-wait disabled:opacity-70",
                      isCurrent ? "border-primary/40 bg-primary/5" : "bg-card",
                      isHighlighted && "ring-2 ring-ring ring-offset-2"
                    )}
                    role="option"
                    aria-label={`Switch to workspace ${workspace.name}`}
                    aria-selected={isHighlighted}
                    aria-current={isCurrent ? "true" : undefined}
                  >
                    <span className="flex min-w-0 w-full flex-col gap-3">
                      <span className="flex min-w-0 items-start justify-between gap-3">
                        <span className="min-w-0 space-y-1">
                          <span
                            className="block truncate whitespace-nowrap text-base font-semibold"
                            title={workspace.name}
                          >
                            {workspace.name}
                          </span>
                          <span
                            className="block truncate whitespace-nowrap text-sm text-muted-foreground"
                            title={workspace.slug}
                          >
                            {workspace.slug}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {isCurrent ? (
                            <AppBadge variant="outline" className="whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <Check className="size-3" />
                                Current
                              </span>
                            </AppBadge>
                          ) : null}
                          <AppBadge variant="secondary" className="whitespace-nowrap">
                            {workspace.settings.locale}
                          </AppBadge>
                        </span>
                      </span>

                      <span className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 truncate whitespace-nowrap text-sm text-muted-foreground">
                          {selectedOrganization.name} · {workspace.settings.timezone}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-medium text-foreground">
                          {isCurrent ? "Current workspace" : "Press Enter to switch"}
                        </span>
                      </span>
                    </span>
                  </AppButton>
                )
              })}
            </div>
          ) : selectedOrganization ? (
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              No workspaces match the current organization and search.
            </div>
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              Choose an organization to view its available workspaces.
            </div>
          )}
        </AppCard>
      </div>
    </div>
  )
}
