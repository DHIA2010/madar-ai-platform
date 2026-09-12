"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Copy, Crown, Loader2, Search, ShieldCheck, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppConfirmDialog,
  AppDialog,
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTextarea,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useRoleMutations } from "../queries/use-role-mutations"
import { useRolesQuery } from "../queries/use-roles-query"
import { IAM_PERMISSION_GROUPS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"
import { PermissionMatrix } from "./permission-matrix"

import { useApplicationServices } from "@/application"
import type { AdministrationRoleDto, RolePermissionDto } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

type CustomRoleDraft = {
  name: string
  description: string
  cloneFrom: string
  permissions: Record<string, string[]>
}

function clonePermissions(permissions: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(permissions).map(([module, actions]) => [module, [...actions]])
  )
}

function permissionsToList(permissions: Record<string, string[]>): RolePermissionDto[] {
  return Object.entries(permissions).flatMap(([module, actions]) =>
    actions.map((action) => ({ module, action }))
  )
}

function emptyDraft(): CustomRoleDraft {
  return { name: "", description: "", cloneFrom: "", permissions: {} }
}

function grantCount(role: AdministrationRoleDto) {
  return Object.values(role.permissions).reduce((total, list) => total + list.length, 0)
}

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof Users
  tint: string
  label: string
  value: number
}) {
  return (
    <div className={cn(PANEL, "flex flex-col gap-3 p-4")}>
      <span className={cn("flex size-10 items-center justify-center rounded-xl", tint)}>
        <Icon className="size-[18px]" />
      </span>
      <div>
        <p className={cn("text-[21px] font-extrabold", HEADING)}>{value}</p>
        <p className={cn("mt-0.5 text-[12px] font-semibold", MUTED)}>{label}</p>
      </div>
    </div>
  )
}

export function AdministrationRolesScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const { data, isLoading, isError } = useRolesQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { createRole, updateRole, deleteRole } = useRoleMutations(currentOrganization?.id)
  const roles = useMemo(() => data ?? [], [data])

  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<CustomRoleDraft>(emptyDraft())
  const [selectedRole, setSelectedRole] = useState<AdministrationRoleDto | null>(null)
  const [deletingRole, setDeletingRole] = useState<AdministrationRoleDto | null>(null)
  const [editingRole, setEditingRole] = useState(false)
  const [cloningRole, setCloningRole] = useState(false)

  const filteredRoles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return roles
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(term) || role.description.toLowerCase().includes(term)
    )
  }, [roles, search])

  const selectedClone = useMemo(
    () => roles.find((role) => role.id === draft.cloneFrom),
    [draft.cloneFrom, roles]
  )
  const permissionGrantCount = useMemo(
    () => Object.values(draft.permissions).reduce((total, actions) => total + actions.length, 0),
    [draft.permissions]
  )

  function syncPermissionsFromRole(roleId: string) {
    const sourceRole = roles.find((role) => role.id === roleId)
    if (!sourceRole) return
    setDraft((current) => ({
      ...current,
      cloneFrom: roleId,
      permissions: clonePermissions(sourceRole.permissions),
    }))
  }

  function resetDialogState() {
    setSelectedRole(null)
    setEditingRole(false)
    setCloningRole(false)
    setDraft(emptyDraft())
  }

  function openCreateDialog() {
    resetDialogState()
    const fallback = roles[0]
    if (fallback) {
      setDraft({
        name: "",
        description: "",
        cloneFrom: fallback.id,
        permissions: clonePermissions(fallback.permissions),
      })
    }
    setOpen(true)
  }

  function openEditDialog(role: AdministrationRoleDto) {
    setSelectedRole(role)
    setEditingRole(true)
    setCloningRole(false)
    setDraft({
      name: role.name,
      description: role.description,
      cloneFrom: role.id,
      permissions: clonePermissions(role.permissions),
    })
    setOpen(true)
  }

  function openCloneDialog(role: AdministrationRoleDto) {
    setSelectedRole(role)
    setEditingRole(false)
    setCloningRole(true)
    setDraft({
      name: `${role.name} (نسخة)`,
      description: role.description,
      cloneFrom: role.id,
      permissions: clonePermissions(role.permissions),
    })
    setOpen(true)
  }

  function closeDialog() {
    setOpen(false)
    resetDialogState()
  }

  async function saveRole() {
    if (!draft.name.trim() || !currentOrganization) return
    try {
      if (editingRole && selectedRole) {
        await updateRole.mutateAsync({
          roleId: selectedRole.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: permissionsToList(draft.permissions),
        })
        toast.success(`تم تحديث دور "${draft.name.trim()}".`)
      } else {
        await createRole.mutateAsync({
          organizationId: currentOrganization.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: permissionsToList(draft.permissions),
        })
        toast.success(`تم إنشاء دور "${draft.name.trim()}".`)
      }
      closeDialog()
    } catch {
      toast.error("تعذر حفظ الدور.")
    }
  }

  async function handleDeleteRole() {
    if (!deletingRole) return
    try {
      await deleteRole.mutateAsync({ roleId: deletingRole.id })
      toast.success(`تم حذف دور "${deletingRole.name}".`)
      setDeletingRole(null)
    } catch {
      toast.error("تعذر حذف الدور.")
    }
  }

  // A default (non-editable) role opens the same dialog read-only -- there is no server-side
  // save path for it, so the form must not offer one rather than failing silently on submit.
  const isReadOnly = editingRole && selectedRole ? !selectedRole.editable : false
  const dialogTitle = isReadOnly
    ? "تفاصيل الدور"
    : editingRole
      ? "تعديل الدور"
      : cloningRole
        ? "إنشاء دور من نسخة"
        : "إنشاء دور مخصص"
  const dialogDescription = isReadOnly
    ? "هذا دور افتراضي في النظام ولا يمكن تعديله."
    : editingRole
      ? "تحديث بيانات الدور مع الحفاظ على المستخدمين المرتبطين به."
      : "عرّف دوراً قابلاً لإعادة الاستخدام بصلاحيات مستنسخة كنقطة بداية."
  const saveLabel = editingRole ? "حفظ التعديلات" : "إنشاء الدور"
  const isSaving = createRole.isPending || updateRole.isPending

  const customRoleCount = roles.filter((role) => !role.isDefault).length
  const linkedUserCount = roles.reduce((total, role) => total + role.userCount, 0)

  return (
    <div dir="rtl" className="flex flex-col gap-4 pb-10">
      <AdministrationModuleNav />

      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.dashboard} className="hover:text-[#2563eb]">
          الرئيسية
        </Link>
        <span>/</span>
        <Link href={ROUTES.administration} className="hover:text-[#2563eb]">
          الإدارة
        </Link>
        <span>/</span>
        <span className={cn("flex items-center gap-1 font-semibold", HEADING)}>
          <ShieldCheck className="size-3.5" />
          الأدوار
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>الأدوار</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            إدارة الأدوار والصلاحيات وتحديد مستويات الوصول للنظام.
          </p>
        </div>
        <AppButton
          onClick={openCreateDialog}
          className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
        >
          إنشاء دور جديد
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={ShieldCheck}
          tint="bg-[#f5f3ff] text-[#7c3aed]"
          label="أدوار مخصصة"
          value={customRoleCount}
        />
        <StatCard
          icon={Users}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="المستخدمين المربوطين"
          value={linkedUserCount}
        />
        <StatCard
          icon={Crown}
          tint="bg-[#fffbeb] text-[#92400e]"
          label="إجمالي الأدوار"
          value={roles.length}
        />
      </div>

      <div className={cn(PANEL, "p-4")}>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
          <AppInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="البحث في الأدوار..."
            className="h-10 rounded-[10px] border-[#e8edf3] bg-white ps-9 text-[13px]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
          <Loader2 className="size-4 animate-spin" />
          جارٍ تحميل الأدوار...
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-[13px] text-[#dc2626]">تعذر تحميل الأدوار.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredRoles.map((role) => (
            <div key={role.id} className={cn(PANEL, "flex flex-col gap-3 p-4")}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
                  <ShieldCheck className="size-[18px]" />
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                    role.isDefault ? "bg-[#f4f7fc] text-[#5b6b85]" : "bg-[#fef2f2] text-[#dc2626]"
                  )}
                >
                  {role.isDefault ? "دور افتراضي" : "دور مخصص"}
                </span>
              </div>
              <div>
                <h3 className={cn("text-[14px] font-extrabold", HEADING)}>{role.name}</h3>
                <p className={cn("mt-0.5 text-[11.5px] leading-5", MUTED)}>{role.description}</p>
              </div>
              <div className="flex items-center gap-4 text-[11.5px]">
                <span className={cn("flex items-center gap-1", MUTED)}>
                  <Users className="size-3.5" />
                  {role.userCount} مستخدمين
                </span>
                <span className={cn("flex items-center gap-1", MUTED)}>
                  <ShieldCheck className="size-3.5" />
                  {grantCount(role)} صلاحية
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-t border-[#eef2f8] pt-3">
                <button
                  type="button"
                  onClick={() => openEditDialog(role)}
                  className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#e8edf3] text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
                >
                  عرض التفاصيل
                </button>
                <button
                  type="button"
                  onClick={() => openCloneDialog(role)}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e8edf3] px-2.5 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
                >
                  <Copy className="size-3.5" />
                  استنساخ
                </button>
                {role.editable ? (
                  <button
                    type="button"
                    onClick={() => setDeletingRole(role)}
                    aria-label={`حذف ${role.name}`}
                    className="flex h-8 items-center justify-center rounded-[8px] border border-[#e8edf3] px-2.5 text-[#dc2626] hover:bg-[#fef2f2]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <AppDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) resetDialogState()
        }}
        title={<span dir="rtl">{dialogTitle}</span>}
        description={<span dir="rtl">{dialogDescription}</span>}
        contentClassName="max-w-4xl [direction:rtl]"
        footer={
          isReadOnly ? (
            <AppButton variant="outline" onClick={closeDialog}>
              إغلاق
            </AppButton>
          ) : (
            <>
              <AppButton variant="outline" onClick={closeDialog}>
                إلغاء
              </AppButton>
              <AppButton
                onClick={() => void saveRole()}
                disabled={isSaving || draft.name.trim().length === 0}
              >
                {saveLabel}
              </AppButton>
            </>
          )
        }
      >
        <div dir="rtl" className="grid gap-4">
          {isReadOnly ? (
            <>
              <div>
                <h3 className={cn("text-[14px] font-extrabold", HEADING)}>{draft.name}</h3>
                <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>{draft.description}</p>
              </div>
              <div className="grid gap-2">
                {Object.entries(draft.permissions)
                  .filter(([, actions]) => actions.length > 0)
                  .map(([module, actions]) => (
                    <div key={module} className="rounded-lg border border-[#e8edf3] p-3">
                      <p className={cn("text-[12.5px] font-bold", HEADING)}>{module}</p>
                      <p className={cn("mt-1 text-[11.5px]", MUTED)}>{actions.join("، ")}</p>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <AppInput
                  label="اسم الدور"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <AppSelect value={draft.cloneFrom} onValueChange={syncPermissionsFromRole}>
                  <AppSelectTrigger className="h-10">
                    <AppSelectValue placeholder="ابدأ من دور (اختياري)" />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {roles.map((role) => (
                      <AppSelectItem key={role.id} value={role.id}>
                        {role.name}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              <AppTextarea
                label="الوصف"
                className="min-h-[70px]"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
              />

              <div className="rounded-lg border border-[#e8edf3] p-3 text-[12.5px] text-[#5b6b85]">
                تم اختيار {permissionGrantCount} صلاحية
                {selectedClone ? ` (بدءاً من ${selectedClone.name})` : ""}
              </div>

              <PermissionMatrix
                groups={IAM_PERMISSION_GROUPS}
                value={draft.permissions}
                onChange={(next) => setDraft((current) => ({ ...current, permissions: next }))}
                title="الصلاحيات"
                subtitle="حدد بالضبط ما يمكن لهذا الدور القيام به -- استخدم قالباً كنقطة بداية ثم عدّله."
              />
            </>
          )}
        </div>
      </AppDialog>

      <AppConfirmDialog
        open={Boolean(deletingRole)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingRole(null)
        }}
        title={<span dir="rtl">حذف الدور</span>}
        description={
          <span dir="rtl">
            {deletingRole
              ? `سيتم حذف "${deletingRole.name}" نهائياً. سيفقد المستخدمون المعينون لهذا الدور الصلاحيات التي يمنحها. لا يمكن التراجع عن هذا الإجراء.`
              : null}
          </span>
        }
        confirmLabel="حذف الدور"
        cancelLabel="إلغاء"
        confirmTone="destructive"
        loading={deleteRole.isPending}
        onConfirm={handleDeleteRole}
        onCancel={() => setDeletingRole(null)}
        contentClassName="[direction:rtl]"
      />
    </div>
  )
}
