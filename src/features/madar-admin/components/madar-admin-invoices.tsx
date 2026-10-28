"use client"

import { useCallback, useState } from "react"
import { Eye } from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppCard,
  AppSearchInput,
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
import { ReceiptDialog } from "./receipt-dialog"

const INITIAL_FILTERS: { search?: string } = { search: "" }
// Receipts have no separate summary -- the payments page carries the totals.
const noSummary = async () => null

// Every receipt Madar has issued -- one per successful payment, numbered in payment order.
export function MadarAdminInvoices() {
  const onError = useCallback((message: string) => toast.error(message), [])
  const list = useAdminPagedList({
    initialFilters: INITIAL_FILTERS,
    fetchPage: platformAdminService.listReceipts,
    fetchSummary: noSummary,
    onError,
  })
  const [receiptId, setReceiptId] = useState<string | null>(null)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">الفواتير والإيصالات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إيصال دفع مرقّم لكل عملية ناجحة -- بطاقة أو تحويل بنكي -- قابل للطباعة والحفظ PDF.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <AppSearchInput
          placeholder="البحث برقم الإيصال أو اسم العميل..."
          value={list.filters.search ?? ""}
          onChange={(event) => list.setFilter("search", event.target.value)}
          wrapperClassName="w-full sm:w-80"
          className="h-10 rounded-[10px]"
        />
      </div>

      <AppCard
        state={list.loading ? "loading" : "idle"}
        className="overflow-hidden rounded-2xl border-border/60 p-0 shadow-sm"
      >
        <AppTable>
          <AppTableHeader>
            <AppTableRow>
              <AppTableHead>رقم الإيصال</AppTableHead>
              <AppTableHead>العميل</AppTableHead>
              <AppTableHead>الاشتراك</AppTableHead>
              <AppTableHead>طريقة الدفع</AppTableHead>
              <AppTableHead>المبلغ</AppTableHead>
              <AppTableHead>تاريخ الدفع</AppTableHead>
              <AppTableHead className="w-24" />
            </AppTableRow>
          </AppTableHeader>
          <AppTableBody>
            {list.rows.map((receipt) => (
              <AppTableRow key={receipt.id}>
                <AppTableCell className="font-mono font-semibold text-primary" dir="ltr">
                  {receipt.number}
                </AppTableCell>
                <AppTableCell>
                  <p className="font-medium text-foreground">{receipt.customer.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {receipt.customer.email ?? ""}
                  </p>
                </AppTableCell>
                <AppTableCell>
                  <p>{APPLICATION_LABEL[receipt.application] ?? receipt.application}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      receipt.packageName,
                      receipt.billingInterval
                        ? BILLING_INTERVAL_LABEL[receipt.billingInterval]
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {paymentMethodLabel(receipt.paymentMethod)}
                </AppTableCell>
                <AppTableCell className="font-semibold text-foreground">
                  {formatSar(receipt.amountHalalas)}
                </AppTableCell>
                <AppTableCell className="text-muted-foreground">
                  {formatDate(receipt.paidAt)}
                </AppTableCell>
                <AppTableCell>
                  <AppButton
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-[8px]"
                    icon={<Eye className="size-3.5" />}
                    onClick={() => setReceiptId(receipt.id)}
                  >
                    عرض
                  </AppButton>
                </AppTableCell>
              </AppTableRow>
            ))}
          </AppTableBody>
        </AppTable>

        {!list.loading && list.rows.length === 0 ? (
          <AppTableEmpty
            title="لا توجد إيصالات بعد"
            description="يُصدر إيصال تلقائياً لكل عملية دفع ناجحة."
          />
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
