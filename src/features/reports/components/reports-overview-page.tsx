"use client"

import { BarChart3, Clock3, Download, FileText, Filter, Sparkles } from "lucide-react"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  AppContainer,
  AppPage,
  AppPageHeader,
  AppSection,
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppToolbar,
} from "@/components/app"

import type { ReportsOverviewItem } from "../types"

const REPORTS: ReportsOverviewItem[] = [
  {
    id: "rep_001",
    name: "Executive Weekly Performance",
    owner: "Growth Team",
    status: "Ready",
    updatedAt: "2 hours ago",
    frequency: "Weekly",
    summary: "Board-level summary across revenue, spend, ROAS, and top risks.",
  },
  {
    id: "rep_002",
    name: "Channel Efficiency Deep Dive",
    owner: "Paid Media",
    status: "Ready",
    updatedAt: "5 hours ago",
    frequency: "Daily",
    summary: "Cross-channel spend efficiency with CPA, CTR, and conversion quality.",
  },
  {
    id: "rep_003",
    name: "Customer LTV Cohort Review",
    owner: "CRM",
    status: "Scheduled",
    updatedAt: "Tomorrow 08:00",
    frequency: "Weekly",
    summary: "Acquisition cohort performance, retention curves, and LTV by source.",
  },
  {
    id: "rep_004",
    name: "Product Margin Watchlist",
    owner: "Commerce",
    status: "Draft",
    updatedAt: "Yesterday",
    frequency: "Monthly",
    summary: "Identifies revenue leaders with margin compression and inventory pressure.",
  },
]

function statusTone(status: ReportsOverviewItem["status"]) {
  if (status === "Ready") {
    return "success" as const
  }

  if (status === "Scheduled") {
    return "info" as const
  }

  return "neutral" as const
}

export function ReportsOverviewPage() {
  return (
    <AppPage>
      <AppContainer className="space-y-6">
        <AppPageHeader
          breadcrumbItems={[
            { label: "Dashboard", href: ROUTES.dashboard },
            { label: "Reports", current: true },
          ]}
          title="Reports"
          subtitle="Recurring business reporting for leadership, performance teams, and operators."
          actions={
            <AppButton variant="outline" icon={<Download className="size-4" />}>
              Export library
            </AppButton>
          }
        />

        <AppToolbar
          leading={
            <div className="space-y-1">
              <p className="text-sm font-medium">Reports Workspace</p>
              <p className="text-sm text-muted-foreground">
                Start every week with decision-ready reporting across executive, channel, customer,
                and product views.
              </p>
            </div>
          }
          trailing={
            <div className="flex items-center gap-2">
              <AppButton variant="outline" icon={<Filter className="size-4" />}>
                Filter reports
              </AppButton>
              <AppButton icon={<Sparkles className="size-4" />}>Create report</AppButton>
            </div>
          }
        />

        <AppSection>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AppCard
              title="Ready Reports"
              subtitle="Available now"
              icon={<FileText className="size-4" />}
            >
              <p className="text-3xl font-semibold">2</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Decision-ready reports generated today
              </p>
            </AppCard>
            <AppCard
              title="Scheduled"
              subtitle="Next runs queued"
              icon={<Clock3 className="size-4" />}
            >
              <p className="text-3xl font-semibold">1</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Automated report scheduled for tomorrow morning
              </p>
            </AppCard>
            <AppCard
              title="Coverage"
              subtitle="Business areas"
              icon={<BarChart3 className="size-4" />}
            >
              <p className="text-3xl font-semibold">4</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Executive, channel, customer, and product reporting
              </p>
            </AppCard>
            <AppCard title="Drafts" subtitle="Needs review" icon={<Sparkles className="size-4" />}>
              <p className="text-3xl font-semibold">1</p>
              <p className="mt-2 text-sm text-muted-foreground">
                One draft report pending stakeholder approval
              </p>
            </AppCard>
          </div>
        </AppSection>

        <AppSection>
          <AppCard
            title="Report Library"
            subtitle="Most important recurring reports for the organization"
          >
            <AppTable>
              <AppTableHeader>
                <AppTableRow>
                  <AppTableHead>Report</AppTableHead>
                  <AppTableHead>Owner</AppTableHead>
                  <AppTableHead>Status</AppTableHead>
                  <AppTableHead>Frequency</AppTableHead>
                  <AppTableHead>Last Updated</AppTableHead>
                </AppTableRow>
              </AppTableHeader>
              <AppTableBody>
                {REPORTS.map((report) => (
                  <AppTableRow key={report.id}>
                    <AppTableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{report.name}</p>
                        <p className="text-sm text-muted-foreground">{report.summary}</p>
                      </div>
                    </AppTableCell>
                    <AppTableCell>{report.owner}</AppTableCell>
                    <AppTableCell>
                      <AppStatusBadge status={statusTone(report.status)} label={report.status} />
                    </AppTableCell>
                    <AppTableCell>{report.frequency}</AppTableCell>
                    <AppTableCell>{report.updatedAt}</AppTableCell>
                  </AppTableRow>
                ))}
              </AppTableBody>
            </AppTable>
          </AppCard>
        </AppSection>
      </AppContainer>
    </AppPage>
  )
}
