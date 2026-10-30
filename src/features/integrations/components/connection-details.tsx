"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { CalendarClock, ChevronLeft } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppConfirmDialog } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useConnectionsCenter } from "../hooks"
import {
  CONNECTION_ACTION_IDS,
  type ConnectionActionDefinition,
  connectionActionPolicy,
  localizeConnectionActionTranslated,
  syncComponentsService,
} from "../services"
import { ConnectionActionsMenu } from "./connection-actions-menu"
import { ConnectorLogo } from "./connector-logo"
import { SyncComponentsPanel } from "./sync-components-panel"

import type { SyncJobStatus } from "@/application/contracts"
import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"
import { resolveBackendProviderId } from "@/infrastructure/data/repositories/integration.repository"

type IntegrationsTranslator = ReturnType<typeof useTranslations<"integrations">>

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

// Mirrors schedule-settings.tsx's dateTimeLocale(locale) helper in this same feature: Arabic
// numerals are forced to Western digits via -u-nu-latn so they match the plain numbers coming
// from the backend.
function dateTimeLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US"
}

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return new Intl.DateTimeFormat(dateTimeLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatDuration(ms: number | null | undefined, t: IntegrationsTranslator) {
  if (ms === undefined || ms === null) {
    return "-"
  }
  if (ms < 1000) {
    return t("connectionDetails.durationMs", { value: ms })
  }
  return t("connectionDetails.durationSeconds", { value: (ms / 1000).toFixed(1) })
}

// Status key -> i18n key is the identity here (unlike connections-overview.tsx, where
// disconnected/error collapse to a shared label) -- the dict below also doubles as the set of
// known status ids. Kept distinct from connections-overview.tsx's own status labels since the two
// screens show different Arabic copy for the same status ids (e.g. authorized reads "مصرّح" here
// vs "متصل" on the overview, disconnected reads "غير متصل" here vs "خطأ" on the overview).
const CONNECTION_STATUS_CLASSNAME: Record<string, string> = {
  connected: "bg-[#ecfdf5] text-[#10b981]",
  valid: "bg-[#ecfdf5] text-[#10b981]",
  authorized: "bg-[#ecfdf5] text-[#10b981]",
  syncing: "bg-[#eff6ff] text-[#2563eb]",
  paused: "bg-[#fffbeb] text-[#f59e0b]",
  disconnected: "bg-[#fef2f2] text-[#ef4444]",
  error: "bg-[#fef2f2] text-[#ef4444]",
  draft: "bg-[#f1f5f9] text-[#64748b]",
  deleted: "bg-[#f1f5f9] text-[#64748b]",
}

const SYNC_STATUS_CLASSNAME: Record<string, string> = {
  queued: "bg-[#f1f5f9] text-[#64748b]",
  running: "bg-[#eff6ff] text-[#2563eb]",
  completed: "bg-[#ecfdf5] text-[#10b981]",
  failed: "bg-[#fef2f2] text-[#ef4444]",
  paused: "bg-[#fffbeb] text-[#f59e0b]",
  canceled: "bg-[#f1f5f9] text-[#64748b]",
}

function StatusBadge({
  status,
  classNames,
  prefix,
  t,
}: {
  status?: string | null
  classNames: Record<string, string>
  prefix: string
  t: IntegrationsTranslator
}) {
  if (!status) {
    return <span className={cn("text-[12.5px]", MUTED)}>-</span>
  }
  const label = classNames[status]
    ? t(`${prefix}.${status}` as "connectionDetails.statusLabels.connected")
    : status
  const className = classNames[status] ?? "bg-[#f1f5f9] text-[#64748b]"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

const CAPABILITY_LABEL_KEYS: Record<string, string> = {
  products: "products",
  orders: "orders",
  customers: "customers",
  catalog: "catalog",
  media: "media",
  traffic: "traffic",
  events: "events",
  conversions: "conversions",
  campaigns: "campaigns",
  ads: "ads",
}

function capabilityLabel(capability: string, t: IntegrationsTranslator) {
  const key = CAPABILITY_LABEL_KEYS[capability]
  return key
    ? t(
        `connectionDetails.capabilityLabels.${key}` as "connectionDetails.capabilityLabels.products"
      )
    : capability
}

const EVENTS_PREVIEW_COUNT = 5

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={cn("text-[12.5px]", MUTED)}>{label}</dt>
      <dd className={cn("text-[12.5px] font-semibold", HEADING)}>{value}</dd>
    </div>
  )
}

export function ConnectionDetails({ connectionId }: { connectionId: string }) {
  const t = useTranslations("integrations")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  const { availableWorkspaces } = useWorkspace()
  const {
    connect,
    deleteConnection,
    disconnect,
    getConnectionById,
    isLoading,
    pauseSync,
    resumeSync,
    retrySync,
  } = useConnectionsCenter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingAction, setPendingAction] = useState<ConnectionActionDefinition | null>(null)
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [activeCapabilityTab, setActiveCapabilityTab] = useState("metadata")
  const record = getConnectionById(connectionId)

  if (!record) {
    return (
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>
            {isLoading ? tCommon("loading") : t("connectionDetails.notFound")}
          </p>
        </div>
      </div>
    )
  }

  const backendProviderId = resolveBackendProviderId(record.connectorDefinitionId)
  const latestJob = record.integrationStatus.latestJob
  const latestRun = record.integrationStatus.latestRun
  const workspaceStatus = availableWorkspaces.find(
    (workspace) => workspace.id === record.connection.workspaceId
  )?.status
  const availableActions = connectionActionPolicy
    .getAvailableActions({
      connection: record.connection,
      integrationStatus: record.integrationStatus,
      workspaceStatus,
    })
    .map((action) => localizeConnectionActionTranslated(action, t))

  const events = showAllEvents
    ? record.integrationStatus.recentEvents
    : record.integrationStatus.recentEvents.slice(0, EVENTS_PREVIEW_COUNT)

  const capabilityTabs = [
    ...record.capabilities.map((capability) => ({
      id: capability,
      label: capabilityLabel(capability, t),
    })),
    { id: "metadata", label: t("connectionDetails.tabs.metadata") },
  ]

  const onDeleteConnection = async () => {
    if (isDeleting) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteConnection(connectionId)
      toast.success(t("connectionDetails.toasts.deleteSuccess"))
      setIsDeleteDialogOpen(false)
      router.push(ROUTES.integrations)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("connectionDetails.toasts.deleteFailed")
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleConnectionAction = async (action: ConnectionActionDefinition) => {
    if (action.requiresConfirmation) {
      setPendingAction(action)
      setIsDeleteDialogOpen(true)
      return
    }

    switch (action.id) {
      case CONNECTION_ACTION_IDS.RECONNECT:
        await connect(connectionId)
        return
      case CONNECTION_ACTION_IDS.PAUSE_SYNC:
        await pauseSync(record)
        return
      case CONNECTION_ACTION_IDS.RESUME_SYNC:
        await resumeSync(record)
        return
      case CONNECTION_ACTION_IDS.RETRY:
        await retrySync(record)
        return
      case CONNECTION_ACTION_IDS.DISCONNECT:
        await disconnect(connectionId)
        return
      case CONNECTION_ACTION_IDS.DELETE_CONNECTION:
        setPendingAction(action)
        setIsDeleteDialogOpen(true)
        return
      default:
        return
    }
  }

  const connectedAccountEmail =
    record.connection.metadata.accountEmail?.trim() || record.connectedAccount || "-"
  const customerId = record.connection.metadata.customerId?.trim() || "-"

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      {/* Breadcrumb + back link */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className={cn("text-[12px]", MUTED)}>
          <Link href={ROUTES.integrations} className="hover:text-[#2878ff]">
            {t("connectionDetails.breadcrumb.integrations")}
          </Link>
          <span className="mx-1.5">›</span>
          <span>{record.platformName}</span>
          <span className="mx-1.5">›</span>
          <span className={HEADING}>{t("connectionDetails.breadcrumb.connectionDetails")}</span>
        </div>
        <Link
          href={ROUTES.integrations}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7b96] transition-colors hover:text-[#2878ff]"
        >
          <ChevronLeft className="size-3.5 rtl:rotate-180" />
          {t("connectionDetails.backLink")}
        </Link>
      </div>

      {/* Header */}
      <div className={cn(PANEL, "mb-3.5 px-6 py-5")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5 text-right">
            <ConnectorLogo platformName={record.platformName} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
                  {record.platformName}
                </h1>
                <StatusBadge
                  status={record.connection.status}
                  classNames={CONNECTION_STATUS_CLASSNAME}
                  prefix="connectionDetails.statusLabels"
                  t={t}
                />
              </div>
              <p className={cn("mt-1 text-[12.5px]", MUTED)}>
                {t("connectionDetails.manageConnectionWith", { platform: record.platformName })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={ROUTES.integrationsSchedule(connectionId)}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f3d3d3] bg-[#fdf2f2] px-3.5 text-[12.5px] font-semibold text-[#5b6b85] transition-colors hover:bg-[#fbe6e6]"
            >
              <CalendarClock className="size-4" />
              {t("connectionDetails.scheduleSettingsLink")}
            </Link>
            <ConnectionActionsMenu
              actions={availableActions}
              menuLabel={t("connectionDetails.actionsMenuLabel")}
              onActionSelect={(action) => {
                void handleConnectionAction(action)
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        {/* Right column (first in RTL reading order): primary connection info */}
        <div className="space-y-3.5">
          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-2 text-[15px] font-bold", HEADING)}>
              {t("connectionDetails.sectionTitles.generalInfo")}
            </h2>
            <dl className="divide-y divide-[#eef1f6]">
              <InfoRow
                label={t("connectionDetails.infoRows.connectionId")}
                value={record.connection.connectionId}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.integrationName")}
                value={record.platformName}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.connectorType")}
                value={record.connectorId}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.workspace")}
                value={record.workspaceName}
              />
              <InfoRow label={t("connectionDetails.infoRows.version")} value={record.version} />
              <InfoRow
                label={t("connectionDetails.infoRows.authStatus")}
                value={
                  <StatusBadge
                    status={record.connection.status}
                    classNames={CONNECTION_STATUS_CLASSNAME}
                    prefix="connectionDetails.statusLabels"
                    t={t}
                  />
                }
              />
              <InfoRow
                label={t("connectionDetails.infoRows.tokenExpiry")}
                value={formatDateTime(record.tokenExpiresAt, locale)}
              />
            </dl>
          </div>

          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-2 text-[15px] font-bold", HEADING)}>
              {t("connectionDetails.sectionTitles.linkedAccounts")}
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-2.5">
                <div className={cn("text-[11px]", MUTED)}>
                  {t("connectionDetails.linkedAccounts.selectedClient")}
                </div>
                <div className={cn("mt-1 text-[13px] font-bold", HEADING)}>
                  {record.connectedAccount || "-"}
                </div>
              </div>
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-2.5">
                <div className={cn("text-[11px]", MUTED)}>
                  {t("connectionDetails.linkedAccounts.platformConnectedAccount", {
                    platform: record.platformName,
                  })}
                </div>
                <div className={cn("mt-1 text-[13px] font-bold", HEADING)} dir="ltr">
                  {connectedAccountEmail}
                </div>
              </div>
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-2.5 sm:col-span-2">
                <div className={cn("text-[11px]", MUTED)}>
                  {t("connectionDetails.linkedAccounts.customerId")}
                </div>
                <div className={cn("mt-1 text-[13px] font-bold", HEADING)} dir="ltr">
                  {customerId}
                </div>
              </div>
            </div>
          </div>

          {syncComponentsService.isSupported(backendProviderId) ? (
            <SyncComponentsPanel providerId={backendProviderId!} connectionId={connectionId} />
          ) : null}

          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-3 text-[15px] font-bold", HEADING)}>
              {t("connectionDetails.sectionTitles.capabilitiesAndMetadata")}
            </h2>
            <div className="mb-3 flex flex-wrap gap-1.5 border-b border-[#eef1f6] pb-3">
              {capabilityTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCapabilityTab(tab.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                    activeCapabilityTab === tab.id
                      ? "bg-[#2878ff] text-white"
                      : "bg-[#f4f7fb] text-[#5b6b85] hover:bg-[#eaf1ff]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeCapabilityTab === "metadata" ? (
              <pre
                className="overflow-x-auto rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] p-3.5 text-[11.5px] leading-6 text-[#334155]"
                dir="ltr"
              >
                {JSON.stringify(record.connection.metadata, null, 2)}
              </pre>
            ) : (
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-3 text-[12.5px]">
                <span className="font-semibold text-[#10b981]">
                  {t("connectionDetails.capabilityEnabledBadge")}
                </span>
                <span className={cn("mr-1.5", MUTED)}>
                  {t("connectionDetails.capabilityEnabledHint")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Left column: sync health + activity */}
        <div className="space-y-3.5">
          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-2 text-[15px] font-bold", HEADING)}>
              {t("connectionDetails.sectionTitles.syncAndReliability")}
            </h2>
            <dl className="divide-y divide-[#eef1f6]">
              <InfoRow
                label={t("connectionDetails.infoRows.lastSync")}
                value={formatDateTime(record.lastSyncAt, locale)}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.nextSync")}
                value={formatDateTime(record.nextSyncAt, locale)}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.syncStatus")}
                value={
                  <StatusBadge
                    status={record.latestSyncStatus as SyncJobStatus | undefined}
                    classNames={SYNC_STATUS_CLASSNAME}
                    prefix="connectionDetails.syncStatusLabels"
                    t={t}
                  />
                }
              />
              <InfoRow
                label={t("connectionDetails.infoRows.retryCount")}
                value={record.retryCount}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.maxRetryLimit")}
                value={latestJob?.policy.maxAttempts ?? "-"}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.rateLimitRemaining")}
                value={latestJob?.rateLimit?.remaining ?? "-"}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.rateLimitReset")}
                value={formatDateTime(latestJob?.rateLimit?.resetAt, locale)}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.lastSyncDuration")}
                value={formatDuration(latestRun?.result?.durationMs, t)}
              />
              <InfoRow
                label={t("connectionDetails.infoRows.lastError")}
                value={
                  <span
                    className={
                      (record.lastError ?? latestRun?.errorMessage) ? "text-[#ef4444]" : ""
                    }
                  >
                    {record.lastError ?? latestRun?.errorMessage ?? "-"}
                  </span>
                }
              />
            </dl>
          </div>

          <div className={cn(PANEL, "px-5 py-4")}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={cn("text-[15px] font-bold", HEADING)}>
                {t("connectionDetails.sectionTitles.logsAndActivity")}
              </h2>
            </div>
            {events.length === 0 ? (
              <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>
                {t("connectionDetails.noEventsRecorded")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr>
                      {[
                        "#",
                        t("connectionDetails.eventsTable.event"),
                        t("connectionDetails.eventsTable.date"),
                        t("connectionDetails.eventsTable.description"),
                        t("connectionDetails.eventsTable.syncedItems"),
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="border-b border-[#eef1f6] px-2.5 py-2 text-[11px] font-semibold text-[#8190a8]"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, index) => (
                      <tr key={event.eventId}>
                        <td className="border-b border-[#eef1f6] px-2.5 py-2 text-[11.5px] text-[#8190a8]">
                          {index + 1}
                        </td>
                        <td
                          className="border-b border-[#eef1f6] px-2.5 py-2 text-[11.5px] font-semibold text-[#0b1738]"
                          dir="ltr"
                        >
                          {event.action}
                        </td>
                        <td className="border-b border-[#eef1f6] px-2.5 py-2 text-[11px] text-[#61708a]">
                          {formatDateTime(event.timestamp, locale)}
                        </td>
                        <td className="border-b border-[#eef1f6] px-2.5 py-2 text-[11.5px] text-[#40506d]">
                          {event.message}
                        </td>
                        <td className="border-b border-[#eef1f6] px-2.5 py-2 text-[11.5px] text-[#40506d]">
                          {event.syncedItems ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {record.integrationStatus.recentEvents.length > EVENTS_PREVIEW_COUNT ? (
              <button
                type="button"
                onClick={() => setShowAllEvents((current) => !current)}
                className="mt-2.5 text-[12px] font-semibold text-[#2878ff] hover:underline"
              >
                {showAllEvents
                  ? t("connectionDetails.showLess")
                  : t("connectionDetails.showAllRecords", {
                      count: record.integrationStatus.recentEvents.length,
                    })}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <AppConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setIsDeleteDialogOpen(open)
            if (!open) {
              setPendingAction(null)
            }
          }
        }}
        title={pendingAction?.confirmation?.title ?? ""}
        description={pendingAction?.confirmation?.description ?? ""}
        cancelLabel={tCommon("cancel")}
        confirmLabel={pendingAction?.confirmation?.confirmLabel ?? ""}
        confirmTone="destructive"
        loading={isDeleting}
        onCancel={() => {
          if (!isDeleting) {
            setIsDeleteDialogOpen(false)
            setPendingAction(null)
          }
        }}
        onConfirm={() => {
          void onDeleteConnection()
        }}
      />
    </div>
  )
}
