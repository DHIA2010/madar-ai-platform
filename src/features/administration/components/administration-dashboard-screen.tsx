"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { History, Mail, Search, Shield, ShieldCheck, Users, UsersRound } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppInput } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { formatRelativeArabic } from "../lib/format-arabic-time"
import { useAuditLogsQuery } from "../queries/use-audit-logs-query"
import { useInvitationsQuery } from "../queries/use-invitations-query"
import { useRolesQuery } from "../queries/use-roles-query"
import { useTeamsQuery } from "../queries/use-teams-query"
import { useUsersQuery } from "../queries/use-users-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application/context"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

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
      {/* No real historical snapshot exists for this count yet -- always the neutral state
          rather than a fabricated trend. */}
      <span className={cn("flex items-center gap-1 text-[11px] font-semibold", MUTED)}>— 0%</span>
    </div>
  )
}

const QUICK_ACTIONS = [
  {
    href: ROUTES.administrationInvitations,
    label: "دعوة مستخدم",
    description: "إرسال دعوة جديدة",
    icon: Mail,
    tint: "bg-[#eff6ff] text-[#2563eb]",
  },
  {
    href: ROUTES.administrationRoles,
    label: "إضافة دور",
    description: "إنشاء دور مخصص",
    icon: ShieldCheck,
    tint: "bg-[#f5f3ff] text-[#7c3aed]",
  },
  {
    href: ROUTES.administrationTeams,
    label: "إنشاء فريق",
    description: "تنظيم المستخدمين",
    icon: UsersRound,
    tint: "bg-[#f0fdf4] text-[#16a34a]",
  },
  {
    href: ROUTES.administrationAuditLog,
    label: "عرض سجل التدقيق",
    description: "مراجعة جميع الأنشطة",
    icon: History,
    tint: "bg-[#fffbeb] text-[#92400e]",
  },
]

export function AdministrationDashboardScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { currentOrganization } = useWorkspace()
  const organizationId = currentOrganization?.id

  const usersQuery = useUsersQuery(administrationApplicationService, organizationId)
  const rolesQuery = useRolesQuery(administrationApplicationService, organizationId)
  const teamsQuery = useTeamsQuery(administrationApplicationService, organizationId)
  const invitationsQuery = useInvitationsQuery(administrationApplicationService, organizationId)
  const activityQuery = useAuditLogsQuery(administrationApplicationService, 1, 6)

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data])
  const invitations = useMemo(() => invitationsQuery.data ?? [], [invitationsQuery.data])

  const [query, setQuery] = useState("")

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []

    const userResults = users
      .filter(
        (user) =>
          user.fullName.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
      )
      .map((user) => ({ type: "مستخدم", label: `${user.fullName} · ${user.email}` }))
    const teamResults = teams
      .filter((team) => team.name.toLowerCase().includes(term))
      .map((team) => ({ type: "فريق", label: team.name }))
    const roleResults = roles
      .filter((role) => role.name.toLowerCase().includes(term))
      .map((role) => ({ type: "دور", label: role.name }))
    const invitationResults = invitations
      .filter((invitation) => invitation.email.toLowerCase().includes(term))
      .map((invitation) => ({ type: "دعوة", label: invitation.email }))

    return [...userResults, ...teamResults, ...roleResults, ...invitationResults].slice(0, 10)
  }, [invitations, query, roles, teams, users])

  return (
    <div dir="rtl" className="flex flex-col gap-4 pb-10">
      <AdministrationModuleNav />

      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.dashboard} className="hover:text-[#2563eb]">
          الرئيسية
        </Link>
        <span>/</span>
        <span className={cn("font-semibold", HEADING)}>الإدارة</span>
      </nav>

      <div>
        <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>لوحة الإدارة</h1>
        <p className={cn("mt-1 text-[13px]", MUTED)}>
          إدارة المستخدمين، الأدوار، الصلاحيات، والحوكمة في المنصة.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Mail}
          tint="bg-[#f5f3ff] text-[#7c3aed]"
          label="الدعوات"
          value={invitations.length}
        />
        <StatCard
          icon={UsersRound}
          tint="bg-[#f0fdf4] text-[#16a34a]"
          label="الفرق"
          value={teams.length}
        />
        <StatCard
          icon={ShieldCheck}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="الأدوار"
          value={roles.length}
        />
        <StatCard
          icon={Users}
          tint="bg-[#fffbeb] text-[#92400e]"
          label="المستخدمون"
          value={users.length}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={cn(PANEL, "p-5")}>
          <div className="mb-3 flex items-center gap-1.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <Search className="size-4" />
            </span>
            <h2 className={cn("text-[14px] font-extrabold", HEADING)}>
              البحث الشامل في إدارة الهوية
            </h2>
          </div>
          <p className={cn("mb-3 text-[12px]", MUTED)}>
            ابحث في المستخدمين، الفرق، الأدوار، أو الدعوات بسرعة.
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
            <AppInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="اكتب للبحث..."
              className="h-11 rounded-[10px] border-[#e8edf3] bg-white ps-9 text-[13px]"
            />
          </div>
          {query.trim() === "" ? null : searchResults.length === 0 ? (
            <p className={cn("mt-3 text-[12px]", MUTED)}>لا توجد نتائج مطابقة.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              {searchResults.map((result) => (
                <div
                  key={`${result.type}-${result.label}`}
                  className="flex items-center justify-between rounded-[10px] border border-[#e8edf3] px-3 py-2 text-[12.5px]"
                >
                  <span className={HEADING}>{result.label}</span>
                  <span className="rounded-full bg-[#f4f7fc] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#5b6b85]">
                    {result.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={cn(PANEL, "p-5")}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <Shield className="size-4" />
            </span>
            <h2 className={cn("text-[14px] font-extrabold", HEADING)}>إدارة آمنة ومرنة</h2>
          </div>
          <p className={cn("mb-3 text-[12px] leading-6", MUTED)}>
            تحكم في وصول المستخدمين، خصص الأدوار والصلاحيات، وتابع جميع الأنشطة لضمان أمان بياناتك.
          </p>
          <ul className="flex flex-col gap-1.5">
            {["تحكم دقيق في الصلاحيات", "سجل تدقيق شامل", "دعم الفرق متعددة الأقسام"].map(
              (item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-[12px] font-semibold text-[#15803d]"
                >
                  <span className="flex size-4 items-center justify-center rounded-full bg-[#f0fdf4]">
                    ✓
                  </span>
                  {item}
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={cn(PANEL, "p-5")}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={cn("text-[14px] font-extrabold", HEADING)}>آخر الأنشطة</h2>
            <Link
              href={ROUTES.administrationActivityLog}
              className="text-[11.5px] font-semibold text-[#2563eb] hover:underline"
            >
              عرض الكل
            </Link>
          </div>
          {(activityQuery.data?.items.length ?? 0) === 0 ? (
            <p className={cn("py-6 text-center text-[12px]", MUTED)}>لا توجد أنشطة بعد.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {activityQuery.data!.items.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] bg-[#f7faff] px-3 py-2.5"
                >
                  <div>
                    <p className={cn("text-[12.5px] font-bold", HEADING)}>{entry.action}</p>
                    <p className={cn("text-[11px]", MUTED)}>
                      {entry.actor} بواسطة {entry.target}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-[11px]", MUTED)}>
                    {formatRelativeArabic(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={cn(PANEL, "p-5")}>
          <h2 className={cn("mb-3 text-[14px] font-extrabold", HEADING)}>الإجراءات السريعة</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex flex-col gap-2 rounded-[10px] border border-[#e8edf3] p-3 hover:border-[#c7d9ff]"
              >
                <span
                  className={cn("flex size-9 items-center justify-center rounded-lg", action.tint)}
                >
                  <action.icon className="size-4" />
                </span>
                <span>
                  <span className={cn("block text-[12px] font-bold", HEADING)}>{action.label}</span>
                  <span className={cn("block text-[10.5px]", MUTED)}>{action.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
