"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Ban, CheckCircle2, Clock3, Loader2, Mail, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCheckbox, AppDialog, AppTextarea } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { formatRelativeArabic } from "../lib/format-arabic-time"
import { useInvitationMutations } from "../queries/use-invitation-mutations"
import { useInvitationsQuery } from "../queries/use-invitations-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"
import type { AdministrationInvitationStatus } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

// Invitations no longer grant a role: new members start with no permissions
// and gain access only once an admin adds them to a team.
const DEFAULT_INVITE_ROLE_ID = "viewer"

const STATUS_LABEL: Record<AdministrationInvitationStatus, string> = {
  pending: "قيد الانتظار",
  accepted: "مقبولة",
  declined: "مرفوضة",
  canceled: "ملغاة",
  expired: "منتهية",
}

const STATUS_TINT: Record<AdministrationInvitationStatus, string> = {
  pending: "bg-[#fffbeb] text-[#92400e]",
  accepted: "bg-[#f0fdf4] text-[#15803d]",
  declined: "bg-[#fef2f2] text-[#dc2626]",
  canceled: "bg-[#f2f5fa] text-[#5b6b85]",
  expired: "bg-[#f2f5fa] text-[#5b6b85]",
}

type InvitationDraft = { emails: string; workspaceIds: string[] }
const defaultDraft: InvitationDraft = { emails: "", workspaceIds: [] }

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof Mail
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

export function AdministrationInvitationsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { data, isLoading, isError } = useInvitationsQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { sendInvitation, cancelInvitation, resendInvitation } = useInvitationMutations(
    currentOrganization?.id
  )
  const invitations = useMemo(() => data ?? [], [data])
  const inviteableWorkspaces = useMemo(
    () => availableWorkspaces.filter((workspace) => workspace.status !== "archived"),
    [availableWorkspaces]
  )

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(defaultDraft)

  const counts = useMemo(
    () => ({
      total: invitations.length,
      pending: invitations.filter((invitation) => invitation.status === "pending").length,
      accepted: invitations.filter((invitation) => invitation.status === "accepted").length,
      closed: invitations.filter((invitation) =>
        ["declined", "canceled", "expired"].includes(invitation.status)
      ).length,
    }),
    [invitations]
  )

  const parsedEmails = useMemo(
    () =>
      draft.emails
        .split(/[\n,; ]/)
        .map((email) => email.trim())
        .filter(Boolean),
    [draft.emails]
  )

  function toggleWorkspace(workspaceId: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      workspaceIds: checked
        ? [...current.workspaceIds, workspaceId]
        : current.workspaceIds.filter((id) => id !== workspaceId),
    }))
  }

  async function handleSendInvitations() {
    if (parsedEmails.length === 0 || !currentOrganization) return
    const workspaceIds = draft.workspaceIds.length > 0 ? draft.workspaceIds : [undefined]
    try {
      await Promise.all(
        parsedEmails.flatMap((email) =>
          workspaceIds.map((workspaceId) =>
            sendInvitation.mutateAsync({
              organizationId: currentOrganization.id,
              email,
              roleId: DEFAULT_INVITE_ROLE_ID,
              workspaceId,
            })
          )
        )
      )
      setDraft(defaultDraft)
      setOpen(false)
      toast.success(`تم إرسال الدعوة إلى ${parsedEmails.length} مستلم.`)
    } catch {
      toast.error("تعذر إرسال بعض الدعوات.")
    }
  }

  async function handleResend(invitationId: string, email: string) {
    try {
      await resendInvitation.mutateAsync(invitationId)
      toast.success(`تمت إعادة إرسال الدعوة إلى ${email}.`)
    } catch {
      toast.error("تعذر إعادة إرسال الدعوة.")
    }
  }

  async function handleCancel(invitationId: string) {
    try {
      await cancelInvitation.mutateAsync(invitationId)
      toast.success("تم إلغاء الدعوة.")
    } catch {
      toast.error("تعذر إلغاء الدعوة.")
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
          <Mail className="size-3.5" />
          الدعوات
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>الدعوات</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            دعوة مستخدمين جدد ومتابعة حالة الدعوات المرسلة.
          </p>
        </div>
        <AppButton
          onClick={() => setOpen(true)}
          className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
        >
          دعوة مستخدمين
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Mail}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="إجمالي الدعوات"
          value={counts.total}
        />
        <StatCard
          icon={Clock3}
          tint="bg-[#fffbeb] text-[#92400e]"
          label="قيد الانتظار"
          value={counts.pending}
        />
        <StatCard
          icon={CheckCircle2}
          tint="bg-[#f0fdf4] text-[#16a34a]"
          label="مقبولة"
          value={counts.accepted}
        />
        <StatCard
          icon={Ban}
          tint="bg-[#f2f5fa] text-[#5b6b85]"
          label="ملغاة أو منتهية"
          value={counts.closed}
        />
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        {isLoading ? (
          <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل الدعوات...
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-[13px] text-[#dc2626]">تعذر تحميل الدعوات.</p>
        ) : invitations.length === 0 ? (
          <p className={cn("p-10 text-center text-[12.5px]", MUTED)}>لا توجد دعوات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-center">
              <thead>
                <tr>
                  {[
                    { key: "email", label: "البريد الإلكتروني" },
                    { key: "workspace", label: "مكان العمل" },
                    { key: "status", label: "الحالة" },
                    { key: "expires", label: "تنتهي في" },
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
                {invitations.map((invitation, index) => (
                  <tr
                    key={invitation.id}
                    className={cn(
                      "border-b border-[#f4f7fb] last:border-b-0",
                      index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                    )}
                  >
                    <td className={cn("px-3 py-3 text-[12.5px] font-bold", HEADING)}>
                      {invitation.email}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-[#f4f7fc] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#5b6b85]">
                        {invitation.workspace}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          STATUS_TINT[invitation.status]
                        )}
                      >
                        {STATUS_LABEL[invitation.status]}
                      </span>
                    </td>
                    <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                      {formatRelativeArabic(invitation.expiresAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={invitation.status !== "pending"}
                          onClick={() => void handleResend(invitation.id, invitation.email)}
                          aria-label="إعادة إرسال"
                          className="flex size-8 items-center justify-center rounded-[8px] border border-[#e8edf3] text-[#5b6b85] hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={invitation.status !== "pending"}
                          onClick={() => void handleCancel(invitation.id)}
                          aria-label="إلغاء"
                          className="flex size-8 items-center justify-center rounded-[8px] border border-[#e8edf3] text-[#dc2626] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <X className="size-3.5" />
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

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={<span dir="rtl">دعوة مستخدمين</span>}
        description={
          <span dir="rtl">
            الأعضاء الجدد يبدأون بلا صلاحيات -- أضفهم إلى فريق لاحقاً لمنحهم الوصول.
          </span>
        }
        footer={
          <>
            <AppButton variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </AppButton>
            <AppButton
              onClick={() => void handleSendInvitations()}
              disabled={sendInvitation.isPending}
            >
              إرسال الدعوة
            </AppButton>
          </>
        }
        contentClassName="sm:max-w-2xl [direction:rtl]"
      >
        <div dir="rtl" className="grid gap-3 md:grid-cols-2">
          <AppTextarea
            label="عناوين البريد الإلكتروني"
            helperText="افصل بينها بفاصلة أو مسافة أو سطر جديد"
            placeholder="sara@madar.ai, ali@madar.ai"
            className="min-h-[120px]"
            wrapperClassName="md:col-span-2"
            value={draft.emails}
            onChange={(event) =>
              setDraft((current) => ({ ...current, emails: event.target.value }))
            }
          />

          <div className="space-y-2 rounded-lg border border-[#e8edf3] p-3 md:col-span-2">
            <p className={cn("text-[12.5px] font-bold", HEADING)}>أماكن العمل (اختياري)</p>
            <p className={cn("text-[11px]", MUTED)}>
              اتركها بلا تحديد لمنح وصول على مستوى المنظمة. اختيار عدة أماكن يرسل دعوة لكل مكان عمل.
            </p>
            {inviteableWorkspaces.length === 0 ? (
              <p className={cn("text-[12.5px]", MUTED)}>لا توجد أماكن عمل متاحة.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {inviteableWorkspaces.map((workspace) => (
                  <label
                    key={workspace.id}
                    className="flex items-center gap-2 text-[12.5px]"
                    htmlFor={`invite-workspace-${workspace.id}`}
                  >
                    <AppCheckbox
                      id={`invite-workspace-${workspace.id}`}
                      checked={draft.workspaceIds.includes(workspace.id)}
                      onCheckedChange={(checked) => toggleWorkspace(workspace.id, checked === true)}
                    />
                    {workspace.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </div>
  )
}
