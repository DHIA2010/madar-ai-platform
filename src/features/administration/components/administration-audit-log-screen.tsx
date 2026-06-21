"use client"

import { AppBadge, AppCard, AppPageHeader } from "@/components/app"

import { IAM_AUDIT_LOGS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"

export function AdministrationAuditLogScreen() {
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
        <div className="space-y-3">
          {IAM_AUDIT_LOGS.map((event) => (
            <article key={event.id} className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold">{event.actor}</span> {event.action} ·{" "}
                  <span className="font-medium">{event.target}</span>
                </p>
                <div className="flex gap-2">
                  <AppBadge variant="outline">{event.createdAt}</AppBadge>
                  <AppBadge variant={event.severity === "high" ? "destructive" : "secondary"}>
                    {event.severity ?? "info"}
                  </AppBadge>
                </div>
              </div>
            </article>
          ))}
        </div>
      </AppCard>
    </div>
  )
}
