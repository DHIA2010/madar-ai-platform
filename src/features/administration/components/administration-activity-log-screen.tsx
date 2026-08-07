"use client"

import { useMemo, useState } from "react"

import {
  AppBadge,
  AppCard,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  RelativeTime,
} from "@/components/app"

import { useAuditLogsQuery } from "../queries/use-audit-logs-query"
import { AdministrationModuleNav } from "./administration-module-nav"

import { useApplicationServices } from "@/application"

export function AdministrationActivityLogScreen() {
  const { administrationApplicationService } = useApplicationServices()
  const { data, isLoading, isError } = useAuditLogsQuery(administrationApplicationService, 1, 200)
  const allEvents = useMemo(() => data?.items ?? [], [data])

  const [query, setQuery] = useState("")
  const [userFilter, setUserFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")

  const availableActors = useMemo(() => {
    return Array.from(new Set(allEvents.map((event) => event.actor))).sort()
  }, [allEvents])

  const events = useMemo(() => {
    const term = query.trim().toLowerCase()
    return allEvents.filter((event) => {
      const matchesQuery =
        term === "" ||
        event.actor.toLowerCase().includes(term) ||
        event.action.toLowerCase().includes(term) ||
        event.target.toLowerCase().includes(term)
      const matchesUser = userFilter === "all" || event.actor === userFilter
      const matchesAction = actionFilter === "all" || event.action.includes(actionFilter)
      return matchesQuery && matchesUser && matchesAction
    })
  }, [actionFilter, allEvents, query, userFilter])

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />
      <AppPageHeader
        title="Activity Log"
        subtitle="Timeline of business actions across campaigns, creatives, and integrations."
      />

      <AppCard title="Filters" className="shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AppInput
            placeholder="Search activity"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <AppSelect value={userFilter} onValueChange={setUserFilter}>
            <AppSelectTrigger className="h-10">
              <span>User</span>
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All users</AppSelectItem>
              {availableActors.map((actor) => (
                <AppSelectItem key={actor} value={actor}>
                  {actor}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <AppSelect value={actionFilter} onValueChange={setActionFilter}>
            <AppSelectTrigger className="h-10">
              <span>Action</span>
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">All actions</AppSelectItem>
              <AppSelectItem value="created">Created</AppSelectItem>
              <AppSelectItem value="connected">Connected</AppSelectItem>
              <AppSelectItem value="resumed">Resumed</AppSelectItem>
              <AppSelectItem value="paused">Paused</AppSelectItem>
              <AppSelectItem value="disconnected">Disconnected</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </div>
      </AppCard>

      <AppCard
        title="Timeline"
        subtitle="Operational events for user and team visibility."
        className="shadow-sm"
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load activity.</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity found.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-border/70 bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-semibold">{event.actor}</span> {event.action}{" "}
                    <span className="font-medium">{event.target}</span>
                  </p>
                  <AppBadge variant="outline">
                    <RelativeTime value={event.createdAt} fallback="-" />
                  </AppBadge>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppCard>
    </div>
  )
}
