"use client"

import { useMemo, useState } from "react"

import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppInput,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import type { IamPermissionAction, IamPermissionGroup } from "../types"

const ACTION_COLUMNS: IamPermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "import",
  "approve",
  "publish",
  "manage",
]

type PermissionMatrixProps = {
  groups: IamPermissionGroup[]
  title?: string
  subtitle?: string
}

function getKey(module: string, action: string) {
  return `${module}:${action}`
}

export function PermissionMatrix({
  groups,
  title = "Permission Matrix",
  subtitle,
}: PermissionMatrixProps) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    groups.forEach((group) => {
      group.actions.forEach((action) => {
        initial[getKey(group.module, action)] = action === "view"
      })
    })
    return initial
  })

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return groups
    return groups.filter((group) => {
      return (
        group.label.toLowerCase().includes(term) ||
        group.actions.some((action) => action.toLowerCase().includes(term))
      )
    })
  }, [groups, query])

  function toggleModule(moduleKey: string) {
    setExpanded((current) => ({
      ...current,
      [moduleKey]: !current[moduleKey],
    }))
  }

  function setAll(value: boolean) {
    setSelected((current) => {
      const next = { ...current }
      filtered.forEach((group) => {
        ACTION_COLUMNS.forEach((action) => {
          if (group.actions.includes(action)) {
            next[getKey(group.module, action)] = value
          }
        })
      })
      return next
    })
  }

  return (
    <AppCard
      title={title}
      subtitle={subtitle ?? "Use module-level controls for enterprise-grade permission governance."}
      className="shadow-sm"
      contentClassName="space-y-4"
      actions={
        <div className="flex items-center gap-2">
          <AppButton variant="outline" size="sm" onClick={() => setAll(true)}>
            Bulk enable
          </AppButton>
          <AppButton variant="outline" size="sm" onClick={() => setAll(false)}>
            Bulk disable
          </AppButton>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <AppInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search modules or permissions"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead className="w-[220px]">Module</AppTableHead>
              {ACTION_COLUMNS.map((action) => (
                <AppTableHead key={action} className="text-center capitalize">
                  {action}
                </AppTableHead>
              ))}
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {filtered.map((group) => {
              const isExpanded = expanded[group.module] ?? true
              return [
                <AppTableRow key={group.module}>
                  <AppTableCell>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-sm font-medium hover:text-primary"
                      onClick={() => toggleModule(group.module)}
                    >
                      <span>{isExpanded ? "−" : "+"}</span>
                      <span>{group.label}</span>
                    </button>
                  </AppTableCell>
                  {ACTION_COLUMNS.map((action) => {
                    const enabled = group.actions.includes(action)
                    const key = getKey(group.module, action)
                    return (
                      <AppTableCell key={key} className="text-center">
                        {enabled ? (
                          <AppCheckbox
                            checked={selected[key] ?? false}
                            onCheckedChange={(checked) => {
                              setSelected((current) => ({
                                ...current,
                                [key]: Boolean(checked),
                              }))
                            }}
                            aria-label={`${group.label} ${action}`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </AppTableCell>
                    )
                  })}
                </AppTableRow>,
                isExpanded ? (
                  <AppTableRow key={`${group.module}-details`}>
                    <AppTableCell
                      colSpan={ACTION_COLUMNS.length + 1}
                      className="bg-muted/20 text-xs text-muted-foreground"
                    >
                      Available actions: {group.actions.join(", ")}
                    </AppTableCell>
                  </AppTableRow>
                ) : null,
              ]
            })}
          </AppTableBody>
        </AppTable>
      </div>
    </AppCard>
  )
}
