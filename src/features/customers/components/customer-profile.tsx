"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Globe,
  Mail,
  MailOpen,
  Megaphone,
  Phone,
  ShoppingBag,
  Tag,
  TrendingUp,
  User,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppBadge,
  AppButton,
  AppCard,
  AppContainer,
  AppGrid,
  AppPage,
  AppSection,
  AppSkeleton,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
} from "@/components/app"

import {
  useCustomer,
  useCustomerActions,
  useCustomerAttribution,
  useCustomerCommerceStats,
  useCustomerJourney,
  useCustomerMarketingActivity,
  useCustomerOrders,
  useCustomerSegments,
  useCustomerSessions,
  useCustomerWebsiteActivity,
} from "../hooks"
import type { CustomerStatus } from "../types"

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return (
    new Intl.NumberFormat("en-SA", { style: "decimal", maximumFractionDigits: 0 }).format(value) +
    " SAR"
  )
}

function formatDate(iso?: string): string {
  if (!iso) {
    return "—"
  }

  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor(diff / 60000)

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  if (hours < 24) {
    return `${hours}h ago`
  }

  if (days < 7) {
    return `${days}d ago`
  }

  return d.toLocaleDateString("en-SA", { month: "short", day: "numeric", year: "numeric" })
}

const STATUS_STYLE: Record<CustomerStatus, { label: string; className: string; dot: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  inactive: { label: "Inactive", className: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  at_risk: { label: "At Risk", className: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  churned: { label: "Churned", className: "bg-red-100 text-red-800", dot: "bg-red-500" },
  new: { label: "New", className: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
}

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const meta = STATUS_STYLE[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        meta.className
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/80">{title}</h2>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function AttributionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  )
}

// ─── Section Components ───────────────────────────────────────────────────────

function IdentitySection({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId)

  if (!customer) {
    return (
      <AppCard>
        <div className="space-y-2">
          <AppSkeleton className="h-5 w-40" />
          <AppSkeleton className="h-4 w-52" />
        </div>
      </AppCard>
    )
  }

  return (
    <AppCard>
      <SectionHeader icon={<User className="size-4" />} title="Identity" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">
          {customer.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{customer.name}</h3>
            <CustomerStatusBadge status={customer.status} />
            <AppBadge className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
              {customer.segment}
            </AppBadge>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="size-3.5" /> {customer.email}
            </span>
            {customer.phone ? (
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" /> {customer.phone}
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Tag className="size-3.5" /> {customer.customerId}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" /> Customer since {formatDate(customer.createdAt)}
            </span>
          </div>
          {customer.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customer.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </AppCard>
  )
}

function TimelineSection({ customerId }: { customerId: string }) {
  const { events } = useCustomerJourney(customerId)

  const eventIcon: Record<string, string> = {
    signup: "👤",
    page_view: "👁",
    product_view: "📦",
    add_to_cart: "🛒",
    purchase: "✅",
    campaign_click: "📧",
    email_open: "📬",
    search: "🔍",
    checkout: "💳",
  }

  return (
    <AppCard>
      <SectionHeader icon={<TrendingUp className="size-4" />} title="Customer Journey" />
      <div className="relative pl-4">
        <div className="absolute left-1.5 top-0 h-full w-px bg-border" />
        <div className="space-y-4">
          {events.map((event) => (
            <div key={event.eventId} className="relative flex gap-3">
              <div className="absolute -left-[15px] flex size-5 items-center justify-center rounded-full bg-background text-sm ring-2 ring-border">
                {eventIcon[event.eventName] ?? "•"}
              </div>
              <div className="flex-1 rounded-xl border bg-background/70 px-3 py-2">
                <p className="text-sm font-medium">{event.label}</p>
                <p className="text-xs text-muted-foreground">{formatDate(event.timestamp)}</p>
              </div>
            </div>
          ))}
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No journey events recorded</p>
          ) : null}
        </div>
      </div>
    </AppCard>
  )
}

function AttributionSection({ customerId }: { customerId: string }) {
  const { attribution } = useCustomerAttribution(customerId)

  return (
    <AppCard>
      <SectionHeader icon={<Globe className="size-4" />} title="Attribution" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-background/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            First Touch
          </p>
          <AttributionField label="Source" value={attribution.firstTouchSource} />
          <AttributionField label="Medium" value={attribution.firstTouchMedium} />
          <AttributionField label="Campaign" value={attribution.firstTouchCampaign} />
        </div>
        <div className="space-y-3 rounded-xl border bg-background/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last Touch
          </p>
          <AttributionField label="Source" value={attribution.lastTouchSource} />
          <AttributionField label="Medium" value={attribution.lastTouchMedium} />
          <AttributionField label="Campaign" value={attribution.lastTouchCampaign} />
        </div>
        <div className="space-y-3 rounded-xl border bg-background/70 p-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Acquisition
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <AttributionField label="Campaign" value={attribution.acquisitionCampaign} />
            <AttributionField label="Source" value={attribution.acquisitionSource} />
            <AttributionField label="Channel" value={attribution.acquisitionChannel} />
          </div>
        </div>
      </div>
    </AppCard>
  )
}

function CommerceSection({ customerId }: { customerId: string }) {
  const { stats } = useCustomerCommerceStats(customerId)
  const { orders } = useCustomerOrders(customerId)

  return (
    <AppCard>
      <SectionHeader icon={<ShoppingBag className="size-4" />} title="Commerce" />
      <AppGrid variant={4}>
        <StatCard label="Lifetime Value" value={formatCurrency(stats.lifetimeValue)} />
        <StatCard label="Total Orders" value={stats.totalOrders} />
        <StatCard label="Revenue" value={formatCurrency(stats.totalRevenue)} />
        <StatCard label="Avg. Order Value" value={formatCurrency(stats.averageOrderValue)} />
      </AppGrid>

      {stats.productsPurchased.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Products Purchased
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.productsPurchased.map((product) => (
              <span
                key={product}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {product}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {orders.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent Orders ({orders.length})
          </p>
          <AppTable>
            <AppTableHeader>
              <AppTableRow>
                <AppTableHead>Order ID</AppTableHead>
                <AppTableHead>Status</AppTableHead>
                <AppTableHead>Revenue</AppTableHead>
                <AppTableHead>Items</AppTableHead>
                <AppTableHead>Date</AppTableHead>
              </AppTableRow>
            </AppTableHeader>
            <AppTableBody>
              {orders.slice(0, 5).map((order) => (
                <AppTableRow key={order.orderId} className="h-12">
                  <AppTableCell className="font-mono text-xs">{order.orderId}</AppTableCell>
                  <AppTableCell>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        order.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : order.status === "refunded"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-slate-100 text-slate-700"
                      )}
                    >
                      {order.status}
                    </span>
                  </AppTableCell>
                  <AppTableCell>{formatCurrency(order.revenue)}</AppTableCell>
                  <AppTableCell>{order.itemCount}</AppTableCell>
                  <AppTableCell className="text-xs text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </AppTableCell>
                </AppTableRow>
              ))}
            </AppTableBody>
          </AppTable>
        </div>
      ) : null}
    </AppCard>
  )
}

function WebsiteActivitySection({ customerId }: { customerId: string }) {
  const { activity } = useCustomerWebsiteActivity(customerId)

  return (
    <AppCard>
      <SectionHeader icon={<Globe className="size-4" />} title="Website Activity" />
      <AppGrid variant={4}>
        <StatCard label="Sessions" value={activity.totalSessions} />
        <StatCard label="Page Views" value={activity.totalPageViews} />
      </AppGrid>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top Landing Pages
          </p>
          <div className="space-y-1.5">
            {activity.topLandingPages.map((page) => (
              <div
                key={page.page}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
              >
                <span className="truncate text-xs font-mono text-foreground">{page.page}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{page.visits}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Devices
          </p>
          <div className="space-y-1.5">
            {activity.devices.map((device) => (
              <div
                key={device.device}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
              >
                <span className="text-xs text-foreground">{device.device}</span>
                <span className="text-xs text-muted-foreground">{device.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Browsers
          </p>
          <div className="space-y-1.5">
            {activity.browsers.map((browser) => (
              <div
                key={browser.browser}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
              >
                <span className="text-xs text-foreground">{browser.browser}</span>
                <span className="text-xs text-muted-foreground">{browser.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppCard>
  )
}

function MarketingActivitySection({ customerId }: { customerId: string }) {
  const { activity } = useCustomerMarketingActivity(customerId)

  return (
    <AppCard>
      <SectionHeader icon={<Megaphone className="size-4" />} title="Marketing Activity" />
      <AppGrid variant={3}>
        <StatCard label="Campaigns Seen" value={activity.campaignsSeen} />
        <StatCard label="Ads Clicked" value={activity.adsClicked} />
        <StatCard label="Emails Opened" value={activity.emailOpened} />
        <StatCard label="Email Clicks" value={activity.emailClicked} />
        <StatCard label="SMS Received" value={activity.smsReceived} />
        <StatCard label="Push Received" value={activity.pushReceived} />
      </AppGrid>
    </AppCard>
  )
}

function SegmentsSection({ customerId }: { customerId: string }) {
  const { segments } = useCustomerSegments(customerId)

  const current = segments.filter((s) => s.isCurrent)
  const past = segments.filter((s) => !s.isCurrent)

  return (
    <AppCard>
      <SectionHeader icon={<CheckCircle2 className="size-4" />} title="Segments" />
      <div className="space-y-4">
        {current.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current Segments
            </p>
            <div className="flex flex-wrap gap-2">
              {current.map((seg) => (
                <span
                  key={seg.segmentId}
                  className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800"
                >
                  {seg.segmentName}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {past.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Previous Segments
            </p>
            <div className="space-y-1.5">
              {past.map((seg) => (
                <div
                  key={seg.segmentId}
                  className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-xs"
                >
                  <span>{seg.segmentName}</span>
                  <span className="text-muted-foreground">
                    {formatDate(seg.joinedAt)} – {seg.leftAt ? formatDate(seg.leftAt) : "present"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppCard>
  )
}

function NotesTagsSection({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId)
  const { addNote, addTag, removeTag, isPending } = useCustomerActions(customerId)
  const [noteInput, setNoteInput] = useState("")
  const [tagInput, setTagInput] = useState("")
  const [, forceRefresh] = useState(0)

  const handleAddNote = useCallback(async () => {
    if (!noteInput.trim()) {
      return
    }

    await addNote(noteInput.trim())
    setNoteInput("")
    forceRefresh((n) => n + 1)
  }, [addNote, noteInput])

  const handleAddTag = useCallback(async () => {
    if (!tagInput.trim()) {
      return
    }

    await addTag(tagInput.trim())
    setTagInput("")
    forceRefresh((n) => n + 1)
  }, [addTag, tagInput])

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      await removeTag(tag)
      forceRefresh((n) => n + 1)
    },
    [removeTag]
  )

  if (!customer) {
    return null
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AppCard>
        <SectionHeader icon={<Mail className="size-4" />} title="Notes" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="Add internal note..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleAddNote()
                }
              }}
            />
            <AppButton
              size="sm"
              disabled={isPending || !noteInput.trim()}
              onClick={() => void handleAddNote()}
            >
              Add
            </AppButton>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {customer.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet</p>
            ) : (
              customer.notes.map((note) => (
                <div key={note.noteId} className="rounded-xl border bg-muted/30 px-3 py-2">
                  <p className="text-sm">{note.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.createdBy} · {formatDate(note.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </AppCard>

      <AppCard>
        <SectionHeader icon={<Tag className="size-4" />} title="Tags" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleAddTag()
                }
              }}
            />
            <AppButton
              size="sm"
              disabled={isPending || !tagInput.trim()}
              onClick={() => void handleAddTag()}
            >
              Add
            </AppButton>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {customer.tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags</p>
            ) : (
              customer.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    className="rounded text-muted-foreground hover:text-foreground"
                    onClick={() => void handleRemoveTag(tag)}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </AppCard>
    </div>
  )
}

function RecentActivityFeed({ customerId }: { customerId: string }) {
  const { sessions } = useCustomerSessions(customerId)

  return (
    <AppCard>
      <SectionHeader icon={<MailOpen className="size-4" />} title="Recent Activity Feed" />
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recent sessions</p>
      ) : (
        <div className="space-y-2">
          {sessions.slice(0, 8).map((session) => (
            <div
              key={session.sessionId}
              className="flex items-center justify-between rounded-xl border bg-background/70 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{session.device}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{session.browser}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-muted-foreground">{session.entryPage}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{session.pageViews} pages</span>
                <span>·</span>
                <span>{formatDate(session.startedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppCard>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function CustomerProfile({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId)
  const { archiveCustomer, isPending } = useCustomerActions(customerId)
  const [, forceRefresh] = useState(0)

  const handleArchive = useCallback(async () => {
    await archiveCustomer()
    forceRefresh((n) => n + 1)
  }, [archiveCustomer])

  return (
    <AppPage>
      <AppContainer>
        <AppSection>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href={ROUTES.customers}>
                <AppButton
                  size="sm"
                  variant="outline"
                  className="h-10 px-3 gap-2 rounded-xl border-border/70 bg-transparent hover:border-border/90 hover:bg-muted/40 active:scale-[0.98] transition-all duration-[180ms]"
                >
                  <ArrowLeft className="size-4" />
                  Back to Customers
                </AppButton>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {customer?.name ?? "Customer 360"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Full customer profile and activity history
                </p>
              </div>
            </div>

            <AppButton
              size="sm"
              variant="outline"
              className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20"
              disabled={isPending}
              onClick={() => void handleArchive()}
            >
              Archive Customer
            </AppButton>
          </div>
        </AppSection>

        {!customer ? (
          <AppSection>
            <AppCard
              title="Customer not found"
              subtitle="No customer matched the provided ID."
              state="empty"
            />
          </AppSection>
        ) : (
          <>
            <AppSection>
              <IdentitySection customerId={customerId} />
            </AppSection>

            <AppSection>
              <div className="grid gap-4 lg:grid-cols-2">
                <TimelineSection customerId={customerId} />
                <AttributionSection customerId={customerId} />
              </div>
            </AppSection>

            <AppSection>
              <CommerceSection customerId={customerId} />
            </AppSection>

            <AppSection>
              <div className="grid gap-4 lg:grid-cols-2">
                <WebsiteActivitySection customerId={customerId} />
                <MarketingActivitySection customerId={customerId} />
              </div>
            </AppSection>

            <AppSection>
              <SegmentsSection customerId={customerId} />
            </AppSection>

            <AppSection>
              <NotesTagsSection customerId={customerId} />
            </AppSection>

            <AppSection>
              <RecentActivityFeed customerId={customerId} />
            </AppSection>
          </>
        )}
      </AppContainer>
    </AppPage>
  )
}
