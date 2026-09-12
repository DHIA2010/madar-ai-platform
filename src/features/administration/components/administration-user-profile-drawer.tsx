"use client"

import { Laptop, Loader2, Monitor, Smartphone } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppButton, AppDrawer } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { formatRelativeArabic } from "../lib/format-arabic-time"
import { useAuditLogsQuery } from "../queries/use-audit-logs-query"
import { useOrganizationSessionsQuery } from "../queries/use-organization-sessions-query"

import { useApplicationServices } from "@/application/context"
import type { AdministrationRoleDto, AdministrationUserDto } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL = "rounded-2xl border border-[#e8edf3] bg-white"

type AdministrationUserProfileDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: AdministrationUserDto
  role?: AdministrationRoleDto
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const DEVICE_ICON: Record<string, typeof Monitor> = {
  iPhone: Smartphone,
  Android: Smartphone,
  iPad: Laptop,
  Mac: Laptop,
  Windows: Monitor,
  Linux: Monitor,
}

export function AdministrationUserProfileDrawer({
  open,
  onOpenChange,
  user,
  role,
}: AdministrationUserProfileDrawerProps) {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()

  // Real per-user data, fetched only while the drawer is actually open for this user -- too
  // expensive to eagerly join onto every row of the user list.
  const activityQuery = useAuditLogsQuery(administrationApplicationService, 1, 20, user?.id)
  const sessionsQuery = useOrganizationSessionsQuery(
    administrationApplicationService,
    open ? currentOrganization?.id : undefined
  )
  const userSessions = (sessionsQuery.data ?? []).filter((session) => session.userId === user?.id)

  return (
    <AppDrawer
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="w-full overflow-y-auto sm:max-w-lg [direction:rtl]"
      title={
        <span dir="rtl" className={cn("text-[16px] font-extrabold", HEADING)}>
          الملف الشخصي
        </span>
      }
      description={
        <span dir="rtl" className={cn("text-[12px]", MUTED)}>
          الهوية، نطاق الوصول، وحالة الجلسات.
        </span>
      }
    >
      {!user ? null : (
        <div dir="rtl" className="flex flex-col gap-4">
          <div className={cn(PANEL, "flex items-center gap-3 p-3.5")}>
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eff6ff] text-[15px] font-bold text-[#2563eb]">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt={user.fullName} className="size-full object-cover" />
              ) : (
                initials(user.fullName)
              )}
            </span>
            <div>
              <p className={cn("text-[14px] font-extrabold", HEADING)}>{user.fullName}</p>
              <p className={cn("text-[12px]", MUTED)}>{user.email}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {user.department ? (
                  <span className="rounded-full bg-[#f4f7fc] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#5b6b85]">
                    {user.department}
                  </span>
                ) : null}
                <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#15803d]">
                  {user.status === "active" ? "نشط" : user.status}
                </span>
              </div>
            </div>
          </div>

          <div className={cn(PANEL, "flex flex-col gap-2 p-3.5")}>
            <h3 className={cn("text-[12.5px] font-extrabold", HEADING)}>الوصول</h3>
            <p className="text-[12px]">
              <span className={MUTED}>الدور: </span>
              <span className={cn("font-semibold", HEADING)}>{role?.name ?? "—"}</span>
            </p>
            <p className="text-[12px]">
              <span className={MUTED}>أماكن العمل: </span>
              <span className={cn("font-semibold", HEADING)}>
                {user.workspaces.join("، ") || "—"}
              </span>
            </p>
            <p className="text-[12px]">
              <span className={MUTED}>الفرق: </span>
              <span className={cn("font-semibold", HEADING)}>{user.teams.join("، ") || "—"}</span>
            </p>
          </div>

          <div className={cn(PANEL, "flex flex-col gap-2 p-3.5")}>
            <h3 className={cn("text-[12.5px] font-extrabold", HEADING)}>آخر النشاطات</h3>
            {activityQuery.isLoading ? (
              <div className={cn("flex items-center gap-2 py-3 text-[12px]", MUTED)}>
                <Loader2 className="size-3.5 animate-spin" />
                جارٍ التحميل...
              </div>
            ) : (activityQuery.data?.items.length ?? 0) === 0 ? (
              <p className={cn("py-3 text-center text-[12px]", MUTED)}>لا توجد نشاطات مسجلة بعد.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {activityQuery.data!.items.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="rounded-[10px] bg-[#f7faff] px-3 py-2 text-[12px]">
                    <p className={cn("font-semibold", HEADING)}>{entry.action}</p>
                    <p className={MUTED}>{formatRelativeArabic(entry.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cn(PANEL, "flex flex-col gap-2 p-3.5")}>
            <h3 className={cn("text-[12.5px] font-extrabold", HEADING)}>الجلسات والأجهزة</h3>
            {sessionsQuery.isLoading ? (
              <div className={cn("flex items-center gap-2 py-3 text-[12px]", MUTED)}>
                <Loader2 className="size-3.5 animate-spin" />
                جارٍ التحميل...
              </div>
            ) : userSessions.length === 0 ? (
              <p className={cn("py-3 text-center text-[12px]", MUTED)}>لا توجد جلسات نشطة.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {userSessions.map((session) => {
                  const Icon = DEVICE_ICON[session.device] ?? Monitor
                  return (
                    <div
                      key={session.id}
                      className="flex items-center gap-2.5 rounded-[10px] bg-[#f7faff] px-3 py-2"
                    >
                      <Icon className="size-4 text-[#5b6b85]" />
                      <div className="text-[12px]">
                        <p className={cn("font-semibold", HEADING)}>
                          {session.browser} · {session.device}
                        </p>
                        <p className={MUTED}>
                          آخر نشاط {formatRelativeArabic(session.lastActivity)}
                          {session.current ? " · الجلسة الحالية" : ""}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <AppButton
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] text-[13px] font-semibold text-[#5b6b85]"
            onClick={() => onOpenChange(false)}
          >
            إغلاق
          </AppButton>
        </div>
      )}
    </AppDrawer>
  )
}
