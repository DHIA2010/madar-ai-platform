"use client"

// الفواتير المرتجعة -- every real return event (إشعار دائن / credit note) recorded through
// PosInvoicesService.createReturn(), listed on its own so a return stays findable as a document
// in its own right instead of only visible as a status badge buried in the main invoices table.
// Nothing here is ever deleted from /invoices -- the original sale stays listed there exactly as
// before (its status just reflects the return); this page only ever ADDS a second, focused view
// of the return events themselves.

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { ArrowRight, Loader2, Printer, Search, X } from "lucide-react"

import { AppError } from "@/lib/errors/app-error"
import { printThermalReceipt } from "@/lib/print-thermal-receipt"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { useWorkspace } from "@/features/workspace"
import {
  posInvoicesService,
  type InvoiceReturn,
} from "@/features/pos/services/pos-invoices.service"
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"
import { CreditNoteReceipt } from "@/app/(layout-pages)/pos/CreditNoteReceipt"

import { Input } from "@/components/ui/input"
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})
function formatDateTime(value: string): string {
  return DATE_TIME_FORMAT.format(new Date(value))
}

export default function ReturnedInvoicesPage() {
  const { availableWorkspaces, currentOrganization } = useWorkspace()

  const workspaceName = useMemo(() => {
    const map = new Map(availableWorkspaces.map((workspace) => [workspace.id, workspace.name]))
    return (id: string) => map.get(id) ?? "—"
  }, [availableWorkspaces])

  const [returns, setReturns] = useState<InvoiceReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [workspaceFilter, setWorkspaceFilter] = useState("all")
  const [search, setSearch] = useState("")

  const [paymentMethods, setPaymentMethods] = useState<Array<{ code: string; name: string }>>([])
  useEffect(() => {
    void posPaymentMethodsService
      .list()
      .then((methods) => setPaymentMethods(methods.map((m) => ({ code: m.code, name: m.name }))))
      .catch(() => {
        // The table just falls back to showing the raw code -- not worth blocking the page over.
      })
  }, [])
  const paymentMethodName = useMemo(() => {
    const map = new Map(paymentMethods.map((method) => [method.code, method.name]))
    return (code: string) => map.get(code) ?? code
  }, [paymentMethods])
  // A split refund shows every real method it actually used ("نقدي، شبكة"), not the backend's own
  // internal "split" sentinel code -- same reasoning as InvoicesPage.tsx's own paymentMethodLabel.
  function refundPaymentLabel(item: InvoiceReturn): string {
    if (item.payments.length > 1) {
      return item.payments.map((payment) => paymentMethodName(payment.paymentMethodCode)).join("، ")
    }
    return item.refundPaymentMethodCode ? paymentMethodName(item.refundPaymentMethodCode) : "—"
  }

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setReturns(
        await posInvoicesService.listReturns({
          workspaceId: workspaceFilter === "all" ? undefined : workspaceFilter,
        })
      )
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(
        status === 403
          ? "لا تملك صلاحية عرض الفواتير المرتجعة."
          : "تعذر تحميل الفواتير المرتجعة. حاول مرة أخرى."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceFilter])

  const filteredReturns = useMemo(() => {
    const query = search.trim()
    if (!query) return returns
    return returns.filter(
      (item) => item.returnNumber.includes(query) || item.invoiceNumber.includes(query)
    )
  }, [returns, search])

  const [selectedReturn, setSelectedReturn] = useState<InvoiceReturn | null>(null)

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link
              href={ROUTES.invoices}
              className={cn("flex items-center gap-1 text-[12px] font-semibold", MUTED)}
            >
              <ArrowRight className="size-3.5" />
              الفواتير
            </Link>
          </div>
          <h1 className={cn("text-[22px] font-extrabold", HEADING)}>الفواتير المرتجعة</h1>
          <p className={cn("mt-1 text-[12.5px]", MUTED)}>
            كل إشعار دائن صدر فعلياً -- الفاتورة الأصلية تبقى مدرجة في الفواتير كما هي.
          </p>
        </div>
      </div>

      <div className={cn("grid gap-5", selectedReturn ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "")}>
        <section className={cn(PANEL, "p-5")}>
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="البحث برقم الإشعار أو رقم الفاتورة..."
                className={cn(FIELD_CLASS, "ps-9")}
              />
            </div>
            <div className="w-full sm:w-[160px]">
              <AppSelect value={workspaceFilter} onValueChange={setWorkspaceFilter}>
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">جميع مساحات العمل</AppSelectItem>
                  {availableWorkspaces.map((workspace) => (
                    <AppSelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>

          {loading ? (
            <div className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل الفواتير المرتجعة...
            </div>
          ) : loadError ? (
            <p className={cn("p-8 text-center text-[13px]", MUTED)}>{loadError}</p>
          ) : filteredReturns.length === 0 ? (
            <div
              className={cn(
                "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
                MUTED
              )}
            >
              لا توجد فواتير مرتجعة مطابقة.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-center">
                <thead>
                  <tr>
                    {[
                      { key: "returnNumber", label: "رقم الإشعار", align: "text-right" },
                      { key: "invoiceNumber", label: "رقم الفاتورة الأصلية" },
                      { key: "date", label: "التاريخ والوقت" },
                      { key: "workspace", label: "مساحة العمل" },
                      { key: "items", label: "عدد الأصناف" },
                      { key: "quantity", label: "الكمية المرتجعة" },
                      { key: "paymentMethod", label: "طريقة الدفع" },
                      { key: "amount", label: "المبلغ" },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                          MUTED,
                          column.align ?? "text-center"
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredReturns.map((item, index) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedReturn(item)}
                      className={cn(
                        "cursor-pointer border-b border-[#f4f7fb] last:border-b-0 hover:bg-[#f7faff]",
                        selectedReturn?.id === item.id
                          ? "bg-[#eff6ff]"
                          : index % 2 === 0
                            ? "bg-white"
                            : "bg-[#fafbfd]"
                      )}
                    >
                      <td className={cn("px-3 py-3.5 text-right text-[12.5px] font-bold", HEADING)}>
                        {item.returnNumber}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                        {item.invoiceNumber}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                        {workspaceName(item.workspaceId)}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                        {item.items.length}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                        {item.items.reduce((sum, line) => sum + line.quantity, 0)}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", HEADING)}>
                        {refundPaymentLabel(item)}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px] font-semibold", HEADING)}>
                        {formatAmount(item.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedReturn ? (
          <section className={cn(PANEL, "flex h-fit flex-col gap-4 p-5")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={cn("text-[15px] font-extrabold", HEADING)}>
                  #{selectedReturn.returnNumber}
                </p>
                <p className={cn("mt-1 text-[11.5px]", MUTED)}>
                  إشعار دائن لفاتورة {selectedReturn.invoiceNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                aria-label="إغلاق"
                className="flex size-8 items-center justify-center rounded-lg text-[#8098b4] hover:bg-[#f2f5fa]"
              >
                <X className="size-4" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-y-2.5 text-[12px]">
              <dt className={MUTED}>التاريخ والوقت</dt>
              <dd className={cn("text-right font-semibold", HEADING)}>
                {formatDateTime(selectedReturn.createdAt)}
              </dd>
              <dt className={MUTED}>مساحة العمل</dt>
              <dd className={cn("text-right font-semibold", HEADING)}>
                {workspaceName(selectedReturn.workspaceId)}
              </dd>
              <dt className={MUTED}>طريقة الدفع</dt>
              <dd className={cn("text-right font-semibold", HEADING)}>
                {refundPaymentLabel(selectedReturn)}
              </dd>
            </dl>

            <div className="border-t border-[#eef2f8] pt-3">
              <p className={cn("mb-2 text-[12.5px] font-bold", HEADING)}>
                الأصناف المرتجعة ({selectedReturn.items.length})
              </p>
              <div className="flex flex-col gap-2.5">
                {selectedReturn.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-[12px]">
                    <div>
                      <p className={cn("font-semibold", HEADING)}>{item.productName}</p>
                      <p className={MUTED}>
                        {item.quantity} ×{" "}
                        {formatAmount(item.quantity > 0 ? item.netAmount / item.quantity : 0)}
                      </p>
                    </div>
                    <p className={cn("font-semibold", HEADING)}>
                      {formatAmount(item.netAmount + item.taxAmount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-[#eef2f8] pt-3 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className={MUTED}>المبلغ الخاضع للضريبة</span>
                <span className={HEADING}>{formatAmount(selectedReturn.subtotalAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={MUTED}>الخصم</span>
                <span className={HEADING}>-{formatAmount(selectedReturn.discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={MUTED}>ضريبة القيمة المضافة</span>
                <span className={HEADING}>{formatAmount(selectedReturn.taxAmount)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between rounded-[10px] bg-[#f4f7fc] px-3 py-2.5 text-[14px] font-extrabold">
                <span className={HEADING}>الإجمالي المرتجع</span>
                <span className="text-[#b45309]">{formatAmount(selectedReturn.totalAmount)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => printThermalReceipt("return-print-target")}
              className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#e8edf3] text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
            >
              <Printer className="size-4" />
              طباعة إشعار الدائن
            </button>
          </section>
        ) : null}
      </div>

      {/* Same hidden-portal print pattern InvoicesPage.tsx and CashierPage.tsx already use -- see
          either for why this has to be portaled straight to <body> rather than rendered in place. */}
      {selectedReturn &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="return-print-target" className="hidden print:block">
            <CreditNoteReceipt
              creditNote={selectedReturn}
              sellerLogoUrl={currentOrganization?.logoUrl ?? null}
              paymentMethodNames={Object.fromEntries(
                paymentMethods.map((method) => [method.code, method.name])
              )}
            />
          </div>,
          document.body
        )}
      <style>{`
        @media print {
          body > *:not(#return-print-target) { display: none !important; }
          #return-print-target { width: 72mm; }
        }
        /* The @page height is set dynamically by printThermalReceipt() right before printing --
           see src/lib/print-thermal-receipt.ts for why a fixed height doesn't work reliably. */
      `}</style>
    </div>
  )
}
