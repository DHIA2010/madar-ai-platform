"use client"

// إدارة الفروع -- the branches (workspaces) this organization sells through.
//
// A "branch" here is exactly the workspace entity the rest of the app already switches between
// (POS device settings, payment methods and the workspace switcher are all scoped to one) -- this
// screen is the admin view over the same real records, not a separate registry. Figma's own
// reference mocks a hardcoded branch list with fabricated POS-terminal counts and creation dates;
// neither is reproduced here. What's shown is the organization's real workspaces with their real
// status and creation date, and the extra branch fields (city, address, phone...) the backend has
// nowhere dedicated to store are kept in the workspace's own free-form metadata column -- the same
// place description already lives for the workspace-switcher's own "add workspace" flow.
//
// "عدد نقاط البيع" counts each branch's registered pos_devices rows -- the closest real thing to
// a point-of-sale count this platform has, since the standalone POS-terminal concept is gone.
// list() only ever sees the caller's *current* session workspace, so this reads a dedicated
// organization-wide aggregate (GET /v1/pos/devices/counts-by-workspace) instead of one list()
// call per branch.

import { useEffect, useMemo, useState, type ReactNode } from "react"
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
import { useWorkspace, type Workspace } from "@/features/workspace"
import { useUsersQuery } from "@/features/administration/queries/use-users-query"
import { useApplicationServices } from "@/application/context"
import type { AdministrationUserDto } from "@/application/contracts/administration.contracts"
import { posDevicesService } from "@/features/pos/services/pos-device-settings.service"
import { DateField } from "@/app/(layout-pages)/eCommerce/add-product/date-field"

import {
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

const BRANCH_TIPS = [
  "تأكد من صحة بيانات العنوان ورقم الجوال.",
  "بإمكانك إضافة أكثر من فرع لنفس المتجر.",
  "بعد إنشاء الفرع بإمكانك ربطه بأجهزة نقاط البيع والموظفين.",
  "سيكون الفرع متاحاً مباشرة بعد التفعيل.",
]

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
const BLUE_TINT = "bg-[#eff6ff] text-[#2563eb]"

// A value domain (which Saudi cities are selectable), not fabricated branch data -- the branches
// themselves come entirely from the organization's real workspaces below.
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

interface BranchDraft {
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

function emptyDraft(): BranchDraft {
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

function draftFromWorkspace(workspace: Workspace): BranchDraft {
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

export default function BranchesPage() {
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

  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    void posDevicesService
      .countsByWorkspace()
      .then((counts) => {
        if (!cancelled) setDeviceCounts(counts)
      })
      .catch(() => {
        // A branch with no confirmed count just shows 0 rather than blocking the rest of the
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
  const [draft, setDraft] = useState<BranchDraft>(emptyDraft())
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  const branches = useMemo(
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
    for (const branch of branches) {
      const city = branch.metadata?.city
      if (city) set.add(city)
    }
    return Array.from(set).sort()
  }, [branches])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return branches.filter((branch) => {
      const metadata = branch.metadata ?? {}
      const matchesQuery =
        !query ||
        branch.name.toLowerCase().includes(query) ||
        (metadata.address ?? "").toLowerCase().includes(query)
      const matchesCity = cityFilter === "all" || metadata.city === cityFilter
      const status = branch.status ?? "active"
      const matchesStatus = statusFilter === "all" || status === statusFilter
      return matchesQuery && matchesCity && matchesStatus
    })
  }, [branches, search, cityFilter, statusFilter])

  const activeCount = branches.filter((branch) => (branch.status ?? "active") === "active").length
  const archivedCount = branches.length - activeCount

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft())
    setIsActive(true)
    setIsFormOpen(true)
  }

  function openEdit(branch: Workspace) {
    setEditingId(branch.id)
    setDraft(draftFromWorkspace(branch))
    setIsActive((branch.status ?? "active") === "active")
    setIsFormOpen(true)
  }

  async function handleSave() {
    if (!currentOrganization) return
    if (!draft.name.trim()) {
      toast.error("اسم الفرع مطلوب.")
      return
    }

    setIsSaving(true)
    try {
      const manager = employees.find((employee) => employee.id === draft.managerId)
      const phone = draft.phone.trim() ? `${draft.phoneCode} ${draft.phone.trim()}` : undefined

      if (editingId) {
        const existing = branches.find((branch) => branch.id === editingId)
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
        toast.success("تم تحديث بيانات الفرع.")
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
        // input) -- honoring an unchecked "تفعيل الفرع" takes a real follow-up archive call
        // rather than silently ignoring the toggle.
        if (!isActive) {
          await archiveWorkspace(created.id)
        }
        toast.success("تم إضافة الفرع.")
      }

      setIsFormOpen(false)
    } catch (error) {
      toast.error(error instanceof AppError ? error.message : "تعذر حفظ بيانات الفرع.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleStatus(branch: Workspace) {
    setPendingActionId(branch.id)
    try {
      if ((branch.status ?? "active") === "active") {
        await archiveWorkspace(branch.id)
        toast.success(`تم إيقاف ${branch.name}.`)
      } else {
        await restoreWorkspace(branch.id)
        toast.success(`تم تنشيط ${branch.name}.`)
      }
    } catch (error) {
      toast.error(error instanceof AppError ? error.message : "تعذر تحديث حالة الفرع.")
    } finally {
      setPendingActionId(null)
    }
  }

  if (isFormOpen) {
    return (
      <BranchFormView
        editingId={editingId}
        draft={draft}
        setDraft={setDraft}
        employees={employees}
        isActive={isActive}
        setIsActive={setIsActive}
        isSaving={isSaving}
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
            <h1 className={cn("text-[20px] font-extrabold", HEADING)}>الفروع</h1>
          </div>
          <p className={cn("mt-1 text-[12.5px]", MUTED)}>
            إدارة فروع المؤسسة وبياناتها -- كل فرع هو نفس مساحة العمل التي تُستخدم في إعدادات
            الأجهزة وطرق الدفع.
          </p>
        </div>
        <Button
          className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          إضافة فرع
        </Button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الفروع" value={branches.length} icon={Store} tint={BLUE_TINT} />
        <StatCard
          label="الفروع النشطة"
          value={activeCount}
          icon={CheckCircle2}
          tint="bg-[#f0fdf4] text-[#16a34a]"
        />
        <StatCard
          label="الفروع المتوقفة"
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
                placeholder="البحث في الفروع بالاسم أو العنوان..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-right">
              <thead>
                <tr className="bg-[#f8faff]">
                  {[
                    "اسم الفرع",
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
                {filtered.map((branch, index) => {
                  const status = branch.status ?? "active"
                  return (
                    <tr
                      key={branch.id}
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
                            {branch.name}
                          </span>
                        </div>
                      </td>
                      <td className={cn("px-4 py-3.5 text-[13px]", HEADING)}>
                        {branch.metadata?.city ?? "—"}
                      </td>
                      <td className={cn("max-w-[220px] truncate px-4 py-3.5 text-[13px]", HEADING)}>
                        {branch.metadata?.address ?? "—"}
                      </td>
                      <td
                        className={cn("px-4 py-3.5 text-center text-[13px] font-semibold", HEADING)}
                      >
                        {deviceCounts[branch.id] ?? 0}
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
                        {formatDate(branch.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="إجراءات الفرع"
                              disabled={pendingActionId === branch.id}
                              className="flex size-8 items-center justify-center rounded-[8px] text-[#8098b4] hover:bg-[#f4f7fc] hover:text-[#0d1b3e] disabled:opacity-50"
                            >
                              {pendingActionId === branch.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <MoreVertical className="size-4" />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => openEdit(branch)}>
                              تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleToggleStatus(branch)}>
                              {status === "active" ? "إيقاف الفرع" : "تنشيط الفرع"}
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
                  {branches.length === 0 ? "لا توجد فروع بعد" : "لا توجد فروع مطابقة لهذا البحث"}
                </p>
                <p className={cn("text-[12px]", MUTED)}>
                  {branches.length === 0
                    ? "ابدأ بإضافة أول فرع لمؤسستك."
                    : "جرّب تعديل البحث أو التصفية."}
                </p>
              </div>
            ) : null}
          </div>

          <div className={cn("mt-3 text-[12px]", MUTED)}>
            عرض {filtered.length} من {branches.length} فرع
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className={cn(PANEL, "p-4")}>
            <h2 className={cn("mb-3 text-[13px] font-bold", HEADING)}>تصفية الفروع</h2>

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
              كل فرع تنشئه هنا مساحة عمل مستقلة -- يمكنك ضبط إعدادات أجهزتها وطرق الدفع الخاصة بها
              بشكل منفصل من نفس رواق الإعدادات.
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

function BranchFormView({
  editingId,
  draft,
  setDraft,
  employees,
  isActive,
  setIsActive,
  isSaving,
  onCancel,
  onSave,
}: {
  editingId: string | null
  draft: BranchDraft
  setDraft: (updater: (prev: BranchDraft) => BranchDraft) => void
  employees: AdministrationUserDto[]
  isActive: boolean
  setIsActive: (value: boolean) => void
  isSaving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  function set<K extends keyof BranchDraft>(key: K, value: BranchDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
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
          العودة إلى الفروع
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col gap-4">
          <section className={cn(PANEL, "p-5")}>
            <FormCardHeader
              icon={Store}
              title="المعلومات الأساسية"
              subtitle="معلومات الفرع الأساسية التي ستظهر في النظام"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم الفرع" required>
                <Input
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="مثال: فرع السلام"
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
                  placeholder="أدخل العنوان التفصيلي للفرع"
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
              <Field label="رمز الفرع" required>
                <Input
                  value={draft.code}
                  onChange={(event) => set("code", event.target.value)}
                  placeholder="مثال: BR-001"
                  className={cn(FIELD_CLASS, "[direction:ltr]")}
                />
                <p className={cn("mt-1 text-[10.5px]", MUTED)}>
                  رمز فريد يستخدم للتعريف بالفرع في النظام.
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
              subtitle="معلومات اختيارية تساعد في إدارة الفرع."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="مدير الفرع">
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
              icon={Settings2}
              title="حالة الفرع"
              subtitle="حدد حالة الفرع والصلاحيات."
            />

            <div className="mb-4 flex items-center justify-between border-b border-[#f1f4f9] pb-4">
              <div>
                <p className={cn("text-[13.5px] font-semibold", HEADING)}>تفعيل الفرع</p>
                <p className={cn("mt-0.5 text-[11.5px]", MUTED)}>
                  سيكون الفرع متاحاً للبيع والاستخدام في النظام
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
                <DateField
                  value={draft.openedAt}
                  onChange={(value) => set("openedAt", value)}
                  ariaLabel="تاريخ افتتاح الفرع"
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
              {editingId ? "حفظ التغييرات" : "حفظ الفرع"}
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
              {editingId ? "تعديل بيانات الفرع" : "إضافة فرع جديد"}
            </p>
            <p className={cn("mt-1.5 text-[11.5px] leading-6", MUTED)}>
              قم بإضافة معلومات الفرع وربطه بالنظام لتمكين البيع وإدارة المخزون والموظفين.
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
              {BRANCH_TIPS.map((tip, index) => (
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
