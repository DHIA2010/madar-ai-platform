"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  localizeConnectionAction,
} from "../services"
import { ConnectionActionsMenu } from "./connection-actions-menu"
import { ConnectorLogo } from "./connector-logo"

import type { SyncJobStatus } from "@/application/contracts"
import { cairo } from "@/components/design/fonts"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return DATE_TIME_FORMAT.format(date)
}

function formatDuration(ms?: number | null) {
  if (ms === undefined || ms === null) {
    return "-"
  }
  if (ms < 1000) {
    return `${ms} م.ث`
  }
  return `${(ms / 1000).toFixed(1)} ثانية`
}

const CONNECTION_STATUS_AR: Record<string, { label: string; className: string }> = {
  connected: { label: "متصل", className: "bg-[#ecfdf5] text-[#10b981]" },
  valid: { label: "متصل", className: "bg-[#ecfdf5] text-[#10b981]" },
  authorized: { label: "مصرّح", className: "bg-[#ecfdf5] text-[#10b981]" },
  syncing: { label: "قيد المزامنة", className: "bg-[#eff6ff] text-[#2563eb]" },
  paused: { label: "متوقف مؤقتًا", className: "bg-[#fffbeb] text-[#f59e0b]" },
  disconnected: { label: "غير متصل", className: "bg-[#fef2f2] text-[#ef4444]" },
  error: { label: "خطأ", className: "bg-[#fef2f2] text-[#ef4444]" },
  draft: { label: "مسودة", className: "bg-[#f1f5f9] text-[#64748b]" },
  deleted: { label: "محذوف", className: "bg-[#f1f5f9] text-[#64748b]" },
}

const SYNC_STATUS_AR: Record<string, { label: string; className: string }> = {
  queued: { label: "في الانتظار", className: "bg-[#f1f5f9] text-[#64748b]" },
  running: { label: "قيد التشغيل", className: "bg-[#eff6ff] text-[#2563eb]" },
  completed: { label: "مكتملة", className: "bg-[#ecfdf5] text-[#10b981]" },
  failed: { label: "فشلت", className: "bg-[#fef2f2] text-[#ef4444]" },
  paused: { label: "متوقفة", className: "bg-[#fffbeb] text-[#f59e0b]" },
  canceled: { label: "ملغاة", className: "bg-[#f1f5f9] text-[#64748b]" },
}

function StatusBadge({
  status,
  map,
}: {
  status?: string | null
  map: Record<string, { label: string; className: string }>
}) {
  if (!status) {
    return <span className={cn("text-[12.5px]", MUTED)}>-</span>
  }
  const meta = map[status] ?? { label: status, className: "bg-[#f1f5f9] text-[#64748b]" }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        meta.className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}

const CAPABILITY_LABEL_AR: Record<string, string> = {
  products: "المنتجات",
  orders: "الطلبات",
  customers: "العملاء",
  catalog: "الكتالوج",
  media: "الوسائط",
  traffic: "الزيارات",
  events: "الأحداث",
  conversions: "التحويلات",
  campaigns: "الحملات",
  ads: "الإعلانات",
}

function capabilityLabel(capability: string) {
  return CAPABILITY_LABEL_AR[capability] ?? capability
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
      <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
        <div className={cn(PANEL, "px-6 py-16 text-center")}>
          <p className={cn("text-[15px] font-semibold", HEADING)}>
            {isLoading ? "جارٍ التحميل..." : "لم يتم العثور على الاتصال"}
          </p>
        </div>
      </div>
    )
  }

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
    .map(localizeConnectionAction)

  const events = showAllEvents
    ? record.integrationStatus.recentEvents
    : record.integrationStatus.recentEvents.slice(0, EVENTS_PREVIEW_COUNT)

  const capabilityTabs = [
    ...record.capabilities.map((capability) => ({
      id: capability,
      label: capabilityLabel(capability),
    })),
    { id: "metadata", label: "البيانات الوصفية" },
  ]

  const onDeleteConnection = async () => {
    if (isDeleting) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteConnection(connectionId)
      toast.success("تم حذف الاتصال بنجاح.")
      setIsDeleteDialogOpen(false)
      router.push(ROUTES.integrations)
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر حذف الاتصال."
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
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      {/* Breadcrumb + back link */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className={cn("text-[12px]", MUTED)}>
          <Link href={ROUTES.integrations} className="hover:text-[#2878ff]">
            التكاملات
          </Link>
          <span className="mx-1.5">›</span>
          <span>{record.platformName}</span>
          <span className="mx-1.5">›</span>
          <span className={HEADING}>تفاصيل التكامل</span>
        </div>
        <Link
          href={ROUTES.integrations}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7b96] transition-colors hover:text-[#2878ff]"
        >
          <ChevronLeft className="size-3.5 rtl:rotate-180" />
          العودة إلى التكاملات
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
                <StatusBadge status={record.connection.status} map={CONNECTION_STATUS_AR} />
              </div>
              <p className={cn("mt-1 text-[12.5px]", MUTED)}>
                إدارة الاتصال مع منصة {record.platformName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={ROUTES.integrationsSchedule(connectionId)}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#f3d3d3] bg-[#fdf2f2] px-3.5 text-[12.5px] font-semibold text-[#5b6b85] transition-colors hover:bg-[#fbe6e6]"
            >
              <CalendarClock className="size-4" />
              إعدادات الجدولة
            </Link>
            <ConnectionActionsMenu
              actions={availableActions}
              menuLabel="إجراءات الاتصال"
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
            <h2 className={cn("mb-2 text-[15px] font-bold", HEADING)}>معلومات عامة</h2>
            <dl className="divide-y divide-[#eef1f6]">
              <InfoRow label="معرف الاتصال" value={record.connection.connectionId} />
              <InfoRow label="اسم التكامل" value={record.platformName} />
              <InfoRow label="نوع الموصل" value={record.connectorId} />
              <InfoRow label="مساحة العمل" value={record.workspaceName} />
              <InfoRow label="الإصدار" value={record.version} />
              <InfoRow
                label="حالة المصادقة"
                value={<StatusBadge status={record.connection.status} map={CONNECTION_STATUS_AR} />}
              />
              <InfoRow label="انتهاء الرمز" value={formatDateTime(record.tokenExpiresAt)} />
            </dl>
          </div>

          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-2 text-[15px] font-bold", HEADING)}>الحسابات المرتبطة</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-2.5">
                <div className={cn("text-[11px]", MUTED)}>العميل المحدد</div>
                <div className={cn("mt-1 text-[13px] font-bold", HEADING)}>
                  {record.connectedAccount || "-"}
                </div>
              </div>
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-2.5">
                <div className={cn("text-[11px]", MUTED)}>حساب {record.platformName} المتصل</div>
                <div className={cn("mt-1 text-[13px] font-bold", HEADING)} dir="ltr">
                  {connectedAccountEmail}
                </div>
              </div>
              <div className="rounded-[10px] border border-[#eef1f6] bg-[#f9fbfd] px-3.5 py-2.5 sm:col-span-2">
                <div className={cn("text-[11px]", MUTED)}>معرف العميل</div>
                <div className={cn("mt-1 text-[13px] font-bold", HEADING)} dir="ltr">
                  {customerId}
                </div>
              </div>
            </div>
          </div>

          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-3 text-[15px] font-bold", HEADING)}>القدرات والبيانات الوصفية</h2>
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
                <span className="font-semibold text-[#10b981]">مفعّلة</span>
                <span className={cn("mr-1.5", MUTED)}>
                  لهذا الاتصال. لا تتوفر بيانات تفصيلية إضافية لهذه القدرة حاليًا.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Left column: sync health + activity */}
        <div className="space-y-3.5">
          <div className={cn(PANEL, "px-5 py-4")}>
            <h2 className={cn("mb-2 text-[15px] font-bold", HEADING)}>المزامنة والموثوقية</h2>
            <dl className="divide-y divide-[#eef1f6]">
              <InfoRow label="آخر مزامنة" value={formatDateTime(record.lastSyncAt)} />
              <InfoRow label="المزامنة القادمة" value={formatDateTime(record.nextSyncAt)} />
              <InfoRow
                label="حالة المزامنة"
                value={
                  <StatusBadge
                    status={record.latestSyncStatus as SyncJobStatus | undefined}
                    map={SYNC_STATUS_AR}
                  />
                }
              />
              <InfoRow label="عدد المحاولات" value={record.retryCount} />
              <InfoRow
                label="الحد المسموح للمحاولات"
                value={latestJob?.policy.maxAttempts ?? "-"}
              />
              <InfoRow label="الوقت المتبقي للحد" value={latestJob?.rateLimit?.remaining ?? "-"} />
              <InfoRow
                label="إعادة تعيين الحد الزمني"
                value={formatDateTime(latestJob?.rateLimit?.resetAt)}
              />
              <InfoRow
                label="مدة آخر مزامنة"
                value={formatDuration(latestRun?.result?.durationMs)}
              />
              <InfoRow
                label="آخر خطأ"
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
              <h2 className={cn("text-[15px] font-bold", HEADING)}>السجلات والأنشطة الحديثة</h2>
            </div>
            {events.length === 0 ? (
              <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>
                لا توجد أنشطة مسجلة لهذا الاتصال بعد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr>
                      {["#", "الحدث", "التاريخ", "الوصف"].map((heading) => (
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
                          {formatDateTime(event.timestamp)}
                        </td>
                        <td className="border-b border-[#eef1f6] px-2.5 py-2 text-[11.5px] text-[#40506d]">
                          {event.message}
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
                  ? "عرض أقل"
                  : `عرض جميع السجلات (${record.integrationStatus.recentEvents.length})`}
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
        cancelLabel="إلغاء"
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
