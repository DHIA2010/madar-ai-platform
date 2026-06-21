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
} from "@/components/app"

import { IAM_ACTIVITY_LOGS, IAM_USERS } from "../services"
import { AdministrationModuleNav } from "./administration-module-nav"

export function AdministrationActivityLogScreen() {
  const [query, setQuery] = useState("")
  const [userFilter, setUserFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [dateRange, setDateRange] = useState("last7")

  const events = useMemo(() => {
    const term = query.trim().toLowerCase()
    return IAM_ACTIVITY_LOGS.filter((event) => {
      const matchesQuery =
        term === "" ||
        event.actor.toLowerCase().includes(term) ||
        event.action.toLowerCase().includes(term) ||
        event.target.toLowerCase().includes(term)
      const matchesUser = userFilter === "all" || event.actor === userFilter
      const matchesAction = actionFilter === "all" || event.action.includes(actionFilter)
      return matchesQuery && matchesUser && matchesAction && Boolean(dateRange)
    })
  }, [actionFilter, dateRange, query, userFilter])

  return (
    <div className="space-y-4">
      <AdministrationModuleNav />
      <AppPageHeader
        title="Activity Log"
        subtitle="Timeline of business actions across campaigns, creatives, and integrations."
      />

      <AppCard title="Filters" className="shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              {IAM_USERS.map((user) => (
                <AppSelectItem key={user.id} value={user.fullName}>
                  {user.fullName}
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
              <AppSelectItem value="uploaded">Uploaded</AppSelectItem>
              <AppSelectItem value="connected">Connected</AppSelectItem>
              <AppSelectItem value="changed">Changed</AppSelectItem>
            </AppSelectContent>
          </AppSelect>

          <AppSelect value={dateRange} onValueChange={setDateRange}>
            <AppSelectTrigger className="h-10">
              <span>Date range</span>
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="today">Today</AppSelectItem>
              <AppSelectItem value="last7">Last 7 days</AppSelectItem>
              <AppSelectItem value="last30">Last 30 days</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </div>
      </AppCard>

      <AppCard
        title="Timeline"
        subtitle="Operational events for user and team visibility."
        className="shadow-sm"
      >
        <div className="space-y-3">
          {events.map((event) => (
            <article key={event.id} className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-semibold">{event.actor}</span> {event.action}{" "}
                  <span className="font-medium">{event.target}</span>
                </p>
                <AppBadge variant="outline">{event.createdAt}</AppBadge>
              </div>
            </article>
          ))}
        </div>
      </AppCard>
    </div>
  )
}
