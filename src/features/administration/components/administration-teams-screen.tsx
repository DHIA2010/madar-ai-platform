"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Pencil, Search, Trash2, Users, UsersRound, UserX, X } from "lucide-react"
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

import { useTeamMembersQuery } from "../queries/use-team-members-query"
import { useTeamMutations } from "../queries/use-team-mutations"
import { useTeamsQuery } from "../queries/use-teams-query"
import { useUsersQuery } from "../queries/use-users-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"
import type { AdministrationTeamDto } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

type TeamDraft = {
  name: string
  description: string
  workspaceId: string
}

const defaultDraft: TeamDraft = { name: "", description: "", workspaceId: "" }

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

function TeamDialog({
  open,
  onOpenChange,
  team,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  team: AdministrationTeamDto | null
}) {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { createTeam, updateTeam, addTeamMember, removeTeamMember } = useTeamMutations(
    currentOrganization?.id
  )

  const [draft, setDraft] = useState<TeamDraft>(() =>
    team
      ? {
          name: team.name,
          description: team.description === "—" ? "" : team.description,
          workspaceId: team.workspaceId ?? "",
        }
      : defaultDraft
  )
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([])
  const [selectedAddUserId, setSelectedAddUserId] = useState("")

  const { data: memberData, isLoading: membersLoading } = useTeamMembersQuery(
    administrationApplicationService,
    team?.id
  )
  const { data: userData } = useUsersQuery(
    administrationApplicationService,
    currentOrganization?.id
  )

  const members = useMemo(() => memberData ?? [], [memberData])
  const users = useMemo(() => userData ?? [], [userData])
  const memberUserIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])
  const addableUsers = useMemo(
    () => users.filter((user) => !memberUserIds.has(user.id)),
    [users, memberUserIds]
  )
  const selectableNewUsers = useMemo(
    () => users.filter((user) => !selectedNewMemberIds.includes(user.id)),
    [users, selectedNewMemberIds]
  )

  async function handleAddExistingMember() {
    if (!team || !selectedAddUserId) return
    try {
      await addTeamMember.mutateAsync({ teamId: team.id, userId: selectedAddUserId })
      setSelectedAddUserId("")
      toast.success("تمت إضافة العضو.")
    } catch {
      toast.error("تعذر إضافة العضو.")
    }
  }

  async function handleRemoveExistingMember(userId: string) {
    if (!team) return
    try {
      await removeTeamMember.mutateAsync({ teamId: team.id, userId })
      toast.success("تمت إزالة العضو.")
    } catch {
      toast.error("تعذر إزالة العضو.")
    }
  }

  function handleAddNewMember() {
    if (!selectedAddUserId) return
    setSelectedNewMemberIds((current) => [...current, selectedAddUserId])
    setSelectedAddUserId("")
  }

  function handleRemoveNewMember(userId: string) {
    setSelectedNewMemberIds((current) => current.filter((id) => id !== userId))
  }

  async function handleSave() {
    if (!currentOrganization || draft.name.trim().length === 0) return
    try {
      if (team) {
        await updateTeam.mutateAsync({
          teamId: team.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          workspaceId: draft.workspaceId || null,
        })
        toast.success(`تم تحديث فريق "${draft.name.trim()}".`)
      } else {
        const created = await createTeam.mutateAsync({
          organizationId: currentOrganization.id,
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          workspaceId: draft.workspaceId || undefined,
        })
        if (selectedNewMemberIds.length > 0) {
          await Promise.all(
            selectedNewMemberIds.map((userId) =>
              addTeamMember.mutateAsync({ teamId: created.id, userId })
            )
          )
        }
        toast.success(`تم إنشاء فريق "${draft.name.trim()}".`)
      }
      onOpenChange(false)
    } catch {
      toast.error(team ? "تعذر تحديث الفريق." : "تعذر إنشاء الفريق.")
    }
  }

  const isSaving = createTeam.isPending || updateTeam.isPending

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<span dir="rtl">{team ? `تعديل الفريق — ${team.name}` : "إنشاء فريق"}</span>}
      description={
        <span dir="rtl">الفرق التعاونية تنظم الأعضاء حسب مكان العمل ونطاق المسؤولية.</span>
      }
      footer={
        <>
          <AppButton variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </AppButton>
          <AppButton
            onClick={() => void handleSave()}
            disabled={isSaving || draft.name.trim().length === 0}
          >
            {team ? "حفظ التعديلات" : "إنشاء الفريق"}
          </AppButton>
        </>
      }
      contentClassName="sm:max-w-2xl [direction:rtl]"
    >
      <div dir="rtl" className="grid gap-3 md:grid-cols-2">
        <AppInput
          label="اسم الفريق"
          wrapperClassName="md:col-span-2"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        />

        <AppSelect
          value={draft.workspaceId}
          onValueChange={(next) => setDraft((current) => ({ ...current, workspaceId: next }))}
        >
          <AppSelectTrigger className="h-10">
            <AppSelectValue placeholder="مكان العمل (اختياري)" />
          </AppSelectTrigger>
          <AppSelectContent position="popper" align="start">
            {availableWorkspaces.map((workspace) => (
              <AppSelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>

        <AppTextarea
          label="الوصف"
          className="min-h-[90px]"
          wrapperClassName="md:col-span-2"
          value={draft.description}
          onChange={(event) =>
            setDraft((current) => ({ ...current, description: event.target.value }))
          }
        />
      </div>

      <div dir="rtl" className="mt-4 space-y-3 border-t border-[#eef2f8] pt-4">
        <p className={cn("text-[12.5px] font-bold", HEADING)}>أعضاء الفريق</p>

        {team ? (
          <>
            <div className="flex items-end gap-2">
              <AppSelect value={selectedAddUserId} onValueChange={setSelectedAddUserId}>
                <AppSelectTrigger className="h-10 flex-1">
                  <AppSelectValue placeholder="اختر عضواً للإضافة" />
                </AppSelectTrigger>
                <AppSelectContent position="popper" align="start">
                  {addableUsers.length === 0 ? (
                    <div className={cn("px-2 py-1.5 text-[12.5px]", MUTED)}>
                      جميع أعضاء المنظمة منضمون بالفعل.
                    </div>
                  ) : (
                    addableUsers.map((user) => (
                      <AppSelectItem key={user.id} value={user.id}>
                        {user.fullName} · {user.email}
                      </AppSelectItem>
                    ))
                  )}
                </AppSelectContent>
              </AppSelect>
              <AppButton
                onClick={() => void handleAddExistingMember()}
                disabled={!selectedAddUserId || addTeamMember.isPending}
              >
                إضافة
              </AppButton>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {membersLoading ? (
                <p className={cn("text-[12.5px]", MUTED)}>جارٍ تحميل الأعضاء...</p>
              ) : members.length === 0 ? (
                <p className={cn("text-[12.5px]", MUTED)}>لا يوجد أعضاء بعد.</p>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border border-[#e8edf3] px-3 py-2"
                  >
                    <div>
                      <p className={cn("text-[12.5px] font-semibold", HEADING)}>
                        {member.fullName}
                      </p>
                      <p className={cn("text-[11px]", MUTED)}>{member.email}</p>
                    </div>
                    <button
                      type="button"
                      disabled={removeTeamMember.isPending}
                      onClick={() => void handleRemoveExistingMember(member.userId)}
                      aria-label={`إزالة ${member.fullName}`}
                      className="flex size-7 items-center justify-center rounded-full text-[#8098b4] hover:bg-[#f4f7fc]"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <p className={cn("text-[11px]", MUTED)}>
              سيتم إضافتك تلقائياً كمدير للفريق. يمكنك إضافة أعضاء آخرين الآن اختيارياً.
            </p>

            <div className="flex items-end gap-2">
              <AppSelect value={selectedAddUserId} onValueChange={setSelectedAddUserId}>
                <AppSelectTrigger className="h-10 flex-1">
                  <AppSelectValue placeholder="اختر عضواً للإضافة" />
                </AppSelectTrigger>
                <AppSelectContent position="popper" align="start">
                  {selectableNewUsers.length === 0 ? (
                    <div className={cn("px-2 py-1.5 text-[12.5px]", MUTED)}>
                      {users.length === 0 ? "لا يوجد أعضاء في المنظمة." : "تمت إضافة جميع الأعضاء."}
                    </div>
                  ) : (
                    selectableNewUsers.map((user) => (
                      <AppSelectItem key={user.id} value={user.id}>
                        {user.fullName} · {user.email}
                      </AppSelectItem>
                    ))
                  )}
                </AppSelectContent>
              </AppSelect>
              <AppButton onClick={handleAddNewMember} disabled={!selectedAddUserId}>
                إضافة
              </AppButton>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {selectedNewMemberIds.length === 0 ? (
                <p className={cn("text-[12.5px]", MUTED)}>لم يتم اختيار أعضاء إضافيين.</p>
              ) : (
                selectedNewMemberIds.map((userId) => {
                  const user = users.find((candidate) => candidate.id === userId)
                  if (!user) return null
                  return (
                    <div
                      key={userId}
                      className="flex items-center justify-between rounded-lg border border-[#e8edf3] px-3 py-2"
                    >
                      <div>
                        <p className={cn("text-[12.5px] font-semibold", HEADING)}>
                          {user.fullName}
                        </p>
                        <p className={cn("text-[11px]", MUTED)}>{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveNewMember(userId)}
                        aria-label={`إزالة ${user.fullName}`}
                        className="flex size-7 items-center justify-center rounded-full text-[#8098b4] hover:bg-[#f4f7fc]"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </AppDialog>
  )
}

export function AdministrationTeamsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const { data, isLoading, isError } = useTeamsQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { deleteTeam } = useTeamMutations(currentOrganization?.id)
  const teams = useMemo(() => data ?? [], [data])

  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null)
  const [dialogInstanceKey, setDialogInstanceKey] = useState(0)
  const editingTeam = teams.find((team) => team.id === editingTeamId) ?? null
  const deletingTeam = teams.find((team) => team.id === deletingTeamId) ?? null

  const filteredTeams = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return teams
    return teams.filter((team) => team.name.toLowerCase().includes(term))
  }, [teams, search])

  const totalMembers = teams.reduce((total, team) => total + team.members, 0)
  const teamsWithoutManager = teams.filter((team) => team.manager === "Unassigned").length

  function openCreateDialog() {
    setEditingTeamId(null)
    setDialogInstanceKey((current) => current + 1)
    setOpen(true)
  }

  function openEditDialog(team: AdministrationTeamDto) {
    setEditingTeamId(team.id)
    setDialogInstanceKey((current) => current + 1)
    setOpen(true)
  }

  async function handleDeleteTeam() {
    if (!deletingTeam) return
    try {
      await deleteTeam.mutateAsync({ teamId: deletingTeam.id })
      toast.success(`تم حذف فريق "${deletingTeam.name}".`)
      setDeletingTeamId(null)
    } catch {
      toast.error("تعذر حذف الفريق.")
    }
  }

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
          <UsersRound className="size-3.5" />
          الفرق
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>الفرق</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            تنظيم أعضاء الفريق حسب الوظيفة، المدير، ومكان العمل.
          </p>
        </div>
        <AppButton
          onClick={openCreateDialog}
          className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
        >
          إنشاء فريق جديد
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={UsersRound}
          tint="bg-[#f0fdf4] text-[#16a34a]"
          label="إجمالي الفرق"
          value={teams.length}
        />
        <StatCard
          icon={Users}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="إجمالي الأعضاء"
          value={totalMembers}
        />
        <StatCard
          icon={UserX}
          tint="bg-[#fffbeb] text-[#92400e]"
          label="فرق بدون مدير"
          value={teamsWithoutManager}
        />
      </div>

      <div className={cn(PANEL, "p-4")}>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
          <AppInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="البحث في الفرق..."
            className="h-10 rounded-[10px] border-[#e8edf3] bg-white ps-9 text-[13px]"
          />
        </div>
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        {isLoading ? (
          <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل الفرق...
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-[13px] text-[#dc2626]">تعذر تحميل الفرق.</p>
        ) : filteredTeams.length === 0 ? (
          <p className={cn("p-10 text-center text-[12.5px]", MUTED)}>لا توجد فرق مطابقة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-center">
              <thead>
                <tr>
                  {[
                    { key: "team", label: "الفريق" },
                    { key: "manager", label: "المدير" },
                    { key: "members", label: "أعضاء الفريق" },
                    { key: "workspace", label: "مكان العمل" },
                    { key: "description", label: "الوصف" },
                    { key: "actions", label: "الإجراءات" },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                        MUTED
                      )}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team, index) => (
                  <tr
                    key={team.id}
                    className={cn(
                      "border-b border-[#f4f7fb] last:border-b-0",
                      index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                    )}
                  >
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "flex items-center justify-center gap-2 text-[12.5px] font-bold",
                          HEADING
                        )}
                      >
                        <span className={cn("size-2.5 rounded-full", team.color)} />
                        {team.name}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-3 text-[12px] font-semibold",
                        team.manager === "Unassigned" ? MUTED : HEADING
                      )}
                    >
                      {team.manager === "Unassigned" ? "بدون مدير" : team.manager}
                    </td>
                    <td className={cn("px-3 py-3 text-[12px] font-semibold", HEADING)}>
                      {team.members}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-[#f4f7fc] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#5b6b85]">
                        {team.workspace}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                      {team.description || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditDialog(team)}
                          aria-label={`تعديل ${team.name}`}
                          className="flex size-8 items-center justify-center rounded-[8px] border border-[#e8edf3] text-[#5b6b85] hover:border-[#c7d9ff]"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTeamId(team.id)}
                          aria-label={`حذف ${team.name}`}
                          className="flex size-8 items-center justify-center rounded-[8px] border border-[#e8edf3] text-[#dc2626] hover:bg-[#fef2f2]"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TeamDialog
        key={dialogInstanceKey}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setEditingTeamId(null)
        }}
        team={editingTeam}
      />

      <AppConfirmDialog
        open={Boolean(deletingTeam)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeletingTeamId(null)
        }}
        title={<span dir="rtl">حذف الفريق</span>}
        description={
          <span dir="rtl">
            {deletingTeam
              ? `سيتم حذف "${deletingTeam.name}" وقائمة أعضائه نهائياً. لا يمكن التراجع عن هذا الإجراء.`
              : null}
          </span>
        }
        confirmLabel="حذف الفريق"
        cancelLabel="إلغاء"
        confirmTone="destructive"
        loading={deleteTeam.isPending}
        onConfirm={handleDeleteTeam}
        onCancel={() => setDeletingTeamId(null)}
        contentClassName="[direction:rtl]"
      />
    </div>
  )
}
