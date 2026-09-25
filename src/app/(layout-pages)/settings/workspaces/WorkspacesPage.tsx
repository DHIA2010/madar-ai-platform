"use client"

// إدارة مساحات العمل -- the workspaces this organization sells through (what this screen used to
// call "branches" before that separate naming was retired in favor of one term, workspace).
//
// This screen is the admin view over the exact same workspace records the header switcher and
// every workspace-scoped feature (POS device settings, payment methods, tax rates...) already use
// -- not a separate registry. Figma's own reference mocks a hardcoded workspace list with fabricated
// POS-terminal counts and creation dates; neither is reproduced here. What's shown is the
// organization's real workspaces with their real status and creation date, and the extra
// storefront fields (city, address, phone...) the backend has nowhere dedicated to store are kept
// in the workspace's own free-form metadata column -- the same place description already lives
// for the header switcher's own "add workspace" flow.
//
// "عدد نقاط البيع" counts each workspace's registered pos_devices rows -- the closest real thing
// to a point-of-sale count this platform has, since the standalone POS-terminal concept is gone.
// list() only ever sees the caller's *current* session workspace, so this reads a dedicated
// organization-wide aggregate (GET /v1/pos/devices/counts-by-workspace) instead of one list()
// call per workspace.

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
  Building2,
  CheckCircle2,
  CheckCircle,
  ChevronRight,
  Loader2,
  Lightbulb,
  MapPin,
  MoreVertical,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Smartphone,
  Store,
} from "lucide-react"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { useWorkspace, type Workspace } from "@/features/workspace"
import { useUsersQuery } from "@/features/administration/queries/use-users-query"
import { useUserMutations } from "@/features/administration/queries/use-user-mutations"
import { useApplicationServices } from "@/application/context"
import type { AdministrationUserDto } from "@/application/contracts/administration.contracts"
import { posDevicesService } from "@/features/pos/services/pos-device-settings.service"

import {
  AppCheckbox,
  AppDateField,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const PHONE_CODES = ["+966", "+971", "+973", "+965", "+974"]

const WORKSPACE_TIPS = [
  "تأكد من صحة بيانات العنوان ورقم الجوال.",
  "بإمكانك إضافة أكثر من مساحة عمل لنفس المتجر.",
  "بعد إنشاء مساحة العمل بإمكانك ربطها بأجهزة نقاط البيع والموظفين.",
  "ستكون مساحة العمل متاحة مباشرة بعد التفعيل.",
]

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
const BLUE_TINT = "bg-[#eff6ff] text-[#2563eb]"

// A value domain (which Saudi cities are selectable), not fabricated data -- the workspaces
// themselves come entirely from the organization's real records below.
const CITY_OPTIONS = [
  "الرياض",
  "جدة",
  "الدمام",
  "الخبر",
  "مكة المكرمة",
  "المدينة المنورة",
  "الطائف",
  "بريدة",
  "تبوك",
  "الأحساء",
]

const CURRENCY_OPTIONS = [
  { code: "SAR", label: "الريال السعودي (SAR)" },
  { code: "USD", label: "الدولار الأمريكي (USD)" },
]

const TIMEZONE_OPTIONS = [
  { code: "Asia/Riyadh", label: "الرياض (GMT+3)" },
  { code: "Asia/Dubai", label: "دبي (GMT+4)" },
  { code: "Africa/Cairo", label: "القاهرة (GMT+2)" },
]

type StatusFilter = "all" | "active" | "archived"

const STATUS_LABEL: Record<"active" | "archived", string> = {
  active: "نشط",
  archived: "متوقف",
}

interface WorkspaceDraft {
  name: string
  city: string
  district: string
  address: string
  phoneCode: string
  phone: string
  code: string
  managerId: string
  email: string
  currency: string
  timezone: string
  openedAt: string
}

function emptyDraft(): WorkspaceDraft {
  return {
    name: "",
    city: "",
    district: "",
    address: "",
    phoneCode: "+966",
    phone: "",
    code: "",
    managerId: "",
    email: "",
    currency: "SAR",
    timezone: "Asia/Riyadh",
    openedAt: "",
  }
}

// The stored phone is one plain string ("+966 5X XXX XXXX"); split the known code back off so the
// edit form's two fields do not just show the whole thing crammed into the number field.
function splitPhone(stored: string | undefined): { code: string; number: string } {
  const value = stored?.trim() ?? ""
  const code = PHONE_CODES.find((candidate) => value.startsWith(candidate))
  return code ? { code, number: value.slice(code.length).trim() } : { code: "+966", number: value }
}

function draftFromWorkspace(workspace: Workspace): WorkspaceDraft {
  const metadata = workspace.metadata ?? {}
  const phone = splitPhone(metadata.phone)
  return {
    name: workspace.name,
    city: metadata.city ?? "",
    district: metadata.district ?? "",
    address: metadata.address ?? "",
    phoneCode: phone.code,
    phone: phone.number,
    code: metadata.code ?? "",
    managerId: metadata.managerId ?? "",
    email: metadata.email ?? "",
    currency: workspace.settings.currency || "SAR",
    timezone: workspace.settings.timezone || "Asia/Riyadh",
    openedAt: metadata.openedAt ?? "",
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatDate(value: string | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date)
}

export default function WorkspacesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    currentOrganization,
    availableWorkspaces,
    createWorkspace,
    updateWorkspace,
    archiveWorkspace,
    restoreWorkspace,
  } = useWorkspace()

  const { administrationApplicationService } = useApplicationServices()
  // Real madar.app users (Administration → Users), the same roster a cashier will log in as now
  // that the POS terminal shares the app's own session instead of a separate employee account.
  const { data: usersData } = useUsersQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const employees = useMemo(() => usersData ?? [], [usersData])
  const { assignWorkspaces } = useUserMutations(currentOrganization?.id)

  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    void posDevicesService
      .countsByWorkspace()
      .then((counts) => {
        if (!cancelled) setDeviceCounts(counts)
      })
      .catch(() => {
        // A workspace with no confirmed count just shows 0 rather than blocking the rest of the
        // page -- the same fail-open the manager-picker fetch already uses.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [search, setSearch] = useState("")
  const [cityFilter, setCityFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<WorkspaceDraft>(emptyDraft())
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  // Real memberships (memberships.workspace_id) this workspace already grants -- distinct from the
  // "مدير مساحة العمل" field above, which is just a display label in metadata. Access here is
  // additive-only (no real unassign endpoint exists), so users already granted are shown checked
  // and locked; only newly-checked users produce a real assignUserWorkspaces call on save.
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([])
  const [existingUserIds, setExistingUserIds] = useState<Set<string>>(new Set())

  const workspaces = useMemo(
    () =>
      currentOrganization
        ? availableWorkspaces.filter(
            (workspace) => workspace.organizationId === currentOrganization.id
          )
        : [],
    [availableWorkspaces, currentOrganization]
  )

  const cities = useMemo(() => {
    const set = new Set<string>()
    for (const workspace of workspaces) {
      const city = workspace.metadata?.city
      if (city) set.add(city)
    }
    return Array.from(set).sort()
  }, [workspaces])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return workspaces.filter((workspace) => {
      const metadata = workspace.metadata ?? {}
      const matchesQuery =
        !query ||
        workspace.name.toLowerCase().includes(query) ||
        (metadata.address ?? "").toLowerCase().includes(query)
      const matchesCity = cityFilter === "all" || metadata.city === cityFilter
      const status = workspace.status ?? "active"
      const matchesStatus = statusFilter === "all" || status === statusFilter
      return matchesQuery && matchesCity && matchesStatus
    })
  }, [workspaces, search, cityFilter, statusFilter])

  const activeCount = workspaces.filter(
    (workspace) => (workspace.status ?? "active") === "active"
  ).length
  const archivedCount = workspaces.length - activeCount

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft())
    setIsActive(true)
    setAssignedUserIds([])
    setExistingUserIds(new Set())
    setIsFormOpen(true)
  }

  // Lets the header's workspace switcher deep-link straight into this real create form (e.g.
  // "/settings/workspaces?new=1") instead of duplicating a second, lighter-weight creation flow
  // there. The param is stripped right away so navigating back or refreshing does not reopen it.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openCreate()
      router.replace(ROUTES.settingsWorkspaces)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Same deep-link pattern for the switcher's per-workspace "تعديل" action
  // ("/settings/workspaces?edit=<id>") -- waits for the real workspace list before opening, since
  // the edit form needs the actual record to prefill from.
  useEffect(() => {
    const editId = searchParams.get("edit")
    if (!editId) return
    const target = workspaces.find((workspace) => workspace.id === editId)
    if (target) {
      openEdit(target)
      router.replace(ROUTES.settingsWorkspaces)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, workspaces])

  function openEdit(workspace: Workspace) {
    setEditingId(workspace.id)
    setDraft(draftFromWorkspace(workspace))
    setIsActive((workspace.status ?? "active") === "active")
    const alreadyAssigned = employees
      .filter((employee) => employee.workspaceIds.includes(workspace.id))
      .map((employee) => employee.id)
    setAssignedUserIds(alreadyAssigned)
    setExistingUserIds(new Set(alreadyAssigned))
    setIsFormOpen(true)
  }

  async function handleSave() {
    if (!currentOrganization) return
    if (!draft.name.trim()) {
      toast.error("اسم مساحة العمل مطلوب.")
      return
    }

    setIsSaving(true)
    try {
      const manager = employees.find((employee) => employee.id === draft.managerId)
      const phone = draft.phone.trim() ? `${draft.phoneCode} ${draft.phone.trim()}` : undefined
      let workspaceId = editingId

      if (editingId) {
        const existing = workspaces.find((workspace) => workspace.id === editingId)
        const metadataEntries: Array<[string, string | undefined]> = [
          ["description", existing?.metadata?.description],
          ["city", draft.city],
          ["district", draft.district],
          ["address", draft.address],
          ["phone", phone],
          ["code", draft.code],
          ["email", draft.email],
          ["managerId", manager?.id],
          ["managerName", manager?.fullName],
          ["openedAt", draft.openedAt],
        ]
        const metadata = Object.fromEntries(
          metadataEntries.filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
        )

        await updateWorkspace(editingId, {
          name: draft.name.trim(),
          status: isActive ? "active" : "archived",
          metadata,
          settings: { currency: draft.currency, timezone: draft.timezone },
        })
        toast.success("تم تحديث بيانات مساحة العمل.")
      } else {
        const created = await createWorkspace({
          organizationId: currentOrganization.id,
          name: draft.name.trim(),
          description: "",
          language: "ar",
          timezone: draft.timezone,
          currency: draft.currency,
          city: draft.city,
          district: draft.district,
          address: draft.address,
          phone,
          code: draft.code,
          email: draft.email,
          managerId: manager?.id,
          managerName: manager?.fullName,
          openedAt: draft.openedAt,
        })
        // A new workspace always starts active (WorkspaceEntity.create has no initial-status
        // input) -- honoring an unchecked "تفعيل مساحة العمل" takes a real follow-up archive call
        // rather than silently ignoring the toggle.
        if (!isActive) {
          await archiveWorkspace(created.id)
        }
        workspaceId = created.id
        toast.success("تم إضافة مساحة العمل.")
      }

      const newlyGranted = assignedUserIds.filter((id) => !existingUserIds.has(id))
      if (workspaceId && newlyGranted.length > 0) {
        try {
          await Promise.all(
            newlyGranted.map((userId) =>
              assignWorkspaces.mutateAsync({
                organizationId: currentOrganization.id,
                userId,
                workspaceIds: [workspaceId as string],
              })
            )
          )
        } catch {
          toast.error("تم حفظ مساحة العمل، لكن تعذر منح الوصول لبعض المستخدمين.")
        }
      }

      setIsFormOpen(false)
    } catch (error) {
      toast.error(error instanceof AppError ? error.message : "تعذر حفظ بيانات مساحة العمل.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleStatus(workspace: Workspace) {
    setPendingActionId(workspace.id)
    try {
      if ((workspace.status ?? "active") === "active") {
        await archiveWorkspace(workspace.id)
        toast.success(`تم إيقاف ${workspace.name}.`)
      } else {
        await restoreWorkspace(workspace.id)
        toast.success(`تم تنشيط ${workspace.name}.`)
      }
    } catch (error) {
      toast.error(error instanceof AppError ? error.message : "تعذر تحديث حالة مساحة العمل.")
    } finally {
      setPendingActionId(null)
    }
  }

  if (isFormOpen) {
    return (
      <WorkspaceFormView
        editingId={editingId}
        draft={draft}
        setDraft={setDraft}
        employees={employees}
        isActive={isActive}
        setIsActive={setIsActive}
        isSaving={isSaving}
        assignedUserIds={assignedUserIds}
        setAssignedUserIds={setAssignedUserIds}
        existingUserIds={existingUserIds}
        onCancel={() => setIsFormOpen(false)}
        onSave={handleSave}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className={cn("flex size-9 items-center justify-center rounded-[10px]", BLUE_TINT)}
            >
              <Store className="size-[18px]" />
            </span>
            <h1 className={cn("text-[20px] font-extrabold", HEADING)}>مساحات العمل</h1>
          </div>
          <p className={cn("mt-1 text-[12.5px]", MUTED)}>
            إدارة مساحات عمل المؤسسة -- تُستخدم أيضاً في إعدادات الأجهزة وطرق الدفع الخاصة بكل
            مساحة.
          </p>
        </div>
        <Button
          className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          إضافة مساحة عمل
        </Button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="إجمالي مساحات العمل"
          value={workspaces.length}
          icon={Store}
          tint={BLUE_TINT}
        />
        <StatCard
          label="مساحات العمل النشطة"
          value={activeCount}
          icon={CheckCircle2}
          tint="bg-[#f0fdf4] text-[#16a34a]"
        />
        <StatCard
          label="مساحات العمل المتوقفة"
          value={archivedCount}
          icon={PauseCircle}
          tint="bg-[#fff7ed] text-[#ea580c]"
        />
        <StatCard
          label="المدن"
          value={cities.length}
          icon={MapPin}
          tint="bg-[#f0fdfa] text-[#0d9488]"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section className={cn(PANEL, "p-5")}>
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="البحث في مساحات العمل بالاسم أو العنوان..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-right">
              <thead>
                <tr className="bg-[#f8faff]">
                  {[
                    "اسم مساحة العمل",
                    "المدينة",
                    "العنوان",
                    "عدد نقاط البيع",
                    "الحالة",
                    "تاريخ الإنشاء",
                    "الإجراءات",
                  ].map((label) => (
                    <th
                      key={label}
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold",
                        MUTED
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((workspace, index) => {
                  const status = workspace.status ?? "active"
                  return (
                    <tr
                      key={workspace.id}
                      className={cn("border-b border-[#f2f4f8]", index % 2 === 1 && "bg-[#fafbfd]")}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                              BLUE_TINT
                            )}
                          >
                            <Building2 className="size-4" />
                          </span>
                          <span className={cn("text-[13.5px] font-bold", HEADING)}>
                            {workspace.name}
                          </span>
                        </div>
                      </td>
                      <td className={cn("px-4 py-3.5 text-[13px]", HEADING)}>
                        {workspace.metadata?.city ?? "—"}
                      </td>
                      <td className={cn("max-w-[220px] truncate px-4 py-3.5 text-[13px]", HEADING)}>
                        {workspace.metadata?.address ?? "—"}
                      </td>
                      <td
                        className={cn("px-4 py-3.5 text-center text-[13px] font-semibold", HEADING)}
                      >
                        {deviceCounts[workspace.id] ?? 0}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold",
                            status === "active"
                              ? "bg-[#f0fdf4] text-[#16a34a]"
                              : "bg-[#fff7ed] text-[#ea580c]"
                          )}
                        >
                          <span
                            className={cn(
                              "size-[6px] rounded-full",
                              status === "active" ? "bg-[#16a34a]" : "bg-[#ea580c]"
                            )}
                          />
                          {STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3.5 text-[13px]", MUTED)}>
                        {formatDate(workspace.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="إجراءات مساحة العمل"
                              disabled={pendingActionId === workspace.id}
                              className="flex size-8 items-center justify-center rounded-[8px] text-[#8098b4] hover:bg-[#f4f7fc] hover:text-[#0d1b3e] disabled:opacity-50"
                            >
                              {pendingActionId === workspace.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <MoreVertical className="size-4" />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => openEdit(workspace)}>
                              تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleToggleStatus(workspace)}>
                              {status === "active" ? "إيقاف مساحة العمل" : "تنشيط مساحة العمل"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <Store className="size-8 text-[#c7d3e3]" />
                <p className={cn("text-[13px] font-semibold", HEADING)}>
                  {workspaces.length === 0
                    ? "لا توجد مساحات عمل بعد"
                    : "لا توجد مساحات عمل مطابقة لهذا البحث"}
                </p>
                <p className={cn("text-[12px]", MUTED)}>
                  {workspaces.length === 0
                    ? "ابدأ بإضافة أول مساحة عمل لمؤسستك."
                    : "جرّب تعديل البحث أو التصفية."}
                </p>
              </div>
            ) : null}
          </div>

          <div className={cn("mt-3 text-[12px]", MUTED)}>
            عرض {filtered.length} من {workspaces.length} مساحة عمل
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className={cn(PANEL, "p-4")}>
            <h2 className={cn("mb-3 text-[13px] font-bold", HEADING)}>تصفية مساحات العمل</h2>

            <div className="mb-3">
              <Label className={cn("mb-1.5 block text-[11.5px] font-semibold", HEADING)}>
                المدينة
              </Label>
              <AppSelect value={cityFilter} onValueChange={setCityFilter}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">جميع المدن</AppSelectItem>
                  {cities.map((city) => (
                    <AppSelectItem key={city} value={city}>
                      {city}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="mb-1">
              <Label className={cn("mb-1.5 block text-[11.5px] font-semibold", HEADING)}>
                الحالة
              </Label>
              <AppSelect
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">جميع الحالات</AppSelectItem>
                  <AppSelectItem value="active">نشط</AppSelectItem>
                  <AppSelectItem value="archived">متوقف</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>

            {search || cityFilter !== "all" || statusFilter !== "all" ? (
              <Button
                variant="outline"
                className="mt-3 h-9 w-full gap-1.5 rounded-[9px] border-[#e8edf3] text-[12px] font-semibold text-[#5b6b85]"
                onClick={() => {
                  setSearch("")
                  setCityFilter("all")
                  setStatusFilter("all")
                }}
              >
                <RotateCcw className="size-3.5" />
                إعادة تعيين
              </Button>
            ) : null}
          </section>

          <div className="rounded-2xl border border-[#e0eaf8] bg-[#f8faff] p-4">
            <p className={cn("mb-1 text-[12.5px] font-bold", HEADING)}>معلومة</p>
            <p className={cn("text-[11.5px] leading-6", MUTED)}>
              كل مساحة عمل تنشئها هنا مستقلة بإعداداتها -- يمكنك ضبط أجهزتها وطرق الدفع الخاصة بها
              من نفس رواق الإعدادات.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

// The Figma source colors every label here the same dark navy, required and optional alike --
// unlike the device-settings screens, where blue marks a required field. Just a trailing " *" in
// the same color distinguishes required fields.
function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
        {label}
        {required ? " *" : null}
      </Label>
      {children}
    </div>
  )
}

function FormCardHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className={cn("text-[15px] font-bold", HEADING)}>{title}</h2>
        <p className={cn("mt-0.5 text-[11.5px]", MUTED)}>{subtitle}</p>
      </div>
      <span
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px]", BLUE_TINT)}
      >
        <Icon className="size-[17px]" />
      </span>
    </div>
  )
}

function WorkspaceFormView({
  editingId,
  draft,
  setDraft,
  employees,
  isActive,
  setIsActive,
  isSaving,
  assignedUserIds,
  setAssignedUserIds,
  existingUserIds,
  onCancel,
  onSave,
}: {
  editingId: string | null
  draft: WorkspaceDraft
  setDraft: (updater: (prev: WorkspaceDraft) => WorkspaceDraft) => void
  employees: AdministrationUserDto[]
  isActive: boolean
  setIsActive: (value: boolean) => void
  isSaving: boolean
  assignedUserIds: string[]
  setAssignedUserIds: (updater: (prev: string[]) => string[]) => void
  existingUserIds: Set<string>
  onCancel: () => void
  onSave: () => void
}) {
  function set<K extends keyof WorkspaceDraft>(key: K, value: WorkspaceDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function toggleAssignedUser(userId: string, checked: boolean) {
    setAssignedUserIds((prev) => (checked ? [...prev, userId] : prev.filter((id) => id !== userId)))
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div>
        <Button
          variant="outline"
          onClick={onCancel}
          className="h-10 gap-1.5 rounded-[10px] border-[#e8edf3] px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
        >
          <ChevronRight className="size-4" />
          العودة إلى مساحات العمل
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col gap-4">
          <section className={cn(PANEL, "p-5")}>
            <FormCardHeader
              icon={Store}
              title="المعلومات الأساسية"
              subtitle="معلومات مساحة العمل الأساسية التي ستظهر في النظام"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم مساحة العمل" required>
                <Input
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="مثال: مساحة عمل السلام"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="المدينة" required>
                <AppSelect value={draft.city} onValueChange={(value) => set("city", value)}>
                  <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                    <AppSelectValue placeholder="اختر المدينة" />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {CITY_OPTIONS.map((city) => (
                      <AppSelectItem key={city} value={city}>
                        {city}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="العنوان" required>
                <Input
                  value={draft.address}
                  onChange={(event) => set("address", event.target.value)}
                  placeholder="أدخل العنوان التفصيلي لمساحة العمل"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="الحي / المنطقة">
                <Input
                  value={draft.district}
                  onChange={(event) => set("district", event.target.value)}
                  placeholder="مثال: حي النخيل"
                  className={FIELD_CLASS}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="رمز مساحة العمل" required>
                <Input
                  value={draft.code}
                  onChange={(event) => set("code", event.target.value)}
                  placeholder="مثال: BR-001"
                  className={cn(FIELD_CLASS, "[direction:ltr]")}
                />
                <p className={cn("mt-1 text-[10.5px]", MUTED)}>
                  رمز فريد يستخدم للتعريف بمساحة العمل في النظام.
                </p>
              </Field>
              <Field label="رقم الجوال">
                <div className="flex gap-2">
                  <div className="w-[100px] shrink-0">
                    <AppSelect
                      value={draft.phoneCode}
                      onValueChange={(value) => set("phoneCode", value)}
                    >
                      <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                        <AppSelectValue />
                      </AppSelectTrigger>
                      <AppSelectContent>
                        {PHONE_CODES.map((code) => (
                          <AppSelectItem key={code} value={code}>
                            {code}
                          </AppSelectItem>
                        ))}
                      </AppSelectContent>
                    </AppSelect>
                  </div>
                  <Input
                    value={draft.phone}
                    onChange={(event) => set("phone", event.target.value)}
                    placeholder="5X XXX XXXX"
                    className={cn(FIELD_CLASS, "flex-1 [direction:ltr]")}
                  />
                </div>
              </Field>
            </div>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <FormCardHeader
              icon={Smartphone}
              title="معلومات إضافية"
              subtitle="معلومات اختيارية تساعد في إدارة مساحة العمل."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="مدير مساحة العمل">
                <AppSelect
                  value={draft.managerId || "none"}
                  onValueChange={(value) => set("managerId", value === "none" ? "" : value)}
                >
                  <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                    <AppSelectValue placeholder="اختر الموظف" />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    <AppSelectItem value="none">بدون</AppSelectItem>
                    {employees.length === 0 ? (
                      <div className={cn("px-2 py-2 text-[12px]", MUTED)}>
                        لا يوجد موظفو نقطة بيع مسجلون بعد
                      </div>
                    ) : (
                      employees.map((employee) => (
                        <AppSelectItem key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </AppSelectItem>
                      ))
                    )}
                  </AppSelectContent>
                </AppSelect>
              </Field>
              <Field label="البريد الإلكتروني">
                <Input
                  value={draft.email}
                  onChange={(event) => set("email", event.target.value)}
                  placeholder="example@madar.local"
                  className={cn(FIELD_CLASS, "[direction:ltr]")}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="العملة الافتراضية">
                <AppSelect value={draft.currency} onValueChange={(value) => set("currency", value)}>
                  <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {CURRENCY_OPTIONS.map((option) => (
                      <AppSelectItem key={option.code} value={option.code}>
                        {option.label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </Field>
              <Field label="المنطقة الزمنية">
                <AppSelect value={draft.timezone} onValueChange={(value) => set("timezone", value)}>
                  <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {TIMEZONE_OPTIONS.map((option) => (
                      <AppSelectItem key={option.code} value={option.code}>
                        {option.label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </Field>
            </div>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <FormCardHeader
              icon={Smartphone}
              title="الموظفون المصرح لهم"
              subtitle="حدد الموظفين الذين يمكنهم الوصول إلى مساحة العمل هذه وأجهزتها."
            />

            {employees.length === 0 ? (
              <p className={cn("text-[12.5px]", MUTED)}>لا يوجد موظفون مسجلون بعد.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {employees.map((employee) => {
                  const alreadyAssigned = existingUserIds.has(employee.id)
                  return (
                    <label
                      key={employee.id}
                      htmlFor={`workspace-user-${employee.id}`}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[9px] px-2 py-2",
                        alreadyAssigned ? "cursor-default" : "cursor-pointer hover:bg-[#f4f7fc]"
                      )}
                    >
                      <AppCheckbox
                        id={`workspace-user-${employee.id}`}
                        checked={assignedUserIds.includes(employee.id)}
                        disabled={alreadyAssigned}
                        onCheckedChange={(checked) =>
                          toggleAssignedUser(employee.id, checked === true)
                        }
                      />
                      <span className={cn("flex-1 text-[13px]", HEADING)}>{employee.fullName}</span>
                      {alreadyAssigned ? (
                        <span className={cn("text-[11px]", MUTED)}>لديه وصول بالفعل</span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            )}
            <p className={cn("mt-2 text-[10.5px]", MUTED)}>
              منح الوصول هنا دائم ولا يمكن التراجع عنه من هذه الصفحة حالياً.
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <FormCardHeader
              icon={Settings2}
              title="حالة مساحة العمل"
              subtitle="حدد حالة مساحة العمل والصلاحيات."
            />

            <div className="mb-4 flex items-center justify-between border-b border-[#f1f4f9] pb-4">
              <div>
                <p className={cn("text-[13.5px] font-semibold", HEADING)}>تفعيل مساحة العمل</p>
                <p className={cn("mt-0.5 text-[11.5px]", MUTED)}>
                  ستكون مساحة العمل متاحة للبيع والاستخدام في النظام
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                className="data-[state=checked]:bg-[#2563eb]"
              />
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                تاريخ الافتتاح
              </Label>
              <div className="ms-auto max-w-[220px]">
                <AppDateField
                  value={draft.openedAt}
                  onChange={(value: string) => set("openedAt", value)}
                  ariaLabel="تاريخ افتتاح مساحة العمل"
                />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={onCancel} disabled={isSaving}>
              إلغاء
            </Button>
            <Button
              onClick={onSave}
              disabled={isSaving}
              className="gap-2 bg-[#2563eb] hover:bg-[#1d4ed8]"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle className="size-4" />
              )}
              {editingId ? "حفظ التغييرات" : "حفظ مساحة العمل"}
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className={cn(PANEL, "p-5 text-center")}>
            <div className="relative mb-3.5 flex h-[130px] items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br from-[#e8f5e9] to-[#c8e6c9]">
              <Store className="size-12 text-[#16a34a]" />
              <span className="absolute end-2.5 top-2.5 rounded-[6px] bg-[#2563eb] px-2 py-0.5 text-[10px] font-bold text-white">
                MADAR
              </span>
            </div>
            <p className={cn("text-[14px] font-bold", HEADING)}>
              {editingId ? "تعديل بيانات مساحة العمل" : "إضافة مساحة عمل جديدة"}
            </p>
            <p className={cn("mt-1.5 text-[11.5px] leading-6", MUTED)}>
              قم بإضافة معلومات مساحة العمل وربطها بالنظام لتمكين البيع وإدارة المخزون والموظفين.
            </p>
          </section>

          <section className={cn(PANEL, "p-4")}>
            <div className="mb-3.5 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-[8px] bg-[#fffbe6]">
                <Lightbulb className="size-3.5 text-[#f5a623]" />
              </span>
              <h2 className={cn("text-[13.5px] font-bold", HEADING)}>نصائح مهمة</h2>
            </div>
            <ol className="flex flex-col gap-2.5">
              {WORKSPACE_TIPS.map((tip, index) => (
                <li key={tip} className="flex items-start gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-[#2563eb] text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className={cn("text-[12px] leading-6", MUTED)}>{tip}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tint,
}: {
  label: string
  value: number
  icon: typeof Store
  tint: string
}) {
  return (
    <div className={cn(PANEL, "flex items-center justify-between p-4")}>
      <div>
        <p className={cn("text-[24px] font-extrabold leading-none", HEADING)}>{value}</p>
        <p className={cn("mt-1.5 text-[11.5px]", MUTED)}>{label}</p>
      </div>
      <span
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-[12px]", tint)}
      >
        <Icon className="size-5" />
      </span>
    </div>
  )
}
