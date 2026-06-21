"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArrowUpDown,
  CircleDashed,
  Copy,
  Filter,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  TrendingDown,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppInput,
  AppSearchInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import { useCampaignList } from "../hooks"
import type { CampaignChannel, CampaignStatus } from "../types"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"
import { CampaignStatusBadge } from "./campaign-status-badge"

type SortableColumn =
  | "name"
  | "status"
  | "objective"
  | "channel"
  | "owner"
  | "country"
  | "workspace"
  | "lastUpdated"
  | "startDate"
  | "endDate"
  | "budget"
  | "spend"
  | "revenue"
  | "roas"
  | "ctr"
  | "conversions"

type QuickFilter = "all" | "active" | "draft" | "paused" | "completed"

type DateRangeFilter = "all" | "thisMonth" | "thisQuarter" | "next30"
type BudgetRangeFilter = "all" | "lt50k" | "50kTo100k" | "gt100k"

type DecoratedCampaign = {
  id: string
  name: string
  status: CampaignStatus
  channel: CampaignChannel
  objective: string
  owner: string
  country: string
  workspace: string
  startDate: string
  endDate: string
  lastUpdated: string
  budget: number
  spend: number
  revenue: number
  roas: number
  ctr: number
  conversions: number
}

const OBJECTIVES = ["Awareness", "Traffic", "Leads", "Conversions", "Sales", "Engagement"]
const COUNTRIES = ["Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Jordan"]
const WORKSPACES = ["Madar Growth", "Retail Expansion", "Enterprise Pipeline"]

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
]

const ROWS_PER_PAGE_OPTIONS = [5, 10, 20, 50]

function hashIndex(value: string, mod: number) {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % mod
  }
  return Math.abs(hash)
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`).getTime()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

function exportSelectedRows(rows: DecoratedCampaign[]) {
  const header = [
    "Campaign",
    "Status",
    "Channel",
    "Objective",
    "Owner",
    "Start",
    "End",
    "Budget",
    "Spend",
    "Revenue",
    "ROAS",
    "CTR",
    "Conversions",
    "Last Updated",
  ]

  const lines = rows.map((row) =>
    [
      row.name,
      row.status,
      row.channel,
      row.objective,
      row.owner,
      row.startDate,
      row.endDate,
      row.budget,
      row.spend,
      row.revenue,
      row.roas,
      row.ctr,
      row.conversions,
      row.lastUpdated,
    ].join(",")
  )

  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", "campaigns-export.csv")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function CampaignListTable() {
  const router = useRouter()

  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [jumpPage, setJumpPage] = useState("")

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<CampaignStatus | "">("")
  const [channel, setChannel] = useState<CampaignChannel | "">("")
  const [ownerFilter, setOwnerFilter] = useState("")
  const [objectiveFilter, setObjectiveFilter] = useState("")
  const [countryFilter, setCountryFilter] = useState("")
  const [workspaceFilter, setWorkspaceFilter] = useState("")
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all")
  const [budgetRangeFilter, setBudgetRangeFilter] = useState<BudgetRangeFilter>("all")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [sortBy, setSortBy] = useState<SortableColumn>("lastUpdated")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CampaignStatus>>({})
  const [ownerOverrides, setOwnerOverrides] = useState<Record<string, string>>({})
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [bulkOwner, setBulkOwner] = useState("")

  const queryInput = useMemo(
    () => ({
      page: 1,
      pageSize: 200,
      search: search || undefined,
      status: status || undefined,
      channel: channel || undefined,
      sortBy: "startDate" as const,
      sortDirection: "desc" as const,
    }),
    [channel, search, status]
  )

  const campaignListQuery = useCampaignList(queryInput)
  const payloadItems = campaignListQuery.data?.payload.items

  const campaigns = useMemo<DecoratedCampaign[]>(() => {
    return (payloadItems ?? [])
      .map((campaign) => {
        const objective = OBJECTIVES[hashIndex(campaign.id, OBJECTIVES.length)]
        const country = COUNTRIES[hashIndex(campaign.id + campaign.owner, COUNTRIES.length)]
        const workspace = WORKSPACES[hashIndex(campaign.id + campaign.channel, WORKSPACES.length)]
        const statusValue = statusOverrides[campaign.id] ?? campaign.status
        const ownerValue = ownerOverrides[campaign.id] ?? campaign.owner
        const lastUpdated = campaign.endDate
        const conversions = Math.max(
          1,
          Math.round(
            (campaign.spend / Math.max(campaign.cpc, 0.5)) * (campaign.conversionRate / 100)
          )
        )

        return {
          id: campaign.id,
          name: campaign.name,
          status: statusValue,
          channel: campaign.channel,
          objective,
          owner: ownerValue,
          country,
          workspace,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          lastUpdated,
          budget: campaign.budget,
          spend: campaign.spend,
          revenue: campaign.revenue,
          roas: campaign.roas,
          ctr: campaign.ctr,
          conversions,
        }
      })
      .filter((campaign) => !hiddenIds.includes(campaign.id))
  }, [hiddenIds, ownerOverrides, payloadItems, statusOverrides])

  const referenceNow = useMemo(() => {
    if (campaigns.length === 0) return 0
    return Math.max(...campaigns.map((campaign) => parseDate(campaign.lastUpdated)))
  }, [campaigns])

  const ownerOptions = useMemo(() => {
    return [...new Set(campaigns.map((campaign) => campaign.owner))].sort()
  }, [campaigns])

  const filteredCampaigns = useMemo(() => {
    const now = referenceNow
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    const quarter = 90 * 24 * 60 * 60 * 1000

    return campaigns
      .filter((campaign) => (!ownerFilter ? true : campaign.owner === ownerFilter))
      .filter((campaign) => (!objectiveFilter ? true : campaign.objective === objectiveFilter))
      .filter((campaign) => (!countryFilter ? true : campaign.country === countryFilter))
      .filter((campaign) => (!workspaceFilter ? true : campaign.workspace === workspaceFilter))
      .filter((campaign) => {
        if (budgetRangeFilter === "all") return true
        if (budgetRangeFilter === "lt50k") return campaign.budget < 50000
        if (budgetRangeFilter === "50kTo100k")
          return campaign.budget >= 50000 && campaign.budget <= 100000
        return campaign.budget > 100000
      })
      .filter((campaign) => {
        if (dateRangeFilter === "all") return true
        const start = parseDate(campaign.startDate)
        if (dateRangeFilter === "next30") return start >= now && start <= now + thirtyDays
        if (dateRangeFilter === "thisMonth") return Math.abs(now - start) <= thirtyDays
        return Math.abs(now - start) <= quarter
      })
      .filter((campaign) => {
        if (quickFilter === "all") return true
        return campaign.status === quickFilter
      })
      .sort((left, right) => {
        const direction = sortDirection === "asc" ? 1 : -1
        const leftValue = left[sortBy]
        const rightValue = right[sortBy]

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return (leftValue - rightValue) * direction
        }

        if (sortBy === "startDate" || sortBy === "endDate" || sortBy === "lastUpdated") {
          return (parseDate(String(leftValue)) - parseDate(String(rightValue))) * direction
        }

        return String(leftValue).localeCompare(String(rightValue)) * direction
      })
  }, [
    budgetRangeFilter,
    campaigns,
    countryFilter,
    dateRangeFilter,
    objectiveFilter,
    ownerFilter,
    quickFilter,
    referenceNow,
    sortBy,
    sortDirection,
    workspaceFilter,
  ])

  const totalRows = filteredCampaigns.length
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageStart = totalRows === 0 ? 0 : (safePage - 1) * rowsPerPage + 1
  const pageEnd = Math.min(safePage * rowsPerPage, totalRows)

  const pagedCampaigns = useMemo(() => {
    const start = (safePage - 1) * rowsPerPage
    return filteredCampaigns.slice(start, start + rowsPerPage)
  }, [filteredCampaigns, rowsPerPage, safePage])

  const selectedCampaigns = campaigns.filter((campaign) => selectedIds.includes(campaign.id))
  const allPageSelected =
    pagedCampaigns.length > 0 &&
    pagedCampaigns.every((campaign) => selectedIds.includes(campaign.id))

  const quickCounts = useMemo(
    () => ({
      all: campaigns.length,
      active: campaigns.filter((campaign) => campaign.status === "active").length,
      draft: campaigns.filter((campaign) => campaign.status === "draft").length,
      paused: campaigns.filter((campaign) => campaign.status === "paused").length,
      completed: campaigns.filter((campaign) => campaign.status === "completed").length,
    }),
    [campaigns]
  )

  const hasActiveFilters =
    search.trim() !== "" ||
    status !== "" ||
    channel !== "" ||
    ownerFilter !== "" ||
    objectiveFilter !== "" ||
    countryFilter !== "" ||
    workspaceFilter !== "" ||
    dateRangeFilter !== "all" ||
    budgetRangeFilter !== "all" ||
    quickFilter !== "all" ||
    sortBy !== "lastUpdated" ||
    sortDirection !== "desc"

  function handleSort(column: SortableColumn) {
    if (sortBy === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortBy(column)
    setSortDirection("desc")
  }

  function resetFilters() {
    setSearch("")
    setStatus("")
    setChannel("")
    setOwnerFilter("")
    setObjectiveFilter("")
    setCountryFilter("")
    setWorkspaceFilter("")
    setDateRangeFilter("all")
    setBudgetRangeFilter("all")
    setQuickFilter("all")
    setSortBy("lastUpdated")
    setSortDirection("desc")
    setPage(1)
  }

  function applyStatusToSelected(nextStatus: CampaignStatus) {
    setStatusOverrides((current) => {
      const updated = { ...current }
      selectedIds.forEach((id) => {
        updated[id] = nextStatus
      })
      return updated
    })
  }

  function handleSelectAllOnPage(checked: boolean) {
    if (!checked) {
      setSelectedIds((current) =>
        current.filter((id) => !pagedCampaigns.some((campaign) => campaign.id === id))
      )
      return
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...pagedCampaigns.map((campaign) => campaign.id)]),
    ])
  }

  function handleJumpToPage() {
    const numeric = Number(jumpPage)
    if (Number.isNaN(numeric)) return
    setPage(Math.min(Math.max(1, Math.floor(numeric)), totalPages))
    setJumpPage("")
  }

  return (
    <div className="space-y-4">
      <AppCard
        className="shadow-sm"
        title="Search & Filters"
        subtitle="Always-visible core filters with optional advanced controls."
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[minmax(320px,1.2fr)_repeat(2,minmax(160px,0.5fr))]">
              <AppSearchInput
                placeholder="Search campaign name, owner, objective..."
                className="h-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />

              <AppSelect
                value={status || "all"}
                onValueChange={(value) => {
                  setStatus(value === "all" ? "" : (value as CampaignStatus))
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Status" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Status
                  </AppSelectItem>
                  <AppSelectItem value="draft" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Draft
                  </AppSelectItem>
                  <AppSelectItem value="active" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Active
                  </AppSelectItem>
                  <AppSelectItem value="paused" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Paused
                  </AppSelectItem>
                  <AppSelectItem value="completed" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Completed
                  </AppSelectItem>
                  <AppSelectItem value="archived" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Archived
                  </AppSelectItem>
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={channel || "all"}
                onValueChange={(value) => {
                  setChannel(value === "all" ? "" : (value as CampaignChannel))
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Channel" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Channel
                  </AppSelectItem>
                  <AppSelectItem value="meta" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Meta Ads
                  </AppSelectItem>
                  <AppSelectItem value="google" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Google Ads
                  </AppSelectItem>
                  <AppSelectItem value="tiktok" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    TikTok Ads
                  </AppSelectItem>
                  <AppSelectItem value="snapchat" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Snapchat Ads
                  </AppSelectItem>
                  <AppSelectItem value="linkedin" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    LinkedIn
                  </AppSelectItem>
                  <AppSelectItem value="email" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Email
                  </AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="flex items-center gap-2">
              <AppButton
                variant="outline"
                size="sm"
                icon={<Filter className="size-3.5" />}
                onClick={() => setShowAdvancedFilters((current) => !current)}
              >
                {showAdvancedFilters ? "Hide Filters" : "+ More Filters"}
              </AppButton>
              {hasActiveFilters ? (
                <AppButton variant="ghost" size="sm" onClick={resetFilters}>
                  Reset Filters
                </AppButton>
              ) : null}
            </div>
          </div>

          {showAdvancedFilters ? (
            <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2 xl:grid-cols-4">
              <AppSelect
                value={ownerFilter || "all"}
                onValueChange={(value) => {
                  setOwnerFilter(value === "all" ? "" : value)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Owner" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Owner
                  </AppSelectItem>
                  {ownerOptions.map((owner) => (
                    <AppSelectItem
                      key={owner}
                      value={owner}
                      className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                    >
                      {owner}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={workspaceFilter || "all"}
                onValueChange={(value) => {
                  setWorkspaceFilter(value === "all" ? "" : value)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Workspace" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Workspace
                  </AppSelectItem>
                  {WORKSPACES.map((workspace) => (
                    <AppSelectItem
                      key={workspace}
                      value={workspace}
                      className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                    >
                      {workspace}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={objectiveFilter || "all"}
                onValueChange={(value) => {
                  setObjectiveFilter(value === "all" ? "" : value)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Objective" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Objective
                  </AppSelectItem>
                  {OBJECTIVES.map((objective) => (
                    <AppSelectItem
                      key={objective}
                      value={objective}
                      className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                    >
                      {objective}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={countryFilter || "all"}
                onValueChange={(value) => {
                  setCountryFilter(value === "all" ? "" : value)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Country" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Country
                  </AppSelectItem>
                  {COUNTRIES.map((country) => (
                    <AppSelectItem
                      key={country}
                      value={country}
                      className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
                    >
                      {country}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={budgetRangeFilter}
                onValueChange={(value) => {
                  setBudgetRangeFilter(value as BudgetRangeFilter)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Budget Range" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Budget Range
                  </AppSelectItem>
                  <AppSelectItem value="lt50k" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Less than $50K
                  </AppSelectItem>
                  <AppSelectItem value="50kTo100k" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    $50K - $100K
                  </AppSelectItem>
                  <AppSelectItem value="gt100k" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    More than $100K
                  </AppSelectItem>
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={dateRangeFilter}
                onValueChange={(value) => {
                  setDateRangeFilter(value as DateRangeFilter)
                  setPage(1)
                }}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Date Range" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="all" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Date Range
                  </AppSelectItem>
                  <AppSelectItem value="thisMonth" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    This Month
                  </AppSelectItem>
                  <AppSelectItem value="thisQuarter" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    This Quarter
                  </AppSelectItem>
                  <AppSelectItem value="next30" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Next 30 Days
                  </AppSelectItem>
                </AppSelectContent>
              </AppSelect>

              <AppSelect
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortableColumn)}
              >
                <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
                  <AppSelectValue placeholder="Sort By" />
                </AppSelectTrigger>
                <AppSelectContent className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}>
                  <AppSelectItem value="lastUpdated" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Last Updated
                  </AppSelectItem>
                  <AppSelectItem value="name" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Campaign Name
                  </AppSelectItem>
                  <AppSelectItem value="status" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Status
                  </AppSelectItem>
                  <AppSelectItem value="owner" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Owner
                  </AppSelectItem>
                  <AppSelectItem value="startDate" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Start Date
                  </AppSelectItem>
                  <AppSelectItem value="budget" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Budget
                  </AppSelectItem>
                  <AppSelectItem value="revenue" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    Revenue
                  </AppSelectItem>
                  <AppSelectItem value="roas" className={CAMPAIGN_SELECT_ITEM_CLASSNAME}>
                    ROAS
                  </AppSelectItem>
                </AppSelectContent>
              </AppSelect>

              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
              >
                {sortDirection === "asc" ? "Ascending" : "Descending"}
              </AppButton>
            </div>
          ) : null}

          {[status, channel, ownerFilter, objectiveFilter, countryFilter, workspaceFilter].filter(
            Boolean
          ).length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {[status, channel, ownerFilter, objectiveFilter, countryFilter, workspaceFilter]
                .filter(Boolean)
                .map((chip) => (
                  <AppBadge
                    key={chip}
                    variant="outline"
                    className="rounded-full px-2 py-0.5 text-xs font-normal"
                  >
                    {chip}
                  </AppBadge>
                ))}
            </div>
          ) : null}
        </div>
      </AppCard>

      <AppCard title="Campaign Table" subtitle="Operational campaign monitoring and execution.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => {
                    setQuickFilter(filter.key)
                    setPage(1)
                  }}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-sm transition-colors",
                    quickFilter === filter.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter.label} ({quickCounts[filter.key]})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <AppBadge variant="outline" className="rounded-full px-2 py-0.5 text-xs font-normal">
                Saved Views (Soon)
              </AppBadge>
              <AppBadge variant="outline" className="rounded-full px-2 py-0.5 text-xs font-normal">
                Export (Soon)
              </AppBadge>
              <AppBadge variant="outline" className="rounded-full px-2 py-0.5 text-xs font-normal">
                AI Recommendations (Soon)
              </AppBadge>
              <AppBadge variant="outline" className="rounded-full px-2 py-0.5 text-xs font-normal">
                Comparison (Soon)
              </AppBadge>
            </div>
          </div>

          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <AppButton
                size="sm"
                variant="outline"
                onClick={() => applyStatusToSelected("paused")}
              >
                Pause
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                onClick={() => applyStatusToSelected("active")}
              >
                Resume
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                onClick={() => applyStatusToSelected("archived")}
              >
                Archive
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                onClick={() => {
                  setHiddenIds((current) => [...new Set([...current, ...selectedIds])])
                  setSelectedIds([])
                }}
              >
                Delete
              </AppButton>
              <AppSelect value={bulkOwner || ""} onValueChange={setBulkOwner}>
                <AppSelectTrigger className="h-8 w-[180px]">
                  <AppSelectValue placeholder="Assign Owner" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {ownerOptions.map((owner) => (
                    <AppSelectItem key={owner} value={owner}>
                      {owner}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
              <AppButton
                size="sm"
                variant="outline"
                disabled={!bulkOwner}
                onClick={() => {
                  if (!bulkOwner) return
                  setOwnerOverrides((current) => {
                    const updated = { ...current }
                    selectedIds.forEach((id) => {
                      updated[id] = bulkOwner
                    })
                    return updated
                  })
                }}
              >
                Apply Owner
              </AppButton>
              <AppButton
                size="sm"
                variant="outline"
                onClick={() => exportSelectedRows(selectedCampaigns)}
              >
                Export
              </AppButton>
            </div>
          ) : null}

          {!campaignListQuery.isLoading && filteredCampaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/10 p-10 text-center">
              <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full border border-border/70 bg-background">
                  <CircleDashed className="size-5 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No campaigns yet</h3>
                <p className="text-sm text-muted-foreground">
                  Create your first campaign to start tracking marketing performance.
                </p>
                <div className="flex items-center gap-3">
                  <AppButton onClick={() => router.push(ROUTES.campaignsCreate)}>
                    Create Campaign
                  </AppButton>
                  <AppButton asChild variant="ghost">
                    <Link href={ROUTES.campaignsCreate}>Learn about campaigns</Link>
                  </AppButton>
                </div>
              </div>
            </div>
          ) : (
            <>
              <AppTable className="[&_td]:py-4 [&_th]:py-3.5 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-card/95 [&_thead_th]:backdrop-blur-sm">
                <AppTableHeader>
                  <AppTableRow>
                    <AppTableHead className="sticky left-0 z-20 w-12 bg-card">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        aria-label="Select all campaigns on page"
                        onChange={(event) => handleSelectAllOnPage(event.target.checked)}
                        className="size-4 cursor-pointer rounded border-border"
                      />
                    </AppTableHead>
                    <AppTableHead className="sticky left-12 z-20 min-w-[220px] bg-card">
                      <SortHeader
                        label="Campaign"
                        active={sortBy === "name"}
                        direction={sortDirection}
                        onClick={() => handleSort("name")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Status"
                        active={sortBy === "status"}
                        direction={sortDirection}
                        onClick={() => handleSort("status")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Channel"
                        active={sortBy === "channel"}
                        direction={sortDirection}
                        onClick={() => handleSort("channel")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Objective"
                        active={sortBy === "objective"}
                        direction={sortDirection}
                        onClick={() => handleSort("objective")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Owner"
                        active={sortBy === "owner"}
                        direction={sortDirection}
                        onClick={() => handleSort("owner")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Start"
                        active={sortBy === "startDate"}
                        direction={sortDirection}
                        onClick={() => handleSort("startDate")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="End"
                        active={sortBy === "endDate"}
                        direction={sortDirection}
                        onClick={() => handleSort("endDate")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Budget"
                        active={sortBy === "budget"}
                        direction={sortDirection}
                        onClick={() => handleSort("budget")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Spend"
                        active={sortBy === "spend"}
                        direction={sortDirection}
                        onClick={() => handleSort("spend")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Revenue"
                        active={sortBy === "revenue"}
                        direction={sortDirection}
                        onClick={() => handleSort("revenue")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="ROAS"
                        active={sortBy === "roas"}
                        direction={sortDirection}
                        onClick={() => handleSort("roas")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="CTR"
                        active={sortBy === "ctr"}
                        direction={sortDirection}
                        onClick={() => handleSort("ctr")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Conversions"
                        active={sortBy === "conversions"}
                        direction={sortDirection}
                        onClick={() => handleSort("conversions")}
                      />
                    </AppTableHead>
                    <AppTableHead>
                      <SortHeader
                        label="Last Updated"
                        active={sortBy === "lastUpdated"}
                        direction={sortDirection}
                        onClick={() => handleSort("lastUpdated")}
                      />
                    </AppTableHead>
                    <AppTableHead className="text-right">Actions</AppTableHead>
                  </AppTableRow>
                </AppTableHeader>

                <AppTableBody>
                  {campaignListQuery.isLoading
                    ? null
                    : pagedCampaigns.map((campaign) => (
                        <AppTableRow
                          key={campaign.id}
                          className="cursor-pointer odd:bg-transparent even:bg-muted/[0.04] hover:bg-muted/20"
                          onClick={() => router.push(ROUTES.campaignsDetails(campaign.id))}
                        >
                          <AppTableCell
                            className="sticky left-0 z-10 bg-card"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(campaign.id)}
                              aria-label={`Select ${campaign.name}`}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  setSelectedIds((current) => [...current, campaign.id])
                                  return
                                }
                                setSelectedIds((current) =>
                                  current.filter((id) => id !== campaign.id)
                                )
                              }}
                              className="size-4 cursor-pointer rounded border-border"
                            />
                          </AppTableCell>

                          <AppTableCell className="sticky left-12 z-10 bg-card">
                            <div className="space-y-0.5">
                              <p className="font-medium text-foreground">{campaign.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {campaign.workspace} · {campaign.country}
                              </p>
                            </div>
                          </AppTableCell>
                          <AppTableCell>
                            <CampaignStatusBadge status={campaign.status} />
                          </AppTableCell>
                          <AppTableCell>{campaign.channel}</AppTableCell>
                          <AppTableCell>{campaign.objective}</AppTableCell>
                          <AppTableCell>{campaign.owner}</AppTableCell>
                          <AppTableCell>{formatDate(campaign.startDate)}</AppTableCell>
                          <AppTableCell>{formatDate(campaign.endDate)}</AppTableCell>
                          <AppTableCell>{formatCurrency(campaign.budget)}</AppTableCell>
                          <AppTableCell>{formatCurrency(campaign.spend)}</AppTableCell>
                          <AppTableCell>{formatCurrency(campaign.revenue)}</AppTableCell>
                          <AppTableCell>{campaign.roas.toFixed(2)}x</AppTableCell>
                          <AppTableCell>{campaign.ctr.toFixed(2)}%</AppTableCell>
                          <AppTableCell>{formatNumber(campaign.conversions)}</AppTableCell>
                          <AppTableCell>{formatDate(campaign.lastUpdated)}</AppTableCell>
                          <AppTableCell
                            className="text-right"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <AppDropdownMenu>
                              <AppDropdownMenuTrigger asChild>
                                <AppButton
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Actions for ${campaign.name}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </AppButton>
                              </AppDropdownMenuTrigger>
                              <AppDropdownMenuContent align="end">
                                <AppDropdownMenuItem
                                  onClick={() => router.push(ROUTES.campaignsDetails(campaign.id))}
                                >
                                  Open
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  onClick={() => router.push(ROUTES.campaignsEdit(campaign.id))}
                                >
                                  Edit
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem>
                                  <Copy className="size-4" />
                                  Duplicate
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  onClick={() =>
                                    setStatusOverrides((current) => ({
                                      ...current,
                                      [campaign.id]: "paused",
                                    }))
                                  }
                                >
                                  <PauseCircle className="size-4" />
                                  Pause
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  onClick={() =>
                                    setStatusOverrides((current) => ({
                                      ...current,
                                      [campaign.id]: "active",
                                    }))
                                  }
                                >
                                  <PlayCircle className="size-4" />
                                  Resume
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  onClick={() =>
                                    setStatusOverrides((current) => ({
                                      ...current,
                                      [campaign.id]: "archived",
                                    }))
                                  }
                                >
                                  <Archive className="size-4" />
                                  Archive
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    setHiddenIds((current) => [
                                      ...new Set([...current, campaign.id]),
                                    ])
                                  }
                                >
                                  <Trash2Icon />
                                  Delete
                                </AppDropdownMenuItem>
                                <AppDropdownMenuItem
                                  onClick={() => router.push(ROUTES.campaignsDetails(campaign.id))}
                                >
                                  <TrendingDown className="size-4" />
                                  Analytics
                                </AppDropdownMenuItem>
                              </AppDropdownMenuContent>
                            </AppDropdownMenu>
                          </AppTableCell>
                        </AppTableRow>
                      ))}
                </AppTableBody>
              </AppTable>

              <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Rows per page</span>
                  <AppSelect
                    value={String(rowsPerPage)}
                    onValueChange={(value) => {
                      setRowsPerPage(Number(value))
                      setPage(1)
                    }}
                  >
                    <AppSelectTrigger className="h-8 w-[90px]">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {ROWS_PER_PAGE_OPTIONS.map((size) => (
                        <AppSelectItem key={size} value={String(size)}>
                          {size}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                  <span className="text-muted-foreground">
                    {pageStart}-{pageEnd} of {totalRows} campaigns
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AppButton
                    size="sm"
                    variant="outline"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </AppButton>
                  <span className="px-2 text-sm text-muted-foreground">
                    Page {safePage} / {totalPages}
                  </span>
                  <AppButton
                    size="sm"
                    variant="outline"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Next
                  </AppButton>
                  <AppInput
                    value={jumpPage}
                    onChange={(event) => setJumpPage(event.target.value.replace(/\D/g, ""))}
                    placeholder="Page"
                    className="h-8 w-20"
                  />
                  <AppButton size="sm" variant="outline" onClick={handleJumpToPage}>
                    Go
                  </AppButton>
                </div>
              </div>
            </>
          )}
        </div>
      </AppCard>
    </div>
  )
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: "asc" | "desc"
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      <span>{label}</span>
      <ArrowUpDown
        className={cn(
          "size-3",
          active ? "opacity-100" : "opacity-35",
          direction === "asc" ? "rotate-180" : "rotate-0"
        )}
      />
    </button>
  )
}

function Trash2Icon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}
