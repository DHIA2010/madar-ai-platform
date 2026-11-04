"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppCheckbox,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { crmService, formatRelative } from "../services"
import type { CrmTask } from "../types"
import { CrmDateRange, SavedViews } from "./crm-filters"
import { formatDateTime, isOverdue, OwnerAvatar } from "./crm-ui"

type Status = "overdue" | "open" | "done"

const STATUS_TABS: { key: Status; label: string }[] = [
  { key: "overdue", label: "المتأخرة" },
  { key: "open", label: "كل المفتوحة" },
  { key: "done", label: "المنجزة" },
]

// Follow-ups across every lead: what's due, what's late, what's done.
export function MadarAdminCrmTasks() {
  const [status, setStatus] = useState<Status>("overdue")
  const [scope, setScope] = useState<"mine" | "all">("mine")
  const [range, setRange] = useState<{ from?: string; to?: string }>({})
  const [tasks, setTasks] = useState<CrmTask[] | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    crmService
      .listTasks({ scope, status, from: range.from, to: range.to })
      .then((result) => {
        if (active) setTasks(result)
      })
      .catch(() => toast.error("تعذر تحميل المتابعات."))
    return () => {
      active = false
    }
  }, [scope, status, range, reload])

  async function toggle(task: CrmTask, done: boolean) {
    setTasks((current) => current?.filter((entry) => entry.id !== task.id) ?? null)
    try {
      await crmService.setTaskDone(task.id, done)
      toast.success(done ? "أُنجزت المتابعة." : "أُعيد فتح المتابعة.")
    } catch {
      toast.error("تعذر تحديث المتابعة.")
    } finally {
      setReload((key) => key + 1)
    }
  }

  const tabClass = (active: boolean) =>
    cn(
      "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
    )

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">المتابعات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مهام المتابعة مع العملاء المحتملين. أضف متابعة من صفحة أي عميل محتمل.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="flex rounded-[10px] border border-border/60 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={tabClass(status === tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-[10px] border border-border/60 p-1">
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={tabClass(scope === "mine")}
          >
            متابعاتي
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={tabClass(scope === "all")}
          >
            كل الفريق
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CrmDateRange
            from={range.from}
            to={range.to}
            placeholder="تاريخ الاستحقاق"
            onChange={setRange}
          />
          <SavedViews
            page="tasks"
            current={{ status, scope, ...range }}
            onApply={(definition) => {
              if (typeof definition.status === "string") setStatus(definition.status as Status)
              if (definition.scope === "mine" || definition.scope === "all")
                setScope(definition.scope)
              setRange({
                from: typeof definition.from === "string" ? definition.from : undefined,
                to: typeof definition.to === "string" ? definition.to : undefined,
              })
            }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead className="w-12" />
              <AppTableHead>المتابعة</AppTableHead>
              <AppTableHead>العميل المحتمل</AppTableHead>
              <AppTableHead>الموعد</AppTableHead>
              <AppTableHead>المسؤول</AppTableHead>
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {(tasks ?? []).map((task) => {
              const late = !task.doneAt && isOverdue(task.dueAt)
              return (
                <AppTableRow key={task.id}>
                  <AppTableCell>
                    <AppCheckbox
                      checked={Boolean(task.doneAt)}
                      onCheckedChange={(checked) => void toggle(task, checked === true)}
                      aria-label="منجزة"
                    />
                  </AppTableCell>
                  <AppTableCell
                    className={cn(
                      "font-semibold",
                      task.doneAt ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {task.title}
                  </AppTableCell>
                  <AppTableCell>
                    <Link
                      href={ROUTES.madarAdminCrmLead(task.leadId)}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {task.leadCompanyName}
                    </Link>
                  </AppTableCell>
                  <AppTableCell
                    className={cn(
                      "text-sm",
                      late ? "font-semibold text-rose-600" : "text-muted-foreground"
                    )}
                    title={formatDateTime(task.dueAt)}
                  >
                    {formatDateTime(task.dueAt)}
                    <span className="ms-1.5 text-xs">({formatRelative(task.dueAt)})</span>
                  </AppTableCell>
                  <AppTableCell>
                    <OwnerAvatar person={task.assignee} />
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>
        {tasks === null ? (
          <div className="h-32 animate-pulse bg-muted/40" />
        ) : tasks.length === 0 ? (
          <AppTableEmpty
            title={status === "overdue" ? "لا توجد متابعات متأخرة 🎉" : "لا توجد متابعات"}
            description="أضف متابعة من صفحة العميل المحتمل."
          />
        ) : null}
      </div>
    </div>
  )
}
