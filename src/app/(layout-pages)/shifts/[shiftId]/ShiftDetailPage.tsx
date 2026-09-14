"use client"

// الوردية -- a single shift's own detail page: real sales split by the real payment method used,
// the same real cash summary the close dialog computes, and a chronological log of the only real
// cash-affecting events (open, withdrawal, deposit, close). Everything here comes from one
// backend call (GET /v1/pos/shifts/:id/detail) that does this exact aggregation server-side, so
// this page and the close dialog can never disagree about the numbers.

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  FileText,
  Home,
  Loader2,
  Lock,
  PiggyBank,
  Printer,
  Repeat,
  RotateCcw,
  Store,
  UserRound,
  Wallet,
  XCircle,
} from "lucide-react"
import Link from "next/link"

import { AppError } from "@/lib/errors/app-error"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { useWorkspace } from "@/features/workspace"
import { useUsersQuery } from "@/features/administration/queries/use-users-query"
import { useApplicationServices } from "@/application/context"
import {
  posShiftsService,
  type CashMovementType,
  type PaymentBreakdownEntry,
  type ShiftActivityType,
  type ShiftDetail,
} from "@/features/pos/services/pos-shifts.service"
import type { PaymentKind } from "@/features/pos/services/pos-payment-methods.service"

import { Button } from "@/components/ui/button"
import { CashMovementDialog } from "../CashMovementDialog"
import { ShiftCloseDialog } from "../ShiftCloseDialog"

const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"

const AMOUNT_FORMAT = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function formatAmount(value: number): string {
  return `${AMOUNT_FORMAT.format(value)} ر.س`
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})
function formatDateTime(value: string | null): string {
  return value ? DATE_TIME_FORMAT.format(new Date(value)) : "—"
}

const PAYMENT_KIND_ICON: Record<PaymentKind, typeof Wallet> = {
  cash: Banknote,
  card: CreditCard,
  wallet: Wallet,
  transfer: Repeat,
  bnpl: CreditCard,
  credit: UserRound,
  prepaid: PiggyBank,
}

const ACTIVITY_META: Record<ShiftActivityType, { label: string; tint: string }> = {
  open: { label: "افتتاح", tint: "bg-[#f0fdf4] text-[#15803d]" },
  close: { label: "إغلاق الوردية", tint: "bg-[#eff6ff] text-[#2563eb]" },
  withdrawal: { label: "سحب من الصندوق", tint: "bg-[#fffbeb] text-[#92400e]" },
  deposit: { label: "إيداع في الصندوق", tint: "bg-[#ecfeff] text-[#0e7490]" },
  sale: { label: "عملية بيع", tint: "bg-[#eff6ff] text-[#2563eb]" },
  return: { label: "مرتجع", tint: "bg-[#fef2f2] text-[#dc2626]" },
}

export default function ShiftDetailPage({ shiftId }: { shiftId: string }) {
  const { currentOrganization, availableWorkspaces } = useWorkspace()
  const { administrationApplicationService } = useApplicationServices()
  const { data: usersData } = useUsersQuery(
    administrationApplicationService,
    currentOrganization?.id
  )
  const employees = useMemo(() => usersData ?? [], [usersData])

  const workspaceName = useMemo(() => {
    const map = new Map(availableWorkspaces.map((workspace) => [workspace.id, workspace.name]))
    return (id: string) => map.get(id) ?? "—"
  }, [availableWorkspaces])
  const cashierName = useMemo(() => {
    const map = new Map(employees.map((employee) => [employee.id, employee.fullName]))
    return (id: string) => map.get(id) ?? "—"
  }, [employees])

  const [detail, setDetail] = useState<ShiftDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setDetail(await posShiftsService.getDetail(shiftId))
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(
        status === 404
          ? "الوردية غير موجودة."
          : status === 403
            ? "لا تملك صلاحية عرض الورديات."
            : "تعذر تحميل بيانات الوردية."
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId])

  const [isCloseOpen, setIsCloseOpen] = useState(false)
  const [isCashMovementOpen, setIsCashMovementOpen] = useState(false)
  const [cashMovementType, setCashMovementType] = useState<CashMovementType>("withdrawal")

  if (loading) {
    return (
      <div dir="rtl" className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل الوردية...
      </div>
    )
  }

  if (loadError || !detail) {
    return (
      <div dir="rtl" className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}>
        <p className={cn("text-[13px]", HEADING)}>{loadError ?? "تعذر تحميل الوردية."}</p>
        <Button variant="outline" onClick={() => void load()}>
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  const { shift, cashSummary, paymentBreakdown, activity } = detail
  const isOpen = shift.status === "open"

  // Only meaningful once a real count exists to compare against -- an open shift has no closing
  // amount yet, so there is nothing to call "matched" or "short" before that.
  const variance =
    !isOpen && shift.closingCashAmount !== null
      ? Math.round((shift.closingCashAmount - cashSummary.expectedCashAmount) * 100) / 100
      : null

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-10">
      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.shifts} className="transition-colors hover:text-[#2563eb]">
          الورديات
        </Link>
        <span>/</span>
        <span className={cn("flex items-center gap-1 font-semibold", HEADING)}>
          <Home className="size-3.5" />
          الوردية
        </span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>الوردية</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>إدارة الوردية ومتابعة المبيعات والصندوق.</p>
        </div>
      </div>

      {/* Status strip. RTL: written in the reverse of how it reads on screen -- the shift
          number/branch is written first so it lands at the far right, the open-shift badge
          written last so it lands at the far left, matching the reference exactly. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8edf3] bg-white px-4 py-3">
        <span className={cn("flex items-center gap-2.5 border-l border-[#eef2f8] pl-3", HEADING)}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
            <Store className="size-4" />
          </span>
          <span className="flex flex-col">
            <span className={cn("text-[11px]", MUTED)}>الوردية الحالية</span>
            <span className="text-[14px] font-extrabold">
              {shift.shiftNumber !== null ? `#${shift.shiftNumber}` : "—"}
            </span>
            <span className={cn("text-[10.5px]", MUTED)}>{workspaceName(shift.workspaceId)}</span>
          </span>
        </span>

        <span className={cn("flex flex-col gap-1 border-l border-[#eef2f8] pl-3", HEADING)}>
          <span className={cn("text-[11px]", MUTED)}>وقت الفتح</span>
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
            <Clock className="size-3.5 text-[#16a34a]" />
            {formatDateTime(shift.openedAt)}
          </span>
        </span>

        <span className={cn("flex flex-col gap-1 border-l border-[#eef2f8] pl-3", HEADING)}>
          <span className={cn("text-[11px]", MUTED)}>وقت الإغلاق</span>
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
            <Lock className="size-3.5 text-[#dc2626]" />
            {formatDateTime(shift.closedAt)}
          </span>
        </span>

        <span className={cn("flex flex-col gap-1 border-l border-[#eef2f8] pl-3", HEADING)}>
          <span className={cn("text-[11px]", MUTED)}>عدد الفواتير</span>
          <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
            <Eye className="size-3.5 text-[#8098b4]" />
            {detail.invoiceCount}
          </span>
        </span>

        <span
          className={cn(
            "flex flex-col gap-1 rounded-2xl px-3 py-1.5",
            isOpen ? "bg-[#f0fdf4]" : "bg-[#f2f5fa]"
          )}
        >
          <span
            className={cn(
              "flex items-center gap-1.5 text-[12px] font-bold",
              isOpen ? "text-[#15803d]" : "text-[#5b6b85]"
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", isOpen ? "bg-[#22c55e]" : "bg-[#8098b4]")}
            />
            {isOpen ? "وردية مفتوحة" : "وردية مغلقة"}
          </span>
          <span className={cn("text-[10.5px]", MUTED)}>
            منذ {formatDateTime(isOpen ? shift.openedAt : shift.closedAt)}
          </span>
        </span>
      </div>

      {/* While open: the live running total, with real actions to adjust it. Once closed: the
          shift's starting float and how the final count compared to what was expected --
          there is nothing "live" left to act on once a shift is settled. */}
      <div className={cn(PANEL, "flex items-center justify-between gap-3 px-4 py-3")}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
            <Wallet className="size-4" />
          </span>
          <div>
            <p className={cn("text-[11px]", MUTED)}>
              {isOpen ? "المبلغ الحالي في الصندوق" : "المبلغ المبدئي في الصندوق"}
            </p>
            <p className={cn("text-[15px] font-extrabold", HEADING)}>
              {formatAmount(isOpen ? cashSummary.expectedCashAmount : shift.openingCashAmount)}
            </p>
          </div>
        </div>

        {isOpen ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-[10px] border-[#e8edf3] px-3.5 text-[12px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
              onClick={() => {
                setCashMovementType("withdrawal")
                setIsCashMovementOpen(true)
              }}
            >
              <ArrowUpFromLine className="size-3.5" />
              سحب
            </Button>
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-[10px] border-[#e8edf3] px-3.5 text-[12px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
              onClick={() => {
                setCashMovementType("deposit")
                setIsCashMovementOpen(true)
              }}
            >
              <ArrowDownToLine className="size-3.5" />
              إيداع
            </Button>
          </div>
        ) : variance !== null ? (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold",
              variance >= 0 ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fef2f2] text-[#dc2626]"
            )}
          >
            {variance === 0 ? <CheckCircle2 className="size-4" /> : null}
            {variance === 0
              ? "مطابق"
              : variance > 0
                ? `زيادة ${formatAmount(Math.abs(variance))}`
                : `عجز ${formatAmount(Math.abs(variance))}`}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* RTL: cash summary is written first so it lands on the right; payment breakdown lands
            on the left -- matching the reference. */}
        <section className={cn(PANEL, "p-5")}>
          <div className="mb-3 flex items-center gap-1.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <Wallet className="size-4" />
            </span>
            <h2 className={cn("text-[14px] font-extrabold", HEADING)}>ملخص الصندوق النقدي</h2>
          </div>

          <div className="flex flex-col gap-2.5">
            <CashRow
              icon={Wallet}
              iconClassName="text-[#5b6b85]"
              label="رصيد الافتتاح"
              value={cashSummary.openingCashAmount}
            />
            <CashRow
              icon={Banknote}
              iconClassName="text-[#16a34a]"
              label="مبيعات نقدية"
              value={cashSummary.cashSales}
            />
            <CashRow
              icon={RotateCcw}
              iconClassName="text-[#dc2626]"
              label="مرتجعات نقدية"
              value={cashSummary.cashReturns}
              negative
            />
            <CashRow
              icon={FileText}
              iconClassName="text-[#d97706]"
              label="سحب من الصندوق"
              value={cashSummary.withdrawals}
              negative
            />
            <CashRow
              icon={FileText}
              iconClassName="text-[#0891b2]"
              label="إيداع في الصندوق"
              value={cashSummary.deposits}
            />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-[12px] bg-[#eff6ff] px-3.5 py-3">
            <span className={cn("text-[13px] font-bold", HEADING)}>المتوقع في الدرج</span>
            <span className="text-[16px] font-extrabold text-[#2563eb]">
              {formatAmount(cashSummary.expectedCashAmount)}
            </span>
          </div>
        </section>

        <section className={cn(PANEL, "p-5")}>
          <div className="mb-3 flex items-center gap-1.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
              <CreditCard className="size-4" />
            </span>
            <h2 className={cn("text-[14px] font-extrabold", HEADING)}>
              مبيعات الوردية حسب طريقة الدفع
            </h2>
          </div>

          {paymentBreakdown.length === 0 ? (
            <p className={cn("py-6 text-center text-[12px]", MUTED)}>
              لا توجد مبيعات في هذه الوردية بعد.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {paymentBreakdown.map((entry) => (
                <PaymentBreakdownRow key={entry.code} entry={entry} />
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between rounded-[12px] bg-[#eff6ff] px-3.5 py-3">
            <span className={cn("text-[13px] font-bold", HEADING)}>المبيعات الإجمالية</span>
            <span className="text-[16px] font-extrabold text-[#2563eb]">
              {formatAmount(detail.totalSales)}
            </span>
          </div>
        </section>
      </div>

      {/* Activity log */}
      <section className={cn(PANEL, "p-5")}>
        <div className="mb-3 flex items-center gap-1.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
            <CalendarClock className="size-4" />
          </span>
          <h2 className={cn("text-[14px] font-extrabold", HEADING)}>حركة الصندوق</h2>
        </div>

        {activity.length === 0 ? (
          <p className={cn("py-6 text-center text-[12px]", MUTED)}>لا توجد حركات مسجلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-center">
              <thead>
                <tr>
                  {[
                    { key: "amount", label: "المبلغ" },
                    { key: "note", label: "الملاحظة" },
                    { key: "cashier", label: "الكاشير" },
                    { key: "reference", label: "المرجع" },
                    { key: "type", label: "النوع" },
                    { key: "time", label: "الوقت", align: "text-right" },
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
                {activity.map((entry, index) => {
                  const meta = ACTIVITY_META[entry.type]
                  return (
                    <tr
                      key={`${entry.type}-${entry.occurredAt}-${index}`}
                      className={cn(
                        "border-b border-[#f4f7fb] last:border-b-0",
                        index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                      )}
                    >
                      <td className={cn("px-3 py-3.5 text-[12px] font-bold", HEADING)}>
                        {formatAmount(entry.amount)}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>{entry.note ?? "-"}</td>
                      <td className={cn("px-3 py-3.5 text-[12px] font-semibold", HEADING)}>
                        {cashierName(shift.cashierUserId)}
                      </td>
                      <td className={cn("px-3 py-3.5 text-[11px] font-bold uppercase", MUTED)}>
                        {entry.reference}
                      </td>
                      <td className="px-3 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            meta.tint
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className={cn("px-3 py-3.5 text-right text-[12px]", MUTED)}>
                        {formatDateTime(entry.occurredAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RTL: written in reverse of reading order -- the close action is first in the DOM so it
          lands at the far right, print second so it lands at the far left, matching the
          reference (the same first-child-is-rightmost rule already fixed on the status strip). */}
      <div className="flex items-center gap-2.5">
        {isOpen ? (
          <Button
            className="h-11 gap-2 rounded-[12px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            onClick={() => setIsCloseOpen(true)}
          >
            <Lock className="size-4" />
            إغلاق الوردية
          </Button>
        ) : (
          <span className={cn("flex items-center gap-1.5 text-[12.5px] font-semibold", MUTED)}>
            <XCircle className="size-4" />
            تم إغلاق هذه الوردية
          </span>
        )}
        <Button
          variant="outline"
          className="h-11 gap-2 rounded-[12px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff]"
          onClick={() => window.print()}
        >
          <Printer className="size-4" />
          طباعة تقرير الوردية
        </Button>
      </div>

      <ShiftCloseDialog
        shift={isCloseOpen ? shift : null}
        onOpenChange={(open) => setIsCloseOpen(open)}
        onClosed={() => {
          setIsCloseOpen(false)
          void load()
        }}
      />

      <CashMovementDialog
        shiftId={isCashMovementOpen ? shift.id : null}
        initialType={cashMovementType}
        onOpenChange={setIsCashMovementOpen}
        onRecorded={() => {
          setIsCashMovementOpen(false)
          void load()
        }}
      />
    </div>
  )
}

function CashRow({
  icon: Icon,
  iconClassName,
  label,
  value,
  negative = false,
}: {
  icon: typeof Wallet
  iconClassName?: string
  label: string
  value: number
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className={cn("flex items-center gap-1.5 font-semibold", HEADING)}>
        <Icon className={cn("size-3.5", iconClassName)} />
        {label}
      </span>
      <span className={cn("font-bold", HEADING)}>
        {negative && value > 0 ? "-" : ""}
        {formatAmount(value)}
      </span>
    </div>
  )
}

function PaymentBreakdownRow({ entry }: { entry: PaymentBreakdownEntry }) {
  const Icon = entry.kind ? PAYMENT_KIND_ICON[entry.kind] : CreditCard
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className={cn("flex items-center gap-1.5 font-semibold", HEADING)}>
          <span className="flex size-6 items-center justify-center rounded-md bg-[#f4f7fc] text-[#2563eb]">
            <Icon className="size-3.5" />
          </span>
          {entry.name}
        </span>
        <span className={cn("flex items-center gap-2", HEADING)}>
          <span className={MUTED}>{entry.percentage}%</span>
          <span className="font-bold">{formatAmount(entry.amount)}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#f1f4f9]">
        <div
          className="h-full rounded-full bg-[#2563eb]"
          style={{ width: `${Math.min(100, entry.percentage)}%` }}
        />
      </div>
    </div>
  )
}
