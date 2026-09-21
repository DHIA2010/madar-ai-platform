"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import {
  Building2,
  Check,
  FlaskConical,
  Globe,
  Home,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { toAppError } from "@/lib/app-errors"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppAvatar,
  AppAvatarFallback,
  AppBadge,
  AppButton,
  AppConfirmDialog,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppInput,
} from "@/components/app"

import { emitWorkspaceLifecycleChanged } from "../events"
import { useWorkspace, useWorkspaceSwitcher } from "../hooks"
import type { Organization, Workspace } from "../types"

import { useApplicationServices } from "@/application/context"
import type { AdministrationUserDto } from "@/application/contracts/administration.contracts"

interface WorkspaceSelectorContentProps {
  onComplete?: () => void
}

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const ROW_CARD = "rounded-[14px] border border-[#e8edf3] bg-white"
const PAGE_SIZE = 5

// Purely a decorative accent so the workspace list doesn't read as one flat gray column -- there
// is no real "workspace type" field anywhere in this data model, so this is never rendered as a
// claim about the workspace (no label says "retail" or "lab"), just a stable per-id color/icon.
const WORKSPACE_ACCENTS: Array<{ icon: LucideIcon; bg: string; fg: string }> = [
  { icon: Home, bg: "#eff6ff", fg: "#2563eb" },
  { icon: Store, bg: "#fdf2f8", fg: "#db2777" },
  { icon: ShoppingBag, bg: "#fff7ed", fg: "#ea580c" },
  { icon: ShoppingCart, bg: "#f0fdf4", fg: "#16a34a" },
  { icon: FlaskConical, bg: "#faf5ff", fg: "#9333ea" },
  { icon: Building2, bg: "#f0fdfa", fg: "#0d9488" },
]

const ORG_COLORS = ["#2563eb", "#db2777", "#9333ea", "#ea580c", "#16a34a", "#0d9488", "#4f46e5"]

function hashId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash
}

function accentFor(workspaceId: string) {
  return WORKSPACE_ACCENTS[hashId(workspaceId) % WORKSPACE_ACCENTS.length]
}

function orgColorFor(organizationId: string) {
  return ORG_COLORS[hashId(organizationId) % ORG_COLORS.length]
}

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "؟"
}

function matchesWorkspaceSearch(workspace: Workspace, searchTerm: string) {
  const normalizedTerm = searchTerm.trim().toLowerCase()
  if (!normalizedTerm) return true
  return [workspace.name, workspace.slug, workspace.metadata?.city, workspace.settings.timezone]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedTerm))
}

function matchesOrganizationSearch(organization: Organization, searchTerm: string) {
  const normalizedTerm = searchTerm.trim().toLowerCase()
  if (!normalizedTerm) return true
  return [organization.name, organization.slug]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalizedTerm))
}

const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatDate(value: string | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date)
}

export function WorkspaceSelectorContent({ onComplete }: WorkspaceSelectorContentProps) {
  const router = useRouter()
  const { currentWorkspace } = useWorkspace()
  const {
    availableOrganizations,
    availableWorkspaces,
    switchWorkspace,
    createOrganization,
    updateOrganization,
    archiveWorkspace,
    restoreWorkspace,
    workspaceStatus,
  } = useWorkspaceSwitcher()

  const { administrationApplicationService } = useApplicationServices()

  const [workspaceSearch, setWorkspaceSearch] = useState("")
  const [organizationSearch, setOrganizationSearch] = useState("")
  // null = "كل المنظمات" -- the default view, matching every workspace the account can reach.
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [showOrganizationForm, setShowOrganizationForm] = useState(false)
  const [organizationName, setOrganizationName] = useState("")
  const [editingOrganizationId, setEditingOrganizationId] = useState<string | null>(null)
  const [editingOrganizationName, setEditingOrganizationName] = useState("")
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [archiveConfirmTarget, setArchiveConfirmTarget] = useState<{
    id: string
    name: string
  } | null>(null)

  const selectedOrganization = useMemo(
    () =>
      selectedOrganizationId
        ? (availableOrganizations.find(
            (organization) => organization.id === selectedOrganizationId
          ) ?? null)
        : null,
    [availableOrganizations, selectedOrganizationId]
  )

  // Real member data is only cheap to fetch for one organization at a time -- so the per-workspace
  // avatar stack only renders while a single real organization is selected, never in the "كل
  // المنظمات" aggregate view (which would need one fetch per organization shown).
  const selectedOrganizationForUsers = selectedOrganization?.id
  const { data: usersData } = useQuery<AdministrationUserDto[]>({
    queryKey: ["workspace-switcher", "members", selectedOrganizationForUsers],
    queryFn: async () => {
      try {
        return await administrationApplicationService.getUsers({
          organizationId: selectedOrganizationForUsers as string,
        })
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled: Boolean(selectedOrganizationForUsers),
    staleTime: 1000 * 30,
  })
  const employees = useMemo(() => usersData ?? [], [usersData])

  const filteredOrganizations = useMemo(
    () =>
      availableOrganizations.filter((organization) =>
        matchesOrganizationSearch(organization, organizationSearch)
      ),
    [availableOrganizations, organizationSearch]
  )

  const relevantWorkspaces = useMemo(
    () =>
      selectedOrganizationId
        ? availableWorkspaces.filter(
            (workspace) => workspace.organizationId === selectedOrganizationId
          )
        : availableWorkspaces,
    [availableWorkspaces, selectedOrganizationId]
  )

  const searchedWorkspaces = useMemo(
    () =>
      relevantWorkspaces.filter((workspace) => matchesWorkspaceSearch(workspace, workspaceSearch)),
    [relevantWorkspaces, workspaceSearch]
  )

  const totalPages = Math.max(1, Math.ceil(searchedWorkspaces.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedWorkspaces = searchedWorkspaces.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  useEffect(() => {
    setPage(1)
  }, [selectedOrganizationId, workspaceSearch])

  function organizationLabel(workspace: Workspace) {
    return availableOrganizations.find(
      (organization) => organization.id === workspace.organizationId
    )?.name
  }

  function membersFor(workspace: Workspace) {
    return employees.filter((employee) => employee.workspaceIds.includes(workspace.id))
  }

  async function handleWorkspaceSelect(workspace: Workspace) {
    await switchWorkspace({ organizationId: workspace.organizationId, workspaceId: workspace.id })
    onComplete?.()
  }

  function goToCreateWorkspace() {
    router.push(`${ROUTES.settingsWorkspaces}?new=1`)
    onComplete?.()
  }

  function goToEditWorkspace(workspace: Workspace) {
    router.push(`${ROUTES.settingsWorkspaces}?edit=${workspace.id}`)
    onComplete?.()
  }

  async function handleCreateOrganization() {
    if (!organizationName.trim()) return
    const created = await createOrganization({
      name: organizationName,
      businessType: "تجزئة",
      region: "الشرق الأوسط",
    })
    setSelectedOrganizationId(created.id)
    setOrganizationName("")
    setShowOrganizationForm(false)
  }

  function startEditOrganization(organization: Organization) {
    setEditingOrganizationId(organization.id)
    setEditingOrganizationName(organization.name)
  }

  async function handleUpdateOrganization(organizationId: string) {
    if (!editingOrganizationName.trim()) return
    setPendingActionId(organizationId)
    try {
      await updateOrganization(organizationId, { name: editingOrganizationName.trim() })
      toast.success("تم تحديث اسم المنظمة.")
      setEditingOrganizationId(null)
    } catch {
      toast.error("تعذر تحديث اسم المنظمة.")
    } finally {
      setPendingActionId(null)
    }
  }

  async function handleArchiveRestoreWorkspace(workspace: Workspace) {
    if (workspace.status === "archived") {
      setPendingActionId(workspace.id)
      try {
        await restoreWorkspace(workspace.id)
        toast.success("تم تنشيط مساحة العمل.")
        emitWorkspaceLifecycleChanged()
      } catch {
        toast.error("تعذر تنشيط مساحة العمل.")
      } finally {
        setPendingActionId(null)
      }
      return
    }
    setArchiveConfirmTarget({ id: workspace.id, name: workspace.name })
  }

  async function confirmArchiveWorkspace() {
    if (!archiveConfirmTarget) return
    const { id } = archiveConfirmTarget
    setPendingActionId(id)
    try {
      await archiveWorkspace(id)
      toast.success("تم إيقاف مساحة العمل.")
      setArchiveConfirmTarget(null)
      emitWorkspaceLifecycleChanged()
    } catch {
      toast.error("تعذر إيقاف مساحة العمل.")
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <div
      dir="rtl"
      className="grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      {/* Organizations panel */}
      <aside className={cn(ROW_CARD, "flex min-h-0 flex-col overflow-hidden p-4")}>
        <h3 className={cn("text-[13.5px] font-bold", HEADING)}>المنظمات</h3>
        <p className={cn("mt-0.5 text-[11px]", MUTED)}>اختر منظمة لعرض مساحات العمل الخاصة بها.</p>

        <AppInput
          type="search"
          value={organizationSearch}
          onChange={(event) => setOrganizationSearch(event.target.value)}
          placeholder="البحث في المنظمات..."
          aria-label="البحث في المنظمات"
          className="mt-3 h-9 rounded-[10px] border-[#e8edf3] bg-white text-[12px] placeholder:text-[#8098b4]"
          startIcon={<Search className="size-3.5" />}
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pe-1">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedOrganizationId(null)}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-start transition-colors",
                selectedOrganizationId === null
                  ? "border border-[#c7d9ff] bg-[#eff6ff]"
                  : "border border-transparent hover:bg-[#f8faff]"
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
                <Globe className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[12.5px] font-bold", HEADING)}>
                  كل المنظمات
                </span>
                <span className={cn("block truncate text-[10.5px]", MUTED)}>
                  عرض جميع مساحات العمل في كافة المنظمات
                </span>
              </span>
              <span className={cn("shrink-0 text-[13px] font-extrabold", HEADING)}>
                {availableWorkspaces.length}
              </span>
            </button>

            {filteredOrganizations.map((organization) => {
              const count = availableWorkspaces.filter(
                (workspace) => workspace.organizationId === organization.id
              ).length
              const isSelected = selectedOrganizationId === organization.id

              if (editingOrganizationId === organization.id) {
                return (
                  <div
                    key={organization.id}
                    className="flex items-center gap-1.5 rounded-[10px] border border-[#e8edf3] p-1.5"
                  >
                    <AppInput
                      value={editingOrganizationName}
                      onChange={(event) => setEditingOrganizationName(event.target.value)}
                      className="h-8 flex-1 rounded-[8px] border-[#e8edf3] bg-white text-[12px]"
                      autoFocus
                    />
                    <AppButton
                      size="sm"
                      disabled={pendingActionId === organization.id}
                      onClick={() => void handleUpdateOrganization(organization.id)}
                    >
                      حفظ
                    </AppButton>
                    <AppButton
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingOrganizationId(null)}
                    >
                      إلغاء
                    </AppButton>
                  </div>
                )
              }

              return (
                <div key={organization.id} className="group/org flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    className={cn(
                      "flex flex-1 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-start transition-colors",
                      isSelected
                        ? "border border-[#c7d9ff] bg-[#eff6ff]"
                        : "border border-transparent hover:bg-[#f8faff]"
                    )}
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold text-white"
                      style={{ backgroundColor: orgColorFor(organization.id) }}
                    >
                      {organization.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={organization.logoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        initials(organization.name)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[12.5px] font-bold", HEADING)}>
                        {organization.name}
                      </span>
                      <span className={cn("block truncate text-[10.5px]", MUTED)}>
                        {count === 1 ? "مساحة عمل واحدة" : `${count} مساحات عمل`}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-[13px] font-extrabold", HEADING)}>
                      {count}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`تعديل اسم ${organization.name}`}
                    onClick={() => startEditOrganization(organization)}
                    className="hidden size-7 shrink-0 items-center justify-center rounded-[8px] text-[#8098b4] hover:bg-[#f4f7fc] hover:text-[#0d1b3e] group-hover/org:flex"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {showOrganizationForm ? (
          <div className="mt-3 flex flex-col gap-2 rounded-[10px] border border-[#e8edf3] p-2.5">
            <AppInput
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="اسم المنظمة"
              aria-label="اسم المنظمة"
              className="h-9 rounded-[9px] border-[#e8edf3] bg-white text-[12.5px] placeholder:text-[#8098b4]"
              autoFocus
            />
            <div className="flex gap-2">
              <AppButton
                size="sm"
                className="flex-1"
                onClick={() => void handleCreateOrganization()}
              >
                إنشاء
              </AppButton>
              <AppButton size="sm" variant="outline" onClick={() => setShowOrganizationForm(false)}>
                إلغاء
              </AppButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowOrganizationForm(true)}
            className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#c7d3e3] text-[12px] font-semibold text-[#5b6b85] hover:border-[#2563eb] hover:text-[#2563eb]"
          >
            <Plus className="size-3.5" />
            إضافة منظمة جديدة
          </button>
        )}
      </aside>

      {/* Workspaces panel */}
      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <AppButton
            type="button"
            onClick={goToCreateWorkspace}
            icon={<Plus className="size-4" />}
            iconPosition="start"
            className="h-10 gap-2 whitespace-nowrap rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
          >
            إنشاء مساحة عمل جديدة
          </AppButton>
          <div className="min-w-[200px] flex-1">
            <AppInput
              type="search"
              value={workspaceSearch}
              onChange={(event) => setWorkspaceSearch(event.target.value)}
              placeholder="البحث في مساحات العمل..."
              aria-label="البحث في مساحات العمل"
              className="h-10 rounded-[10px] border-[#e8edf3] bg-white text-[12.5px] placeholder:text-[#8098b4]"
              startIcon={<Search className="size-4" />}
            />
          </div>
          <span
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e8edf3] px-3 text-[12px] font-semibold",
              MUTED
            )}
          >
            <Globe className="size-3.5" />
            {selectedOrganization ? selectedOrganization.name : "كل مساحات العمل"}
          </span>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto pe-1"
          role="listbox"
          aria-label="مساحات العمل"
        >
          {pagedWorkspaces.length === 0 ? (
            <div
              className={cn(
                ROW_CARD,
                "flex h-full min-h-[220px] flex-col items-center justify-center gap-1.5 p-6 text-center"
              )}
            >
              <Building2 className="size-7 text-[#c7d3e3]" />
              <p className={cn("text-[13px] font-semibold", HEADING)}>
                {searchedWorkspaces.length === 0 && relevantWorkspaces.length === 0
                  ? "لا توجد مساحات عمل بعد"
                  : "لا توجد مساحات عمل مطابقة"}
              </p>
              <p className={cn("text-[11.5px]", MUTED)}>ابدأ بإنشاء مساحة عمل جديدة.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pagedWorkspaces.map((workspace) => {
                const isCurrent = currentWorkspace?.id === workspace.id
                const isArchived = workspace.status === "archived"
                const isPending = pendingActionId === workspace.id
                const accent = accentFor(workspace.id)
                const Icon = accent.icon
                const members = membersFor(workspace)
                const orgName = organizationLabel(workspace)

                return (
                  <div
                    key={workspace.id}
                    role="option"
                    tabIndex={0}
                    aria-selected={isCurrent}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => {
                      if (workspaceStatus !== "switching") void handleWorkspaceSelect(workspace)
                    }}
                    onKeyDown={(event) => {
                      if (
                        (event.key === "Enter" || event.key === " ") &&
                        workspaceStatus !== "switching"
                      ) {
                        event.preventDefault()
                        void handleWorkspaceSelect(workspace)
                      }
                    }}
                    className={cn(
                      ROW_CARD,
                      "relative cursor-pointer p-4 transition-colors hover:border-[#c7d9ff] hover:bg-[#f8faff]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40",
                      isCurrent && "border-[#c7d9ff] bg-[#f7fafe]",
                      isArchived && "opacity-70",
                      workspaceStatus === "switching" && "pointer-events-none opacity-70"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-[12px]"
                        style={{ backgroundColor: accent.bg, color: accent.fg }}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1 text-start">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-[14px] font-bold", HEADING)}>
                            {workspace.name}
                          </span>
                          {isCurrent ? (
                            <AppBadge
                              variant="outline"
                              className="shrink-0 border-transparent bg-[#eff6ff] text-[10px] text-[#2563eb]"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Check className="size-2.5" />
                                الحالية
                              </span>
                            </AppBadge>
                          ) : null}
                          <AppBadge
                            variant="outline"
                            className={cn(
                              "shrink-0 border-transparent text-[10px]",
                              isArchived
                                ? "bg-[#fff7ed] text-[#ea580c]"
                                : "bg-[#f0fdf4] text-[#16a34a]"
                            )}
                          >
                            {isArchived ? "متوقفة" : "نشطة"}
                          </AppBadge>
                        </span>
                        <span className={cn("mt-0.5 block truncate text-[11.5px]", MUTED)}>
                          {workspace.metadata?.description ||
                            workspace.metadata?.city ||
                            workspace.settings.timezone}
                        </span>
                      </div>
                      <AppDropdownMenu>
                        <AppDropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`إجراءات ${workspace.name}`}
                            disabled={isPending}
                            onClick={(event) => event.stopPropagation()}
                            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[#8098b4] hover:bg-[#f4f7fc] hover:text-[#0d1b3e] disabled:opacity-50"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </AppDropdownMenuTrigger>
                        <AppDropdownMenuContent align="start">
                          <AppDropdownMenuItem
                            onSelect={() => void handleWorkspaceSelect(workspace)}
                          >
                            التبديل إلى هذه المساحة
                          </AppDropdownMenuItem>
                          <AppDropdownMenuItem onSelect={() => goToEditWorkspace(workspace)}>
                            تعديل
                          </AppDropdownMenuItem>
                          <AppDropdownMenuItem
                            onSelect={() => void handleArchiveRestoreWorkspace(workspace)}
                          >
                            {isArchived ? "تنشيط" : "إيقاف"}
                          </AppDropdownMenuItem>
                        </AppDropdownMenuContent>
                      </AppDropdownMenu>
                    </div>

                    {selectedOrganization ? (
                      <div className="mt-3 flex items-center gap-2 ps-[3.5rem]">
                        {members.length > 0 ? (
                          <div dir="ltr" className="flex items-center -space-x-2">
                            {members.slice(0, 4).map((member) => (
                              <AppAvatar key={member.id} size="sm" className="ring-2 ring-white">
                                <AppAvatarFallback className="bg-[#eff6ff] text-[10px] font-bold text-[#2563eb]">
                                  {initials(member.fullName)}
                                </AppAvatarFallback>
                              </AppAvatar>
                            ))}
                            {members.length > 4 ? (
                              <span className="flex size-6 items-center justify-center rounded-full bg-[#f4f7fc] text-[10px] font-bold text-[#5b6b85] ring-2 ring-white">
                                +{members.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <Users className="size-3.5 text-[#c7d3e3]" />
                        )}
                        <span className={cn("text-[11px]", MUTED)}>
                          {members.length === 1 ? "عضو واحد" : `${members.length} أعضاء`}
                        </span>
                      </div>
                    ) : null}

                    <div className="mt-3 flex items-center gap-4 border-t border-[#f1f4f9] pt-2.5 ps-[3.5rem] text-[11px]">
                      {orgName ? (
                        <span className={cn("flex items-center gap-1", MUTED)}>
                          <Building2 className="size-3" />
                          المنظمة: {orgName}
                        </span>
                      ) : null}
                      <span className={MUTED}>أخر تحديث: {formatDate(workspace.createdAt)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {searchedWorkspaces.length > 0 ? (
          <div className="mt-3 flex items-center justify-between border-t border-[#f1f4f9] pt-3">
            <span className={cn("text-[11.5px]", MUTED)}>
              عرض {pagedWorkspaces.length} من {searchedWorkspaces.length} مساحة عمل
            </span>
            {totalPages > 1 ? (
              <div className="flex items-center gap-1">
                <AppButton
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={currentPage <= 1}
                  aria-label="الصفحة السابقة"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  ‹
                </AppButton>
                <span
                  className={cn("min-w-[3.5rem] text-center text-[11.5px] font-semibold", HEADING)}
                >
                  {currentPage} / {totalPages}
                </span>
                <AppButton
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={currentPage >= totalPages}
                  aria-label="الصفحة التالية"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  ›
                </AppButton>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <AppConfirmDialog
        open={archiveConfirmTarget !== null}
        onOpenChange={(open) => {
          if (!pendingActionId && !open) setArchiveConfirmTarget(null)
        }}
        title={`إيقاف ${archiveConfirmTarget?.name ?? ""}؟`}
        description="سيتوقف كل الربط والمزامنة تحت هذه المساحة فوراً ويبقى متوقفاً حتى تعيد تنشيطها. لا شيء يُحذف."
        cancelLabel="إلغاء"
        confirmLabel="إيقاف"
        confirmTone="default"
        loading={pendingActionId === archiveConfirmTarget?.id}
        onCancel={() => {
          if (!pendingActionId) setArchiveConfirmTarget(null)
        }}
        onConfirm={() => {
          void confirmArchiveWorkspace()
        }}
      />
    </div>
  )
}
