"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  FileCheck2,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppConfirmDialog, AppDialog, AppInput, AppTextarea } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useRoleMutations } from "../queries/use-role-mutations"
import { useRolesQuery } from "../queries/use-roles-query"
import { IAM_PERMISSION_GROUPS } from "../services"
import type { IamPermissionAction, IamPermissionModule } from "../types"
import { AdministrationModuleNav } from "./administration-module-nav"
import {
  actionLabel as matrixActionLabel,
  moduleLabel as matrixModuleLabel,
  PERMISSION_ACTION_META,
  PERMISSION_MODULE_META,
  PermissionMatrix,
  type PermissionMatrixTranslator,
} from "./permission-matrix"

import { useApplicationServices } from "@/application"
import type { AdministrationRoleDto, RolePermissionDto } from "@/application/contracts"
import { type Locale, localeDirection } from "@/i18n/locales"

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

type WizardStep = 1 | 2 | 3

const WIZARD_STEP_KEYS: Array<{ step: WizardStep; key: "info" | "permissions" | "review" }> = [
  { step: 1, key: "info" },
  { step: 2, key: "permissions" },
  { step: 3, key: "review" },
]

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

const KNOWN_MODULES = new Set<string>([
  "dashboard",
  "liveVisitors",
  "campaigns",
  "connections",
  "stores",
  "products",
  "orders",
  "pos",
  "customers",
  "reports",
  "ai",
  "users",
  "roles",
  "teams",
  "invitations",
  "auditLog",
  "sessions",
  "settings",
  "workspace",
  "tax",
])
const KNOWN_ACTIONS = new Set<string>([
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "import",
  "approve",
  "publish",
  "manage",
])

// A role's stored permissions can include module keys outside the static taxonomy shown in the
// create/edit matrix (e.g. legacy grants) -- falls back to the raw key/action string rather than
// hiding the row, so nothing granted on a role is ever silently dropped from view.
function moduleLabel(module: string, t: PermissionMatrixTranslator) {
  return KNOWN_MODULES.has(module) ? matrixModuleLabel(module as IamPermissionModule, t) : module
}
function actionLabels(actions: string[], t: PermissionMatrixTranslator) {
  return actions
    .map((action) =>
      KNOWN_ACTIONS.has(action) ? matrixActionLabel(action as IamPermissionAction, t) : action
    )
    .join("، ")
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
  const t = useTranslations("administration.roles")
  const tMatrix = useTranslations("administration.permissionMatrix")
  const locale = useLocale() as Locale
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
  const [step, setStep] = useState<WizardStep>(1)
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

  function resetDialogState() {
    setSelectedRole(null)
    setEditingRole(false)
    setCloningRole(false)
    setDraft(emptyDraft())
    setStep(1)
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
    setStep(1)
    setOpen(true)
  }

  function openCloneDialog(role: AdministrationRoleDto) {
    setSelectedRole(role)
    setEditingRole(false)
    setCloningRole(true)
    setDraft({
      name: `${role.name}${t("cloneSuffix")}`,
      description: role.description,
      cloneFrom: role.id,
      permissions: clonePermissions(role.permissions),
    })
    setStep(1)
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
        toast.success(t("toasts.updated", { name: draft.name.trim() }))
      } else {
        await createRole.mutateAsync({
          organizationId: currentOrganization.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          permissions: permissionsToList(draft.permissions),
        })
        toast.success(t("toasts.created", { name: draft.name.trim() }))
      }
      closeDialog()
    } catch {
      toast.error(t("toasts.saveFailed"))
    }
  }

  async function handleDeleteRole() {
    if (!deletingRole) return
    try {
      await deleteRole.mutateAsync({ roleId: deletingRole.id })
      toast.success(t("toasts.deleted", { name: deletingRole.name }))
      setDeletingRole(null)
    } catch {
      toast.error(t("toasts.deleteFailed"))
    }
  }

  // A default (non-editable) role opens the same dialog read-only -- there is no server-side
  // save path for it, so the form must not offer one rather than failing silently on submit.
  const isReadOnly = editingRole && selectedRole ? !selectedRole.editable : false
  const dialogTitle = isReadOnly
    ? t("dialog.titles.details")
    : editingRole
      ? t("dialog.titles.edit")
      : cloningRole
        ? t("dialog.titles.clone")
        : t("dialog.titles.create")
  const dialogDescription = isReadOnly
    ? t("dialog.descriptions.readOnly")
    : editingRole
      ? t("dialog.descriptions.edit")
      : t("dialog.descriptions.create")
  const saveLabel = editingRole ? t("dialog.saveLabelEdit") : t("dialog.saveLabelCreate")
  const isSaving = createRole.isPending || updateRole.isPending

  const customRoleCount = roles.filter((role) => !role.isDefault).length
  const linkedUserCount = roles.reduce((total, role) => total + role.userCount, 0)

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-10">
      <AdministrationModuleNav />

      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.dashboard} className="hover:text-[#2563eb]">
          {t("breadcrumb.home")}
        </Link>
        <span>/</span>
        <Link href={ROUTES.administration} className="hover:text-[#2563eb]">
          {t("breadcrumb.administration")}
        </Link>
        <span>/</span>
        <span className={cn("flex items-center gap-1 font-semibold", HEADING)}>
          <ShieldCheck className="size-3.5" />
          {t("breadcrumb.current")}
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
        </div>
        <AppButton
          onClick={openCreateDialog}
          className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
        >
          {t("createRole")}
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={ShieldCheck}
          tint="bg-[#f5f3ff] text-[#7c3aed]"
          label={t("stats.customRoles")}
          value={customRoleCount}
        />
        <StatCard
          icon={Users}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label={t("stats.linkedUsers")}
          value={linkedUserCount}
        />
        <StatCard
          icon={Crown}
          tint="bg-[#fffbeb] text-[#92400e]"
          label={t("stats.totalRoles")}
          value={roles.length}
        />
      </div>

      <div className={cn(PANEL, "p-4")}>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
          <AppInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search.placeholder")}
            className="h-10 rounded-[10px] border-[#e8edf3] bg-white ps-9 text-[13px]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      ) : isError ? (
        <p className="p-8 text-center text-[13px] text-[#dc2626]">{t("loadError")}</p>
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
                  {role.isDefault ? t("roleCard.defaultBadge") : t("roleCard.customBadge")}
                </span>
              </div>
              <div>
                <h3 className={cn("text-[14px] font-extrabold", HEADING)}>{role.name}</h3>
                <p className={cn("mt-0.5 text-[11.5px] leading-5", MUTED)}>{role.description}</p>
              </div>
              <div className="flex items-center gap-4 text-[11.5px]">
                <span className={cn("flex items-center gap-1", MUTED)}>
                  <Users className="size-3.5" />
                  {t("roleCard.usersCount", { count: role.userCount })}
                </span>
                <span className={cn("flex items-center gap-1", MUTED)}>
                  <ShieldCheck className="size-3.5" />
                  {t("roleCard.permissionsCount", { count: grantCount(role) })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-t border-[#eef2f8] pt-3">
                <button
                  type="button"
                  onClick={() => openEditDialog(role)}
                  className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#e8edf3] text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
                >
                  {t("roleCard.viewDetails")}
                </button>
                <button
                  type="button"
                  onClick={() => openCloneDialog(role)}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e8edf3] px-2.5 text-[11.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
                >
                  <Copy className="size-3.5" />
                  {t("roleCard.clone")}
                </button>
                {role.editable ? (
                  <button
                    type="button"
                    onClick={() => setDeletingRole(role)}
                    aria-label={t("roleCard.deleteAria", { name: role.name })}
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
        title={<span dir={localeDirection(locale)}>{dialogTitle}</span>}
        description={<span dir={localeDirection(locale)}>{dialogDescription}</span>}
        contentClassName={cn(
          "w-[95vw] max-w-6xl",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
        footer={
          isReadOnly ? (
            <AppButton
              variant="outline"
              onClick={closeDialog}
              className="h-11 rounded-[10px] px-6 text-[13px] font-semibold"
            >
              {t("dialog.close")}
            </AppButton>
          ) : (
            <>
              <AppButton
                variant="outline"
                onClick={
                  step === 1 ? closeDialog : () => setStep((current) => (current - 1) as WizardStep)
                }
                className="h-11 rounded-[10px] border-[#dbe3ef] px-6 text-[13px] font-semibold text-[#5b6b85]"
              >
                {step === 1 ? t("dialog.cancel") : t("dialog.back")}
              </AppButton>
              {step < 3 ? (
                <AppButton
                  icon={<ArrowLeft className="size-4" />}
                  iconPosition="end"
                  onClick={() => setStep((current) => (current + 1) as WizardStep)}
                  disabled={step === 1 && draft.name.trim().length === 0}
                  className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
                >
                  {t("dialog.next")}
                </AppButton>
              ) : (
                <AppButton
                  icon={isSaving ? <Loader2 className="size-4 animate-spin" /> : undefined}
                  onClick={() => void saveRole()}
                  disabled={isSaving || draft.name.trim().length === 0}
                  className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
                >
                  {saveLabel}
                </AppButton>
              )}
            </>
          )
        }
      >
        <div dir={localeDirection(locale)}>
          {isReadOnly ? (
            <div className="grid gap-4">
              <div>
                <h3 className={cn("text-[14px] font-extrabold", HEADING)}>{draft.name}</h3>
                <p className={cn("mt-0.5 text-[12.5px]", MUTED)}>{draft.description}</p>
              </div>
              <div className="grid gap-2">
                {Object.entries(draft.permissions)
                  .filter(([, actions]) => actions.length > 0)
                  .map(([module, actions]) => (
                    <div key={module} className="rounded-lg border border-[#e8edf3] p-3">
                      <p className={cn("text-[12.5px] font-bold", HEADING)}>
                        {moduleLabel(module, tMatrix)}
                      </p>
                      <p className={cn("mt-1 text-[11.5px]", MUTED)}>
                        {actionLabels(actions, tMatrix)}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-5">
              {/* First in DOM = rightmost under dir="rtl", matching the reference layout
                  (stepper on the right, step content on the left). */}
              <div className="w-[210px] shrink-0 space-y-4">
                <ol className="space-y-1">
                  {WIZARD_STEP_KEYS.map((item) => {
                    const isDone = item.step < step
                    const isCurrent = item.step === step
                    return (
                      <li
                        key={item.step}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[10px] p-2.5",
                          isCurrent && "bg-[#eff6ff]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold",
                            isDone
                              ? "bg-[#2563eb] text-white"
                              : isCurrent
                                ? "border-2 border-[#2563eb] text-[#2563eb]"
                                : "border border-[#dbe3ef] text-[#8098b4]"
                          )}
                        >
                          {isDone ? <Check className="size-3.5" /> : item.step}
                        </span>
                        <div>
                          <p
                            className={cn(
                              "text-[12.5px] font-bold",
                              isCurrent || isDone ? HEADING : "text-[#8098b4]"
                            )}
                          >
                            {t(`wizard.steps.${item.key}.title`)}
                          </p>
                          <p className="text-[11px] text-[#8098b4]">
                            {t(`wizard.steps.${item.key}.subtitle`)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>

                {step === 2 ? (
                  <div className="flex gap-2 rounded-[10px] border border-[#e8edf3] bg-[#fafbfd] p-3">
                    <ShieldCheck className="size-4 shrink-0 text-[#8098b4]" />
                    <div>
                      <p className={cn("text-[11.5px] font-bold", HEADING)}>
                        {t("wizard.note.title")}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-5 text-[#8098b4]">
                        {t("wizard.note.description")}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                {step === 1 ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <AppInput
                        label={t("form.nameLabel")}
                        labelClassName="text-[13px] font-semibold text-[#0d1b3e]"
                        required
                        placeholder={t("form.namePlaceholder")}
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        className="h-11 rounded-[10px] border-[#e8edf3] bg-white px-3.5 text-[13.5px]"
                      />
                      <AppTextarea
                        label={t("form.descriptionLabel")}
                        labelClassName="text-[13px] font-semibold text-[#0d1b3e]"
                        placeholder={t("form.descriptionPlaceholder")}
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                        className="h-11 min-h-11 resize-none rounded-[10px] border-[#e8edf3] bg-white px-3.5 py-2.5 text-[13.5px]"
                      />
                    </div>
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <div className="rounded-lg border border-[#e8edf3] p-3 text-[12.5px] text-[#5b6b85]">
                      {t("permissions.selectedCount", { count: permissionGrantCount })}
                      {selectedClone
                        ? t("permissions.startingFrom", { name: selectedClone.name })
                        : ""}
                    </div>
                    <PermissionMatrix
                      groups={IAM_PERMISSION_GROUPS}
                      value={draft.permissions}
                      onChange={(next) =>
                        setDraft((current) => ({ ...current, permissions: next }))
                      }
                      subtitle={t("permissions.subtitle")}
                    />
                  </>
                ) : null}

                {step === 3 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3.5 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd] p-4">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
                        <FileCheck2 className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className={cn("text-[14.5px] font-extrabold", HEADING)}>
                          {draft.name || t("review.unnamed")}
                        </h3>
                        {draft.description ? (
                          <p className={cn("mt-0.5 truncate text-[12px] leading-5", MUTED)}>
                            {draft.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-center rounded-[10px] bg-[#2563eb] px-4 py-2 text-white">
                        <span className="text-[18px] font-extrabold leading-none">
                          {permissionGrantCount}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold opacity-90">
                          {t("review.permissionsSelected")}
                        </span>
                      </div>
                    </div>

                    <div className="grid h-[620px] content-start gap-2.5 overflow-y-auto pe-1">
                      {Object.entries(draft.permissions)
                        .filter(([, actions]) => actions.length > 0)
                        .map(([module, actions]) => {
                          const meta =
                            PERMISSION_MODULE_META[module as keyof typeof PERMISSION_MODULE_META]
                          const ModuleIcon = meta?.icon ?? ShieldCheck
                          return (
                            <div
                              key={module}
                              className="flex items-start gap-2.5 rounded-[10px] border border-[#e8edf3] p-3"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#eff6ff] text-[#2563eb]">
                                <ModuleIcon className="size-[15px]" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className={cn("text-[12.5px] font-bold", HEADING)}>
                                  {moduleLabel(module, tMatrix)}
                                </p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {actions.map((action) => {
                                    const actionMeta =
                                      PERMISSION_ACTION_META[
                                        action as keyof typeof PERMISSION_ACTION_META
                                      ]
                                    return (
                                      <span
                                        key={action}
                                        className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                        style={{
                                          color: actionMeta?.color ?? MUTED,
                                          backgroundColor: `${actionMeta?.color ?? "#8098b4"}1a`,
                                        }}
                                      >
                                        {actionLabels([action], tMatrix)}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      {permissionGrantCount === 0 ? (
                        <p className="p-3 text-center text-[12.5px] text-[#8098b4]">
                          {t("review.noPermissions")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </AppDialog>

      <AppConfirmDialog
        open={Boolean(deletingRole)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingRole(null)
        }}
        title={<span dir={localeDirection(locale)}>{t("deleteDialog.title")}</span>}
        description={
          <span dir={localeDirection(locale)}>
            {deletingRole ? t("deleteDialog.description", { name: deletingRole.name }) : null}
          </span>
        }
        confirmLabel={t("deleteDialog.confirm")}
        cancelLabel={t("deleteDialog.cancel")}
        confirmTone="destructive"
        loading={deleteRole.isPending}
        onConfirm={handleDeleteRole}
        onCancel={() => setDeletingRole(null)}
        contentClassName={locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"}
      />
    </div>
  )
}
