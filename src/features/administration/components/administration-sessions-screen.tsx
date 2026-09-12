"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Laptop, Loader2, LogOut, Monitor, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppConfirmDialog } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { formatRelativeArabic } from "../lib/format-arabic-time"
import { useOrganizationSessionsQuery } from "../queries/use-organization-sessions-query"
import { useSessionMutations } from "../queries/use-session-mutations"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"
import type { AdministrationOrgSessionDto } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

const DEVICE_ICON: Record<string, typeof Monitor> = {
  iPhone: Smartphone,
  Android: Smartphone,
  iPad: Laptop,
  Mac: Laptop,
  Windows: Monitor,
  Linux: Monitor,
}

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof Monitor
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

export function AdministrationSessionsScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const { data, isLoading, isError } = useOrganizationSessionsQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const { revokeSession } = useSessionMutations()
  const sessions = useMemo(() => data ?? [], [data])

  const [terminatingId, setTerminatingId] = useState<string | null>(null)
  const [confirmingTerminateAll, setConfirmingTerminateAll] = useState(false)

  const uniqueUsers = new Set(sessions.map((session) => session.userId)).size
  const uniqueDevices = new Set(
    sessions.map((session) => `${session.userId}-${session.device}-${session.browser}`)
  ).size

  async function handleTerminate(session: AdministrationOrgSessionDto) {
    setTerminatingId(session.id)
    try {
      await revokeSession.mutateAsync(session.id)
      toast.success("تم إنهاء الجلسة.")
    } catch {
      toast.error("تعذر إنهاء الجلسة.")
    } finally {
      setTerminatingId(null)
    }
  }

  async function handleTerminateAllOthers() {
    const others = sessions.filter((session) => !session.current)
    if (others.length === 0) return
    try {
      await Promise.all(others.map((session) => revokeSession.mutateAsync(session.id)))
      toast.success(`تم إنهاء ${others.length} جلسة.`)
    } catch {
      toast.error("تعذر إنهاء بعض الجلسات.")
    } finally {
      setConfirmingTerminateAll(false)
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
          <Monitor className="size-3.5" />
          الجلسات النشطة
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
            الجلسات النشطة
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            مراقبة الأجهزة المتصلة وإدارة الجلسات النشطة لجميع المستخدمين.
          </p>
        </div>
        <AppButton
          variant="outline"
          onClick={() => setConfirmingTerminateAll(true)}
          disabled={sessions.every((session) => session.current)}
          className="h-11 gap-2 rounded-[10px] border-[#fecaca] px-5 text-[13px] font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
        >
          <LogOut className="size-4" />
          إنهاء جميع الجلسات الأخرى
        </AppButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Monitor}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="إجمالي الجلسات النشطة"
          value={sessions.length}
        />
        <StatCard
          icon={Laptop}
          tint="bg-[#f0fdf4] text-[#16a34a]"
          label="مستخدمون متصلون"
          value={uniqueUsers}
        />
        <StatCard
          icon={AlertTriangle}
          tint="bg-[#fffbeb] text-[#92400e]"
          label="أجهزة متصلة"
          value={uniqueDevices}
        />
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        {isLoading ? (
          <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل الجلسات...
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-[13px] text-[#dc2626]">تعذر تحميل الجلسات.</p>
        ) : sessions.length === 0 ? (
          <p className={cn("p-10 text-center text-[12.5px]", MUTED)}>لا توجد جلسات نشطة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-center">
              <thead>
                <tr>
                  {[
                    { key: "user", label: "المستخدم" },
                    { key: "device", label: "الجهاز" },
                    { key: "browser", label: "المتصفح" },
                    { key: "ip", label: "عنوان IP" },
                    { key: "location", label: "الموقع" },
                    { key: "lastActivity", label: "آخر نشاط" },
                    { key: "status", label: "الحالة" },
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
                {sessions.map((session, index) => {
                  const Icon = DEVICE_ICON[session.device] ?? Monitor
                  return (
                    <tr
                      key={session.id}
                      className={cn(
                        "border-b border-[#f4f7fb] last:border-b-0",
                        index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                      )}
                    >
                      <td className="px-3 py-3 text-right">
                        <p className={cn("text-[12.5px] font-bold", HEADING)}>
                          {session.fullName ?? "—"}
                        </p>
                        <p className={cn("text-[10.5px]", MUTED)}>{session.email}</p>
                      </td>
                      <td className={cn("px-3 py-3 text-[12px] font-semibold", HEADING)}>
                        <span className="flex items-center justify-center gap-1.5">
                          <Icon className="size-3.5 text-[#5b6b85]" />
                          {session.device}
                        </span>
                      </td>
                      <td className={cn("px-3 py-3 text-[12px]", MUTED)}>{session.browser}</td>
                      <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>{session.ip}</td>
                      <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                        {session.location ?? "غير معروف"}
                      </td>
                      <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                        {formatRelativeArabic(session.lastActivity)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            session.current
                              ? "bg-[#eff6ff] text-[#2563eb]"
                              : "bg-[#f0fdf4] text-[#15803d]"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              session.current ? "bg-[#2563eb]" : "bg-[#22c55e]"
                            )}
                          />
                          {session.current ? "الجلسة الحالية" : "نشطة"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={session.current || terminatingId === session.id}
                          onClick={() => void handleTerminate(session)}
                          className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e8edf3] px-3 text-[11.5px] font-semibold text-[#dc2626] hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          إنهاء
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AppConfirmDialog
        open={confirmingTerminateAll}
        onOpenChange={setConfirmingTerminateAll}
        title={<span dir="rtl">إنهاء جميع الجلسات الأخرى</span>}
        description={
          <span dir="rtl">
            سيتم تسجيل خروج جميع المستخدمين من كل الجلسات النشطة باستثناء جلستك الحالية.
          </span>
        }
        confirmLabel="إنهاء الجلسات"
        cancelLabel="إلغاء"
        confirmTone="destructive"
        onConfirm={handleTerminateAllOthers}
        onCancel={() => setConfirmingTerminateAll(false)}
        contentClassName="[direction:rtl]"
      />
    </div>
  )
}
