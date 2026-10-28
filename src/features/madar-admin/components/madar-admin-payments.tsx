"use client"

import { useCallback, useState } from "react"
import { CalendarRange, CircleX, HandCoins, Receipt, Wallet } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppInput,
  AppSearchInput,
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
  AppTablePagination,
  AppTableRow,
} from "@/components/app"

import { useAdminPagedList } from "../hooks"
import {
  APPLICATION_LABEL,
  BILLING_INTERVAL_LABEL,
  formatDate,
  formatSar,
  paymentMethodLabel,
  platformAdminService,
} from "../services"
import type { AdminPayment, AdminPaymentFilters } from "../types/platform-admin.types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { ReceiptDialog } from "./receipt-dialog"

import type { PurchasableApplication } from "@/application/contracts"

const SELECT_TRIGGER_CLASSNAME = "h-10 w-[150px] rounded-[10px] text-sm"
const INITIAL_FILTERS: AdminPaymentFilters = {
  search: "",
  status: "all",
  method: "all",
  application: "all",
  from: "",
  to: "",
}

const STATUS_META: Record<AdminPayment["status"], { label: string; className: string }> = {
  paid: { label: "ناجحة", className: "bg-emerald-50 text-emerald-600" },
  failed: { label: "فاشلة", className: "bg-rose-50 text-rose-600" },
  initiated: { label: "لم تكتمل", className: "bg-slate-100 text-slate-600" },
}

// Every payment across Madar's customers: card payments through Moyasar (including failed and
// unfinished ones) and approved bank transfers, each linked to its receipt once paid.
export function MadarAdminPayments() {
  const onError = useCallback((message: string) => toast.error(message), [])
  const list = useAdminPagedList({
    initialFilters: INITIAL_FILTERS,
    fetchPage: platformAdminService.listPayments,
    fetchSummary: platformAdminService.getPaymentSummary,
    onError,
  })
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const summary = list.summary
  const kpis: MadarAdminKpi[] = [
    {
      label: "إجمالي المحصّل",
      value: summary ? formatSar(summary.collectedHalalas) : "—",
      deltaPct: null,
      icon: Wallet,
      tone: "green",
    },
    {
      label: "المحصّل هذا الشهر",
      value: summary ? formatSar(summary.collectedThisMonthHalalas) : "—",
      deltaPct: null,
      icon: CalendarRange,
      tone: "blue",
    },
    {
      label: "مدفوعات ناجحة",
      value: String(summary?.paidCount ?? "—"),
      deltaPct: null,
      icon: HandCoins,
      tone: "violet",
    },
    {
      label: "مدفوعات فاشلة",
      value: String(summary?.failedCount ?? "—"),
      deltaPct: null,
      icon: CircleX,
      tone: "rose",
    },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">المدفوعات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          سجل مدفوعات جميع عملاء مدار -- بطاقات وتحويلات بنكية.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث باسم العميل أو رقم العملية أو الكوبون..."
          value={list.filters.search ?? ""}
          onChange={(event) => list.setFilter("search", event.target.value)}
          wrapperClassName="w-full sm:w-72"
          className="h-10 rounded-[10px]"
        />
        <AppSelect
          value={list.filters.method ?? "all"}
          onValueChange={(value) =>
            list.setFilter("method", value as AdminPaymentFilters["method"])
          }
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الطرق</AppSelectItem>
            <AppSelectItem value="card">بطاقة</AppSelectItem>
            <AppSelectItem value="bank_transfer">تحويل بنكي</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={list.filters.status ?? "all"}
          onValueChange={(value) =>
            list.setFilter("status", value as AdminPaymentFilters["status"])
          }
        >
          <AppSelectTrigger className={SELECT_TRIGGER_CLASSNAME}>
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع الحالات</AppSelectItem>
            <AppSelectItem value="paid">ناجحة</AppSelectItem>
            <AppSelectItem value="failed">فاشلة</AppSelectItem>
            <AppSelectItem value="initiated">لم تكتمل</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
        <AppSelect
          value={list.filters.application ?? "all"}
          onValueChange={(value) =>
            list.setFilter("application", value as AdminPaymentFilters["application"])
          }
        >
          <AppSelectTrigger className="h-10 w-[180px] rounded-[10px] text-sm">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="all">جميع التطبيقات</AppSelectItem>
            {(Object.keys(APPLICATION_LABEL) as PurchasableApplication[])
              .filter((key) => key !== "madarApps")
              .map((key) => (
                <AppSelectItem key={key} value={key}>
                  {APPLICATION_LABEL[key]}
                </AppSelectItem>
              ))}
          </AppSelectContent>
        </AppSelect>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <AppInput
            type="date"
            value={list.filters.from ?? ""}
            onChange={(event) => list.setFilter("from", event.target.value)}
            className="h-10 w-[150px] rounded-[10px]"
          />
          <span className="text-xs text-muted-foreground">إلى</span>
          <AppInput
            type="date"
            value={list.filters.to ?? ""}
            onChange={(event) => list.setFilter("to", event.target.value)}
            className="h-10 w-[150px] rounded-[10px]"
          />
        </div>
      </div>

      <AppCard
        state={list.loading ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>الاشتراك</AppTableHead>
              <AppTableHead>طريقة الدفع</AppTableHead>
              <AppTableHead>المبلغ</AppTableHead>
              <AppTableHead>الحالة</AppTableHead>
              <AppTableHead>التاريخ</AppTableHead>
              <AppTableHead className="w-28" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((payment) => {
              const status = STATUS_META[payment.status]
              return (
                <AppTableRow key={`${payment.method}:${payment.id}`}>
                  <AppTableCell className="font-medium text-foreground">
                    {payment.organizationName}
                  </AppTableCell>
                  <AppTableCell>
                    <p>{APPLICATION_LABEL[payment.application] ?? payment.application}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        payment.packageName,
                        payment.billingInterval
                          ? BILLING_INTERVAL_LABEL[payment.billingInterval]
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {payment.method === "bank_transfer"
                      ? "تحويل بنكي"
                      : paymentMethodLabel(payment.cardBrand ?? "بطاقة")}
                  </AppTableCell>
                  <AppTableCell>
                    <p className="font-semibold text-foreground">
                      {formatSar(payment.amountHalalas)}
                    </p>
                    {payment.discountHalalas ? (
                      <p className="text-xs text-emerald-600">
                        خصم {formatSar(payment.discountHalalas)}
                        {payment.couponCode ? ` · ${payment.couponCode}` : ""}
                      </p>
                    ) : null}
                  </AppTableCell>
                  <AppTableCell>
                    <AppStatusBadge
                      status="neutral"
                      label={status.label}
                      className={status.className}
                    />
                  </AppTableCell>
                  <AppTableCell className="text-muted-foreground">
                    {formatDate(payment.createdAt)}
                  </AppTableCell>
                  <AppTableCell>
                    {payment.receiptId ? (
                      <AppButton
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-[8px]"
                        icon={<Receipt className="size-3.5" />}
                        onClick={() => setReceiptId(payment.receiptId)}
                      >
                        الإيصال
                      </AppButton>
                    ) : null}
                  </AppTableCell>
                </AppTableRow>
              )
            })}
          </AppTableBody>
        </AppTable>

        {!list.loading && list.rows.length === 0 ? (
          <AppTableEmpty title="لا توجد مدفوعات مطابقة" description="جرّب تعديل الفلاتر." />
        ) : null}

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            عرض {list.rows.length} من {list.total} نتيجة
          </p>
          <AppTablePagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            previousLabel="السابق"
            nextLabel="التالي"
          />
        </div>
      </AppCard>

      <ReceiptDialog receiptId={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  )
}
