"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, BarChart3, Database, Loader2, Search, UserCog } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { formatFullArabicDateTime } from "../lib/format-arabic-time"
import { useAuditLogsQuery } from "../queries/use-audit-logs-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"
import type { AuditLogEventDto } from "@/application/contracts"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"

const SEVERITY_LABEL: Record<AuditLogEventDto["severity"], string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "عالي",
}
const SEVERITY_TINT: Record<AuditLogEventDto["severity"], string> = {
  low: "bg-[#f0fdf4] text-[#15803d]",
  medium: "bg-[#fffbeb] text-[#92400e]",
  high: "bg-[#fef2f2] text-[#dc2626]",
}

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof BarChart3
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

export function AdministrationAuditLogScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { data, isLoading, isError } = useAuditLogsQuery(administrationApplicationService, 1, 200)
  const allEvents = useMemo(() => data?.items ?? [], [data])

  const [query, setQuery] = useState("")
  const [userFilter, setUserFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState<"all" | AuditLogEventDto["severity"]>("all")

  const availableActors = useMemo(
    () => Array.from(new Set(allEvents.map((event) => event.actor))).sort(),
    [allEvents]
  )

  const events = useMemo(() => {
    const term = query.trim().toLowerCase()
    return allEvents.filter((event) => {
      const matchesQuery =
        term === "" ||
        event.actor.toLowerCase().includes(term) ||
        event.action.toLowerCase().includes(term) ||
        event.target.toLowerCase().includes(term)
      const matchesUser = userFilter === "all" || event.actor === userFilter
      const matchesSeverity = severityFilter === "all" || event.severity === severityFilter
      return matchesQuery && matchesUser && matchesSeverity
    })
  }, [allEvents, query, severityFilter, userFilter])

  const securityEventCount = allEvents.filter((event) => event.severity === "high").length
  const userChangeCount = allEvents.filter(
    (event) => event.action.startsWith("membership") || event.action.startsWith("identity")
  ).length
  const dataChangeCount = allEvents.length - userChangeCount

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
          <BarChart3 className="size-3.5" />
          سجلات التدقيق
        </span>
      </nav>

      <div>
        <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>سجلات التدقيق</h1>
        <p className={cn("mt-1 text-[13px]", MUTED)}>
          سجل زمني لعمليات النظام والأحداث الأمنية والحوكمة.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={AlertTriangle}
          tint="bg-[#fef2f2] text-[#dc2626]"
          label="أحداث أمنية"
          value={securityEventCount}
        />
        <StatCard
          icon={UserCog}
          tint="bg-[#eff6ff] text-[#2563eb]"
          label="تغييرات المستخدمين"
          value={userChangeCount}
        />
        <StatCard
          icon={Database}
          tint="bg-[#f0fdf4] text-[#16a34a]"
          label="تغييرات البيانات"
          value={dataChangeCount}
        />
        <StatCard
          icon={BarChart3}
          tint="bg-[#f5f3ff] text-[#7c3aed]"
          label="إجمالي الأحداث"
          value={data?.total ?? allEvents.length}
        />
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-center gap-2 p-4")}>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
          <AppInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="البحث في سجل الأحداث..."
            className="h-10 rounded-[10px] border-[#e8edf3] bg-white ps-9 text-[13px]"
          />
        </div>
        <AppSelect
          value={severityFilter}
          onValueChange={(value) =>
            setSeverityFilter(value as "all" | AuditLogEventDto["severity"])
          }
        >
          <AppSelectTrigger className="h-10 w-[170px] rounded-[10px] border-[#e8edf3] text-[13px]">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع مستويات الخطورة</AppSelectItem>
            <AppSelectItem value="low">منخفض</AppSelectItem>
            <AppSelectItem value="medium">متوسط</AppSelectItem>
            <AppSelectItem value="high">عالي</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect value={userFilter} onValueChange={setUserFilter}>
          <AppSelectTrigger className="h-10 w-[170px] rounded-[10px] border-[#e8edf3] text-[13px]">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع المستخدمين</AppSelectItem>
            {availableActors.map((actor) => (
              <AppSelectItem key={actor} value={actor}>
                {actor}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>
      </div>

      <section className={cn(PANEL, "overflow-hidden")}>
        {isLoading ? (
          <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل السجل...
          </div>
        ) : isError ? (
          <p className="p-8 text-center text-[13px] text-[#dc2626]">تعذر تحميل السجل.</p>
        ) : events.length === 0 ? (
          <p className={cn("p-10 text-center text-[12.5px]", MUTED)}>لا توجد أحداث مطابقة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-center">
              <thead>
                <tr>
                  {[
                    { key: "time", label: "الوقت والتاريخ" },
                    { key: "user", label: "المستخدم" },
                    { key: "type", label: "النوع" },
                    { key: "description", label: "الوصف" },
                    { key: "target", label: "الكيان المستهدف" },
                    { key: "ip", label: "عنوان IP" },
                    { key: "severity", label: "مستوى الخطورة" },
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
                {events.map((event, index) => (
                  <tr
                    key={event.id}
                    className={cn(
                      "border-b border-[#f4f7fb] last:border-b-0",
                      index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                    )}
                  >
                    <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                      {formatFullArabicDateTime(event.createdAt)}
                    </td>
                    <td className={cn("px-3 py-3 text-[12px] font-semibold", HEADING)}>
                      {event.actor}
                    </td>
                    <td className={cn("px-3 py-3 text-[11px] font-bold uppercase", MUTED)}>
                      {event.action}
                    </td>
                    <td className={cn("px-3 py-3 text-[12px]", HEADING)}>
                      {event.action.replace(/[._]/g, " ")}
                    </td>
                    <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>{event.target}</td>
                    <td className={cn("px-3 py-3 text-[11.5px]", MUTED)}>
                      {event.ipAddress ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          SEVERITY_TINT[event.severity]
                        )}
                      >
                        {SEVERITY_LABEL[event.severity]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
