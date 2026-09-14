"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Lock, Mail, User } from "lucide-react"
import { toast } from "sonner"

import {
  AppCheckbox,
  AppDialog,
  AppInput,
  AppPasswordInput,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useInvitationMutations } from "../queries/use-invitation-mutations"
import { useUserMutations } from "../queries/use-user-mutations"

// Every value below is transcribed directly from the approved design (Add User Modal.dc.html),
// not the broader Administration module's HEADING/MUTED tokens -- this dialog intentionally
// reproduces that design exactly, section padding and all, rather than reusing AppDialog's
// generic chrome (hence contentClassName strips AppDialog's own padding/radius/ring below and
// every section here supplies its own spacing, matching the source's per-section `padding` and
// the full-bleed divider/footer band).
const ACCENT = "#2563eb" // the design's own accent is #2b4fd0; kept at the app's real primary
// blue instead so this dialog doesn't introduce a second, near-identical blue into the live app.
const HEADING = "#17202a"
const LABEL = "#3c4552"
const MUTED = "#6b7480"
const FAINT = "#8b93a0"
const BORDER = "#dfe4ec"
const CARD_BORDER = "#e3e8f0"
const OUTER_BORDER = "#e6eaf1"
const DIVIDER = "#edf0f5"
const FIELD_BG = "#fbfcfe"
const CARD_BG_ACTIVE = "#f5f8ff"
const FOOTER_BG = "#fafbfd"
const NOTICE_BG = "#f4f6fa"
const NOTICE_TEXT = "#4a5462"
const ASTERISK = "#c0392b"
const DOT_BORDER = "#c7cedb"
const DISABLED_BG = "#aeb7c6"

// Invitations no longer grant a role: new members start with no permissions
// and gain access only once an admin adds them to a team.
const DEFAULT_INVITE_ROLE_ID = "viewer"

// Both modes support picking several workspaces: invite sends one real invitation per workspace
// (inviteMember already supported this per-call), and direct-add creates one real membership per
// workspace for the same new user, atomically, in one call (createMemberDirect). Leaving none
// selected falls back to the organization's first workspace on the backend either way.
type Draft = {
  fullName: string
  email: string
  workspaceIds: string[]
  password: string
}
const defaultDraft: Draft = {
  fullName: "",
  email: "",
  workspaceIds: [],
  password: "",
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: LABEL }}>
      {children} <span style={{ color: ASTERISK }}>*</span>
    </span>
  )
}

function ModeCard({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={title}
      className="text-right transition-[background,border-color,box-shadow] duration-150"
      style={{
        cursor: "pointer",
        padding: "14px 16px",
        borderRadius: "14px",
        background: selected ? CARD_BG_ACTIVE : "#ffffff",
        border: `1px solid ${selected ? ACCENT : CARD_BORDER}`,
        boxShadow: selected ? `0 0 0 3px ${ACCENT}1a` : "none",
      }}
    >
      <div className="flex items-center" style={{ gap: "10px" }}>
        <span
          className="shrink-0 rounded-full"
          style={{
            width: "16px",
            height: "16px",
            border: `1.5px solid ${selected ? ACCENT : DOT_BORDER}`,
            background: selected
              ? `radial-gradient(circle, ${ACCENT} 0 42%, #ffffff 46% 100%)`
              : "#ffffff",
          }}
        />
        <span style={{ fontSize: "15px", fontWeight: 600, color: HEADING }}>{title}</span>
      </div>
      <div
        style={{
          fontSize: "13px",
          lineHeight: "20px",
          color: MUTED,
          paddingTop: "6px",
          paddingRight: "26px",
        }}
      >
        {subtitle}
      </div>
    </button>
  )
}

interface AdministrationAddUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string | null | undefined
}

export function AdministrationAddUserDialog({
  open,
  onOpenChange,
  organizationId,
}: AdministrationAddUserDialogProps) {
  const { availableWorkspaces } = useWorkspace()
  const inviteableWorkspaces = useMemo(
    () => availableWorkspaces.filter((workspace) => workspace.status !== "archived"),
    [availableWorkspaces]
  )

  const { sendInvitation, createMemberDirect } = useInvitationMutations(organizationId)
  const { sendPasswordReset } = useUserMutations(organizationId)

  const [mode, setMode] = useState<"invite" | "direct">("direct")
  const [draft, setDraft] = useState(defaultDraft)

  const fullName = draft.fullName.trim()
  const email = draft.email.trim()
  const emailValid = EMAIL_RE.test(email)
  const fullNameValid = fullName.length > 1
  // Invite mode only asks for an email -- the invitee types their own name when they accept.
  // Direct-add creates the real account immediately and needs the rest right away.
  const isValid =
    mode === "invite" ? emailValid : emailValid && fullNameValid && draft.password.length >= 12
  const isPending = sendInvitation.isPending || createMemberDirect.isPending

  function close() {
    onOpenChange(false)
    setMode("direct")
    setDraft(defaultDraft)
  }

  async function handleSendInvitation() {
    if (!organizationId || !emailValid) return
    const workspaceIds = draft.workspaceIds.length > 0 ? draft.workspaceIds : [undefined]
    try {
      await Promise.all(
        workspaceIds.map((workspaceId) =>
          sendInvitation.mutateAsync({
            organizationId,
            email,
            roleId: DEFAULT_INVITE_ROLE_ID,
            workspaceId,
          })
        )
      )
      close()
      toast.success(`تم إرسال الدعوة إلى ${email}.`)
    } catch {
      toast.error("تعذر إرسال الدعوة. تحقق من أن البريد الإلكتروني صحيح.")
    }
  }

  function toggleWorkspace(workspaceId: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      workspaceIds: checked
        ? [...current.workspaceIds, workspaceId]
        : current.workspaceIds.filter((id) => id !== workspaceId),
    }))
  }

  async function handleCreateMemberDirect() {
    if (!organizationId || !isValid) return
    try {
      const created = await createMemberDirect.mutateAsync({
        organizationId,
        email,
        fullName,
        workspaceIds: draft.workspaceIds.length > 0 ? draft.workspaceIds : undefined,
        password: draft.password,
      })
      // Best-effort: a real password-reset email gives the new member a real way to set their
      // own password, without ever emailing the admin-chosen temporary one in plain text. If it
      // fails, the member was still created successfully -- only this notification is skipped.
      try {
        await sendPasswordReset.mutateAsync({ organizationId, memberUserId: created.userId })
      } catch {
        toast.error("تمت إضافة المستخدم، لكن تعذر إرسال بريد الإعلام.")
      }
      close()
      toast.success(`تم إضافة ${fullName} مباشرةً.`)
    } catch {
      toast.error("تعذر إضافة المستخدم. تحقق من أن البريد الإلكتروني غير مستخدم من قبل.")
    }
  }

  const notice =
    mode === "invite"
      ? "سيستلم المستخدم رابط دعوة صالحاً لمدة ٧ أيام، ويختار كلمة المرور بنفسه."
      : "سيتم إنشاء الحساب فوراً بكلمة المرور المحددة أعلاه، وسيصله أيضاً رابط حقيقي لتعيين كلمة مرور جديدة عبر البريد الإلكتروني."

  const primaryLabel = mode === "invite" ? "إرسال الدعوة" : "إنشاء وإضافة"
  const primaryDisabled = !isValid || isPending

  const selectedWorkspaces = inviteableWorkspaces.filter((workspace) =>
    draft.workspaceIds.includes(workspace.id)
  )
  const scopeLabel =
    selectedWorkspaces.length === 0
      ? "وصول على مستوى المنظمة"
      : selectedWorkspaces.length === 1
        ? selectedWorkspaces[0].name
        : `${selectedWorkspaces.length} أماكن عمل مختارة`

  const fieldBase = {
    background: FIELD_BG,
    borderColor: BORDER,
    borderRadius: "10px",
  }
  // AppInput/AppPasswordInput reserve space for a startIcon via a "ps-9" child-selector class
  // (and AppPasswordInput always reserves "pe-9" for its own show/hide toggle) -- a plain
  // shorthand `padding` inline style would win over those classes and squash that reserved space,
  // so icon-bearing fields use the logical padding properties instead and simply omit the side
  // a class already owns.
  const iconFieldStyle = {
    ...fieldBase,
    color: HEADING,
    paddingTop: "11px",
    paddingBottom: "11px",
    paddingInlineStart: "38px",
  }
  // The email input sets dir="ltr" on itself (so an email address always reads left-to-right),
  // which flips what "inline-start" means for *that one element* to the left -- while its
  // startIcon span lives in the wrapper div, which stays dir="rtl" from the page and keeps
  // rendering the icon on the right. Logical padding would reserve space on the wrong side, so
  // this field uses a real physical paddingRight instead, matching where the icon actually is.
  const emailFieldStyle = {
    ...fieldBase,
    color: HEADING,
    paddingTop: "11px",
    paddingBottom: "11px",
    paddingLeft: "14px",
    paddingRight: "38px",
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}
      title={<span className="sr-only">إضافة مستخدم</span>}
      showCloseButton={false}
      contentClassName="w-[90vw] max-w-[660px] gap-0 rounded-[20px] border p-0 ring-0"
      // Radix's Content still needs *some* box-shadow token from Tailwind's ring utilities
      // removed via ring-0 above; the design's actual soft shadow + border color are exact
      // values Tailwind's arbitrary-class escaping makes unreadable, so they're set here instead.
    >
      <div
        dir="rtl"
        style={{
          borderColor: OUTER_BORDER,
          boxShadow: "0 32px 70px -24px rgba(23,32,42,0.3), 0 2px 6px rgba(23,32,42,0.05)",
        }}
        className="flex flex-col rounded-[20px] border"
      >
        {/* Header */}
        <div className="flex items-start" style={{ gap: "16px", padding: "26px 28px 22px" }}>
          <span
            className="flex shrink-0 items-center justify-center rounded-xl"
            style={{
              width: "42px",
              height: "42px",
              background: "#eef2fd",
              color: ACCENT,
              fontSize: "20px",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            +
          </span>
          <div className="min-w-0 flex-1">
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                lineHeight: "28px",
                fontWeight: 600,
                color: HEADING,
                letterSpacing: "-0.2px",
              }}
            >
              إضافة مستخدم
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "22px", color: MUTED }}>
              الأعضاء الجدد يبدأون بلا صلاحيات. أضِفهم إلى فريق لاحقاً لمنحهم الوصول.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="إغلاق"
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition-colors hover:bg-[#f2f4f8] hover:text-[#17202a]"
            style={{ width: "32px", height: "32px", color: FAINT, fontSize: "15px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ height: "1px", background: DIVIDER }} />

        {/* Method */}
        <div style={{ padding: "22px 28px 0" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.3px",
              color: FAINT,
              paddingBottom: "10px",
            }}
          >
            طريقة الإضافة
          </div>
          <div className="grid grid-cols-2" style={{ gap: "12px" }}>
            <ModeCard
              title="إضافة مباشرة"
              subtitle="إنشاء الحساب وإضافته فوراً إلى النظام"
              selected={mode === "direct"}
              onClick={() => setMode("direct")}
            />
            <ModeCard
              title="دعوة عبر البريد"
              subtitle="إرسال دعوة للانضمام إلى الفريق"
              selected={mode === "invite"}
              onClick={() => setMode("invite")}
            />
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2" style={{ padding: "22px 28px 0", gap: "18px 16px" }}>
          {mode === "direct" ? (
            <AppInput
              label={<RequiredLabel>الاسم الكامل</RequiredLabel>}
              labelClassName="text-[13px] font-semibold"
              placeholder="مثال: سارة الحربي"
              startIcon={<User className="size-4" />}
              className="h-auto rounded-[10px] text-[14.5px] leading-[22px] focus-visible:ring-[3px]"
              style={iconFieldStyle}
              value={draft.fullName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, fullName: event.target.value }))
              }
            />
          ) : null}
          <AppInput
            label={<RequiredLabel>البريد الإلكتروني</RequiredLabel>}
            labelClassName="text-[13px] font-semibold"
            type="email"
            dir="ltr"
            placeholder="name@madar.local"
            startIcon={<Mail className="size-4" />}
            className={
              "h-auto rounded-[10px] text-right text-[14.5px] leading-[22px] focus-visible:ring-[3px]"
            }
            wrapperClassName={mode === "invite" ? "col-span-2" : undefined}
            style={emailFieldStyle}
            value={draft.email}
            onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
          />

          <div className="col-span-2 flex flex-col" style={{ gap: "7px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: LABEL }}>
              نطاق الوصول <span style={{ fontWeight: 400, color: FAINT }}>(اختياري)</span>
            </div>

            <AppPopover>
              <AppPopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[10px] transition-shadow data-[state=open]:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] [&>svg]:transition-transform data-[state=open]:[&>svg]:rotate-180 data-[state=open]:[&>svg]:text-[#2563eb]"
                  style={{
                    padding: "22px 14px",
                    background: FIELD_BG,
                    border: `1px solid ${BORDER}`,
                    color: draft.workspaceIds.length > 0 ? HEADING : FAINT,
                    fontSize: "14.5px",
                    lineHeight: "22px",
                  }}
                >
                  <span>{scopeLabel}</span>
                  <ChevronDown className="size-4 shrink-0" style={{ color: FAINT }} />
                </button>
              </AppPopoverTrigger>
              <AppPopoverContent
                align="start"
                sideOffset={6}
                className="w-[var(--radix-popover-trigger-width)] flex-col gap-0 rounded-[12px] border-[#e2e7f0] p-1.5 shadow-none ring-0"
                style={{
                  boxShadow: "0 18px 38px -14px rgba(23,32,42,0.35), 0 2px 6px rgba(23,32,42,0.06)",
                }}
              >
                {inviteableWorkspaces.length === 0 ? (
                  <p style={{ padding: "10px", fontSize: "13px", color: FAINT }}>
                    لا توجد أماكن عمل متاحة.
                  </p>
                ) : (
                  inviteableWorkspaces.map((workspace) => (
                    <label
                      key={workspace.id}
                      htmlFor={`scope-workspace-${workspace.id}`}
                      className="flex cursor-pointer items-center rounded-[8px] hover:bg-[#f3f5fa]"
                      style={{ gap: "10px", padding: "9px 10px" }}
                    >
                      <AppCheckbox
                        id={`scope-workspace-${workspace.id}`}
                        checked={draft.workspaceIds.includes(workspace.id)}
                        onCheckedChange={(checked) =>
                          toggleWorkspace(workspace.id, checked === true)
                        }
                      />
                      <span style={{ fontSize: "14.5px", lineHeight: "22px", color: HEADING }}>
                        {workspace.name}
                      </span>
                    </label>
                  ))
                )}
              </AppPopoverContent>
            </AppPopover>
            <p style={{ fontSize: "12.5px", lineHeight: "19px", color: FAINT }}>
              {mode === "invite"
                ? "اتركها بلا تحديد لمنح وصول على مستوى المنظمة. سيتم إرسال دعوة منفصلة لكل مكان عمل تختاره."
                : "اتركها بلا تحديد لمنح وصول على مستوى المنظمة. سيتم إنشاء عضوية منفصلة لكل مكان عمل تختاره فور الإنشاء."}
            </p>
          </div>

          {mode === "direct" ? (
            <div className="col-span-2">
              <AppPasswordInput
                label={<RequiredLabel>كلمة المرور</RequiredLabel>}
                labelClassName="text-[13px] font-semibold"
                helperText="يجب ألا تقل عن 12 حرفاً"
                placeholder="أدخل كلمة مرور مؤقتة"
                startIcon={<Lock className="size-4" />}
                className="h-auto rounded-[10px] text-[14.5px] leading-[22px] focus-visible:ring-[3px]"
                style={iconFieldStyle}
                value={draft.password}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, password: event.target.value }))
                }
              />
            </div>
          ) : null}
        </div>

        {/* Notice */}
        <div style={{ padding: "22px 28px 0" }}>
          <div
            style={{
              fontSize: "13px",
              lineHeight: "21px",
              color: NOTICE_TEXT,
              background: NOTICE_BG,
              border: `1px solid ${OUTER_BORDER}`,
              borderRadius: "12px",
              padding: "12px 14px",
            }}
          >
            {notice}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center"
          style={{
            gap: "10px",
            padding: "22px 28px 24px",
            marginTop: "20px",
            borderTop: `1px solid ${DIVIDER}`,
            background: FOOTER_BG,
            borderRadius: "0 0 19px 19px",
          }}
        >
          <button
            type="button"
            onClick={() =>
              void (mode === "invite" ? handleSendInvitation() : handleCreateMemberDirect())
            }
            disabled={primaryDisabled}
            style={{
              padding: "11px 22px",
              fontSize: "14.5px",
              fontWeight: 600,
              color: "#ffffff",
              background: primaryDisabled ? DISABLED_BG : ACCENT,
              border: "1px solid transparent",
              borderRadius: "10px",
              cursor: primaryDisabled ? "not-allowed" : "pointer",
              boxShadow: primaryDisabled ? "none" : "0 6px 14px -6px rgba(23,32,42,0.5)",
            }}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={close}
            className="transition-colors hover:bg-[#f2f4f8]"
            style={{
              padding: "11px 20px",
              fontSize: "14.5px",
              fontWeight: 600,
              color: LABEL,
              background: "#ffffff",
              border: `1px solid ${BORDER}`,
              borderRadius: "10px",
              cursor: "pointer",
            }}
          >
            إلغاء
          </button>
          <div className="flex-1" />
        </div>
      </div>
    </AppDialog>
  )
}
