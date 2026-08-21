"use client"

import Link from "next/link"
import {
  ArrowLeft,
  Calendar,
  Loader2,
  Mail,
  Phone,
  ShoppingBag,
  Store,
  Tag,
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
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  RelativeTime,
} from "@/components/app"

import { useCustomer } from "../hooks"
import type { CustomerSegment, CustomerStatus } from "../types"

// ─── Shared helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return (
    new Intl.NumberFormat("en-SA", { style: "decimal", maximumFractionDigits: 0 }).format(value) +
    " SAR"
  )
}

const STATUS_STYLE: Record<CustomerStatus, { label: string; className: string; dot: string }> = {
  new: { label: "New", className: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  at_risk: { label: "At Risk", className: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  churned: { label: "Churned", className: "bg-red-100 text-red-800", dot: "bg-red-500" },
  inactive: { label: "Inactive", className: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
}

const SEGMENT_STYLE: Record<CustomerSegment, string> = {
  VIP: "bg-violet-100 text-violet-800",
  Loyal: "bg-indigo-100 text-indigo-800",
  "One Time": "bg-muted text-muted-foreground",
  New: "bg-sky-100 text-sky-800",
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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-background/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function CustomerProfile({ customerId }: { customerId: string }) {
  const { customer, isLoading, error } = useCustomer(customerId)

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
                  Real identity and order history from your connected store
                </p>
              </div>
            </div>
          </div>
        </AppSection>

        {isLoading ? (
          <AppSection>
            <AppCard>
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading customer...
              </div>
            </AppCard>
          </AppSection>
        ) : error ? (
          <AppSection>
            <AppCard>
              <div className="px-4 py-8 text-center text-sm text-rose-700">{error}</div>
            </AppCard>
          </AppSection>
        ) : !customer ? (
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
              <AppCard>
                <SectionHeader icon={<User className="size-4" />} title="Identity" />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">
                    {customer.name
                      .split(" ")
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join("")
                      .toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{customer.name}</h3>
                      <CustomerStatusBadge status={customer.status} />
                      <AppBadge
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          SEGMENT_STYLE[customer.segment]
                        )}
                      >
                        {customer.segment}
                      </AppBadge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {customer.email ? (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3.5" /> {customer.email}
                        </span>
                      ) : null}
                      {customer.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3.5" /> {customer.phone}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Tag className="size-3.5" /> {customer.id}
                      </span>
                      <span className="flex items-center gap-1">
                        <Store className="size-3.5" /> {customer.platform}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" /> Customer since{" "}
                        <RelativeTime value={customer.createdAt} fallback="—" />
                      </span>
                    </div>
                  </div>
                </div>
              </AppCard>
            </AppSection>

            <AppSection>
              <AppCard>
                <SectionHeader icon={<ShoppingBag className="size-4" />} title="Commerce" />
                <AppGrid variant={4}>
                  <StatCard label="Lifetime Value" value={formatCurrency(customer.lifetimeValue)} />
                  <StatCard label="Total Orders" value={customer.totalOrders} />
                  <StatCard label="Revenue" value={formatCurrency(customer.totalRevenue)} />
                  <StatCard
                    label="Avg. Order Value"
                    value={formatCurrency(customer.averageOrderValue)}
                  />
                </AppGrid>

                {customer.productsPurchased.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Products Purchased
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {customer.productsPurchased.map((product) => (
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

                {customer.orders.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Orders ({customer.orders.length})
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
                        {customer.orders.map((order) => (
                          <AppTableRow key={order.orderId} className="h-12">
                            <AppTableCell className="font-mono text-xs">
                              {order.orderId}
                            </AppTableCell>
                            <AppTableCell>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {order.status}
                              </span>
                            </AppTableCell>
                            <AppTableCell>
                              {new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: order.currency,
                                maximumFractionDigits: 2,
                              }).format(order.revenue)}
                            </AppTableCell>
                            <AppTableCell>{order.itemCount}</AppTableCell>
                            <AppTableCell className="text-xs text-muted-foreground">
                              <RelativeTime value={order.createdAt} fallback="—" />
                            </AppTableCell>
                          </AppTableRow>
                        ))}
                      </AppTableBody>
                    </AppTable>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">No orders yet</p>
                )}
              </AppCard>
            </AppSection>
          </>
        )}
      </AppContainer>
    </AppPage>
  )
}
