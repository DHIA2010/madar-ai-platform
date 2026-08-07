"use client"

import { AppBadge, AppCard, AppPageHeader, RelativeTime } from "@/components/app"

import { useAuditLogsQuery } from "../queries/use-audit-logs-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application/context"

export function AdministrationAuditLogScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { data, isLoading, isError } = useAuditLogsQuery(administrationApplicationService)
  const events = data?.items ?? []

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />

      <AppPageHeader
        title="Audit Log"
        subtitle="Read-only security and governance events for compliance visibility."
      />

      <AppCard
        title="Audit Events"
        subtitle="Role changes, access events, and policy-level security actions."
        className="shadow-sm"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading audit events…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load audit events.</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit events yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-border/70 bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-semibold">{event.actor}</span> {event.action} ·{" "}
                    <span className="font-medium">{event.target}</span>
                  </p>
                  <div className="flex gap-2">
                    <AppBadge variant="outline">
                      <RelativeTime value={event.createdAt} fallback="-" />
                    </AppBadge>
                    <AppBadge variant={event.severity === "high" ? "destructive" : "secondary"}>
                      {event.severity}
                    </AppBadge>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppCard>
    </div>
  )
}
