"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Clock3, ExternalLink, FileText, XCircle } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppDialog,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
  AppStatusBadge,
  AppTable,
  AppTableBody,
  AppTableCell,
  AppTableEmpty,
  AppTableHead,
  AppTableHeader,
  AppTableRow,
  AppTableToolbar,
  AppTextarea,
} from "@/components/app"

import { PLAN_TIER_META } from "@/features/applications"
import { useWorkspace } from "@/features/workspace"

import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

import type {
  SubscriptionActivationRequestDto,
  SubscriptionApplication,
  SubscriptionRequestStatus,
} from "@/application/contracts"

const APPLICATION_LABEL: Record<SubscriptionApplication, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
  madarApps: "تطبيقات مدار",
}

const STATUS_META: Record<SubscriptionRequestStatus, { label: string; className: string }> = {
  pending: { label: "قيد المراجعة", className: "bg-amber-50 text-amber-600" },
  approved: { label: "تمت الموافقة", className: "bg-emerald-50 text-emerald-600" },
  rejected: { label: "مرفوض", className: "bg-rose-50 text-rose-600" },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// The first real (non-mock) data in src/features/madar-admin -- everything else here is still
// the mock catalog built for the UI-only pass; this page is wired to the real
// subscription-activation-requests backend (see the plan for why this slice went first).
export function MadarAdminRequests() {
  const {
    listAllSubscriptionActivationRequests,
    approveSubscriptionActivationRequest,
    rejectSubscriptionActivationRequest,
  } = useWorkspace()
  const [requests, setRequests] = useState<SubscriptionActivationRequestDto[]>([])
  const [statusFilter, setStatusFilter] = useState<SubscriptionRequestStatus | "all">("all")
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<SubscriptionActivationRequestDto | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listAllSubscriptionActivationRequests()
      setRequests(result)
    } catch {
      toast.error("تعذر تحميل طلبات الاشتراك.")
    } finally {
      setLoading(false)
    }
  }, [listAllSubscriptionActivationRequests])

  useEffect(() => {
    refetch()
  }, [refetch])

  const visibleRequests =
    statusFilter === "all"
      ? requests
      : requests.filter((request) => request.status === statusFilter)

  const kpis: MadarAdminKpi[] = [
    {
      label: "إجمالي الطلبات",
      value: String(requests.length),
      deltaPct: null,
      icon: FileText,
      tone: "blue",
    },
    {
      label: "قيد المراجعة",
      value: String(requests.filter((r) => r.status === "pending").length),
      deltaPct: null,
      icon: Clock3,
      tone: "orange",
    },
    {
      label: "تمت الموافقة",
      value: String(requests.filter((r) => r.status === "approved").length),
      deltaPct: null,
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "مرفوضة",
      value: String(requests.filter((r) => r.status === "rejected").length),
      deltaPct: null,
      icon: XCircle,
      tone: "rose",
    },
  ]

  async function handleApprove(request: SubscriptionActivationRequestDto) {
    setActingId(request.id)
    try {
      await approveSubscriptionActivationRequest(request.id)
      toast.success(
        `تم تفعيل ${APPLICATION_LABEL[request.application]} لـ ${request.organizationName}.`
      )
      await refetch()
    } catch {
      toast.error("تعذر الموافقة على الطلب.")
    } finally {
      setActingId(null)
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) {
      toast.error("يرجى كتابة سبب الرفض.")
      return
    }
    setActingId(rejectTarget.id)
    try {
      await rejectSubscriptionActivationRequest(rejectTarget.id, rejectReason.trim())
      toast.success("تم رفض الطلب.")
      setRejectTarget(null)
      setRejectReason("")
      await refetch()
    } catch {
      toast.error("تعذر رفض الطلب.")
    } finally {
      setActingId(null)
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">طلبات الاشتراك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مراجعة طلبات تفعيل التطبيقات المرسلة من عملاء مدار والموافقة عليها أو رفضها.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <AppTableToolbar
        filters={
          <AppSelect
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
          >
            <AppSelectTrigger className="h-10 w-[160px] rounded-[10px] text-sm">
              <AppSelectValue placeholder="الحالة" />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="all">جميع الحالات</AppSelectItem>
              <AppSelectItem value="pending">قيد المراجعة</AppSelectItem>
              <AppSelectItem value="approved">تمت الموافقة</AppSelectItem>
              <AppSelectItem value="rejected">مرفوض</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        }
      />

      <AppCard
        state={loading ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>التطبيق</AppTableHead>
              <AppTableHead>الباقة</AppTableHead>
              <AppTableHead>المرفق</AppTableHead>
              <AppTableHead>تاريخ الطلب</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead className="w-48" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {visibleRequests.map((request) => {
              const statusMeta = STATUS_META[request.status]
              return (
                <AppTableRow key={request.id}>
                  <AppTableCell className="font-medium text-foreground">
                    {request.organizationName}
                  </AppTableCell>
                  <AppTableCell>{APPLICATION_LABEL[request.application]}</AppTableCell>
                  <AppTableCell>{PLAN_TIER_META[request.planTier].name}</AppTableCell>
                  <AppTableCell>
                    <a
                      href={request.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    >
                      عرض المرفق
                      <ExternalLink className="size-3.5" />
                    </a>
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {formatDate(request.createdAt)}
                  </AppTableCell>
                  <AppTableCell>
                    <AppStatusBadge
                      status="neutral"
                      label={statusMeta.label}
                      className={statusMeta.className}
                    />
                  </AppTableCell>
                  <AppTableCell>
                    {request.status === "pending" ? (
                      <div className="flex items-center gap-2">
                        <AppButton
                          size="sm"
                          className="h-9 rounded-[8px]"
                          loading={actingId === request.id}
                          onClick={() => handleApprove(request)}
                        >
                          موافقة
                        </AppButton>
                        <AppButton
                          size="sm"
                          variant="outline"
                          className="h-9 rounded-[8px] text-destructive hover:text-destructive"
                          disabled={actingId === request.id}
                          onClick={() => {
                            setRejectTarget(request)
                            setRejectReason("")
                          }}
                        >
                          رفض
                        </AppButton>
                      </div>
                    ) : request.status === "rejected" && request.rejectionReason ? (
                      <span className="text-xs text-muted-foreground">
                        {request.rejectionReason}
                      </span>
                    ) : null}
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {!loading && visibleRequests.length === 0 ? (
          <AppTableEmpty
            title="لا توجد طلبات"
            description="لا توجد طلبات اشتراك مطابقة للفلتر الحالي."
          />
        ) : null}
      </AppCard>

      <AppDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null)
            setRejectReason("")
          }
        }}
        title={
          <span dir="rtl">
            رفض طلب {rejectTarget ? APPLICATION_LABEL[rejectTarget.application] : ""}
          </span>
        }
        description={
          <span dir="rtl">
            اكتب سبب رفض طلب {rejectTarget?.organizationName} -- سيتمكن العميل من رؤية هذا السبب.
          </span>
        }
        contentClassName="[direction:rtl] max-w-[30rem] p-6"
        footer={
          <div className="flex w-full gap-2">
            <AppButton
              variant="outline"
              className="h-12 flex-1 rounded-[10px] text-[14px] font-semibold"
              onClick={() => setRejectTarget(null)}
            >
              إلغاء
            </AppButton>
            <AppButton
              variant="destructive"
              className="h-12 flex-1 rounded-[10px] text-[14px] font-bold"
              loading={actingId === rejectTarget?.id}
              onClick={handleReject}
            >
              تأكيد الرفض
            </AppButton>
          </div>
        }
      >
        <div dir="rtl">
          <AppTextarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="مثال: الإيصال غير واضح، يرجى إعادة الإرفاق."
            rows={4}
            className="rounded-[10px]"
          />
        </div>
      </AppDialog>
    </div>
  )
}
