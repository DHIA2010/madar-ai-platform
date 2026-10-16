"use client"

// The close-shift dialog: a real cash summary computed from this shift's own invoices and cash
// movements, a numeric keypad for the counted amount, and a live surplus/shortage message.
// Shared between الورديات's own table (closing a shift from the list) and a single shift's
// detail page (closing the shift you are already looking at) -- one real implementation instead
// of two copies that could drift.

import { useEffect, useState } from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Delete,
  Loader2,
  Lock,
  RotateCcw,
  Wallet,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/locales"
import { posShiftsService, type Shift } from "@/features/pos/services/pos-shifts.service"
import { posInvoicesService } from "@/features/pos/services/pos-invoices.service"
import { posPaymentMethodsService } from "@/features/pos/services/pos-payment-methods.service"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatAmount(value: number, locale: Locale): string {
  return `${amountFormatter(locale).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`
}

interface CloseShiftSummary {
  cashSales: number
  otherSales: number
  cashReturns: number
  withdrawals: number
  deposits: number
}

export interface ShiftCloseDialogProps {
  // The shift to close; null keeps the dialog closed.
  shift: Shift | null
  onOpenChange: (open: boolean) => void
  onClosed: (updated: Shift) => void
}

export function ShiftCloseDialog({ shift, onOpenChange, onClosed }: ShiftCloseDialogProps) {
  const t = useTranslations("pos.shiftCloseDialog")
  const locale = useLocale() as Locale
  const [closingCashAmount, setClosingCashAmount] = useState("")
  const [closingNotes, setClosingNotes] = useState("")
  const [closing, setClosing] = useState(false)
  const [showCloseErrors, setShowCloseErrors] = useState(false)

  useEffect(() => {
    setClosingCashAmount("")
    setClosingNotes("")
    setShowCloseErrors(false)
  }, [shift?.id])

  // Real cash-in/cash-out for this shift, computed from the real invoices its cashier created in
  // this branch since it opened -- not stored on the shift itself, so it is fetched fresh each
  // time a shift is passed in.
  const [closeSummary, setCloseSummary] = useState<CloseShiftSummary | null>(null)
  const [loadingCloseSummary, setLoadingCloseSummary] = useState(false)

  useEffect(() => {
    if (!shift) {
      setCloseSummary(null)
      return
    }
    let cancelled = false
    setLoadingCloseSummary(true)
    void Promise.all([
      posInvoicesService.list({ workspaceId: shift.workspaceId, from: shift.openedAt }),
      posPaymentMethodsService.list(),
      posShiftsService.listCashMovements(shift.id),
    ])
      .then(([invoices, methods, movements]) => {
        if (cancelled) return
        const cashCodes = new Set(
          methods.filter((method) => method.kind === "cash").map((method) => method.code)
        )
        const mine = invoices.filter((invoice) => invoice.cashierUserId === shift.cashierUserId)
        const sum = (list: typeof mine) =>
          list.reduce((total, invoice) => total + invoice.totalAmount, 0)

        setCloseSummary({
          cashSales: sum(
            mine.filter(
              (invoice) =>
                invoice.status === "completed" && cashCodes.has(invoice.paymentMethodCode)
            )
          ),
          otherSales: sum(
            mine.filter(
              (invoice) =>
                invoice.status === "completed" && !cashCodes.has(invoice.paymentMethodCode)
            )
          ),
          cashReturns: sum(
            mine.filter(
              (invoice) => invoice.status === "returned" && cashCodes.has(invoice.paymentMethodCode)
            )
          ),
          withdrawals: movements
            .filter((movement) => movement.type === "withdrawal")
            .reduce((total, movement) => total + movement.amount, 0),
          deposits: movements
            .filter((movement) => movement.type === "deposit")
            .reduce((total, movement) => total + movement.amount, 0),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setCloseSummary({
            cashSales: 0,
            otherSales: 0,
            cashReturns: 0,
            withdrawals: 0,
            deposits: 0,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCloseSummary(false)
      })
    return () => {
      cancelled = true
    }
  }, [shift])

  const expectedCashAmount =
    shift && closeSummary
      ? shift.openingCashAmount +
        closeSummary.cashSales -
        closeSummary.cashReturns -
        closeSummary.withdrawals +
        closeSummary.deposits
      : null

  // Typing appends to the string like a calculator; a denomination button adds that bill's value
  // to whatever is already counted, matching how a cashier actually counts a drawer bill by bill.
  function appendDigit(digit: string) {
    setClosingCashAmount((current) => {
      if (digit === "." && current.includes(".")) return current
      if (current === "0" && digit !== ".") return digit
      return current + digit
    })
  }
  function backspaceDigit() {
    setClosingCashAmount((current) => current.slice(0, -1))
  }
  function addDenomination(value: number) {
    setClosingCashAmount((current) => String((Number(current) || 0) + value))
  }

  const closeErrors = {
    amount: closingCashAmount.trim() && Number(closingCashAmount) >= 0 ? null : t("invalidAmount"),
  }
  const isCloseFormValid = Object.values(closeErrors).every((error) => error === null)

  const submitCloseShift = async () => {
    if (!shift) return
    setShowCloseErrors(true)
    if (!isCloseFormValid) return

    setClosing(true)
    try {
      const updated = await posShiftsService.close(shift.id, {
        closingCashAmount: Number(closingCashAmount),
        closingNotes: closingNotes.trim() || null,
      })
      toast.success(t("toasts.closed"))
      onClosed(updated)
    } catch {
      toast.error(t("toasts.closeFailed"))
    } finally {
      setClosing(false)
    }
  }

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(open) => {
        if (!closing && !open) onOpenChange(false)
      }}
    >
      <DialogContent
        className={cn("sm:max-w-[44rem]", locale === "ar" ? "[direction:rtl]" : "[direction:ltr]")}
      >
        <DialogHeader className="text-right">
          {/* RTL: the lock badge is written first so it lands at the physical right (the
              dialog's own default close button stays at its usual spot, the left). */}
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fef2f2] text-[#dc2626]">
              <Lock className="size-5" />
            </span>
            <div className="flex-1">
              <DialogTitle className={cn("text-[16px] font-extrabold", HEADING)}>
                {t("title")}
              </DialogTitle>
              <DialogDescription className={cn("text-[12px]", MUTED)}>
                {t("description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* RTL: the summary is written first so it lands on the right, matching the reference;
              the amount-entry keypad lands on the left. */}
          <div className="order-2 flex flex-col gap-2 sm:order-1">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
                <BarChart3 className="size-4" />
              </span>
              <p className={cn("text-[13px] font-extrabold", HEADING)}>{t("summaryTitle")}</p>
            </div>

            {loadingCloseSummary ? (
              <div className={cn("flex items-center gap-2 py-6 text-[12px]", MUTED)}>
                <Loader2 className="size-3.5 animate-spin" />
                {t("computingSales")}
              </div>
            ) : (
              <>
                <SummaryRow
                  icon={Wallet}
                  iconClassName="text-[#5b6b85]"
                  label={t("openingBalance")}
                  value={shift?.openingCashAmount ?? 0}
                  locale={locale}
                />
                <SummaryRow
                  icon={Banknote}
                  iconClassName="text-[#16a34a]"
                  label={t("cashSales")}
                  value={closeSummary?.cashSales ?? 0}
                  locale={locale}
                />
                <SummaryRow
                  icon={CreditCard}
                  iconClassName="text-[#2563eb]"
                  label={t("otherSales")}
                  value={closeSummary?.otherSales ?? 0}
                  locale={locale}
                />
                <SummaryRow
                  icon={RotateCcw}
                  iconClassName="text-[#dc2626]"
                  label={t("returns")}
                  value={closeSummary?.cashReturns ?? 0}
                  negative
                  locale={locale}
                />
                <SummaryRow
                  icon={ArrowUpFromLine}
                  iconClassName="text-[#d97706]"
                  label={t("withdrawal")}
                  value={closeSummary?.withdrawals ?? 0}
                  negative
                  locale={locale}
                />
                <SummaryRow
                  icon={ArrowDownToLine}
                  iconClassName="text-[#0891b2]"
                  label={t("deposit")}
                  value={closeSummary?.deposits ?? 0}
                  locale={locale}
                />

                <div className="mt-1 flex items-center justify-between rounded-[12px] bg-[#eff6ff] px-3.5 py-3">
                  <span
                    className={cn("flex items-center gap-1.5 text-[12.5px] font-bold", HEADING)}
                  >
                    <Wallet className="size-4 text-[#2563eb]" />
                    {t("expectedInDrawer")}
                  </span>
                  <span className="text-[15px] font-extrabold text-[#2563eb]">
                    {formatAmount(expectedCashAmount ?? 0, locale)}
                  </span>
                </div>
                <p className={cn("text-[10.5px]", MUTED)}>{t("basedOnAllTransactions")}</p>

                {closingCashAmount.trim() && expectedCashAmount !== null ? (
                  <VarianceMessage
                    expected={expectedCashAmount}
                    counted={Number(closingCashAmount) || 0}
                  />
                ) : null}
              </>
            )}
          </div>

          <div dir="ltr" className="order-1 flex flex-col gap-3 sm:order-2">
            <Label
              className={cn("block text-right text-[12px] font-semibold", HEADING)}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              {t("countedAmountLabel")}
            </Label>
            <div className="flex h-14 items-center gap-2 rounded-[12px] border-2 border-[#2563eb] bg-white px-3">
              <span className={cn("flex-1 text-right text-[20px] font-extrabold", HEADING)}>
                {closingCashAmount || "0.00"}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-[8px] bg-[#f4f7fc] px-2 py-1 text-[12px] font-bold",
                  HEADING
                )}
              >
                {locale === "ar" ? "ر.س" : "SAR"}
              </span>
            </div>
            {showCloseErrors && closeErrors.amount ? (
              <p
                className="text-right text-[10.5px] text-[#e0484d]"
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                {closeErrors.amount}
              </p>
            ) : null}

            <div className="grid grid-cols-4 gap-2">
              {[50, 100, 200, 500].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => addDenomination(value)}
                  className="flex h-9 items-center justify-center rounded-[8px] bg-[#eff6ff] text-[12.5px] font-bold text-[#2563eb] hover:bg-[#dbeafe]"
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => appendDigit(key)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[16px] font-bold hover:bg-[#f7faff]",
                    HEADING
                  )}
                >
                  {key}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendDigit(".")}
                className={cn(
                  "flex h-11 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[16px] font-bold hover:bg-[#f7faff]",
                  HEADING
                )}
              >
                .
              </button>
              <button
                type="button"
                onClick={() => appendDigit("0")}
                className={cn(
                  "flex h-11 items-center justify-center rounded-[10px] border border-[#e8edf3] text-[16px] font-bold hover:bg-[#f7faff]",
                  HEADING
                )}
              >
                0
              </button>
              <button
                type="button"
                onClick={backspaceDigit}
                aria-label={t("deleteAriaLabel")}
                className="flex h-11 items-center justify-center rounded-[10px] bg-[#f4f7fc] text-[#5b6b85] hover:bg-[#eef2f8]"
              >
                <Delete className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <div>
          <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
            {t("notesLabel")}
          </Label>
          <Input
            value={closingNotes}
            onChange={(event) => setClosingNotes(event.target.value)}
            placeholder={t("notesPlaceholder")}
            className={FIELD_CLASS}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={closing}
            onClick={() => void submitCloseShift()}
          >
            <Lock className="size-4" />
            {closing ? t("closing") : t("confirmClose")}
            {closing ? <Loader2 className="size-4 animate-spin" /> : null}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
            disabled={closing}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({
  icon: Icon,
  iconClassName,
  label,
  value,
  negative = false,
  locale,
}: {
  icon: typeof Wallet
  iconClassName?: string
  label: string
  value: number
  negative?: boolean
  locale: Locale
}) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className={cn("flex items-center gap-1.5 font-semibold", HEADING)}>
        <Icon className={cn("size-3.5", iconClassName)} />
        {label}
      </span>
      <span className={cn("font-bold", HEADING)}>
        {negative && value > 0 ? "-" : ""}
        {formatAmount(value, locale)}
      </span>
    </div>
  )
}

// Live comparison between what the drawer should hold and what was actually counted -- only
// shown once a count has been typed in, so an empty field never reads as "already short by the
// full expected amount."
function VarianceMessage({ expected, counted }: { expected: number; counted: number }) {
  const t = useTranslations("pos.shiftCloseDialog")
  const locale = useLocale() as Locale
  const variance = Math.round((counted - expected) * 100) / 100

  if (variance === 0) {
    return (
      <p className="flex items-center gap-1.5 rounded-[10px] bg-[#f0fdf4] px-3 py-2 text-[12px] font-semibold text-[#15803d]">
        <CheckCircle2 className="size-4" />
        {t("variance.matches")}
      </p>
    )
  }

  const isSurplus = variance > 0
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold",
        isSurplus ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#fef2f2] text-[#dc2626]"
      )}
    >
      {isSurplus ? <ArrowDownToLine className="size-4" /> : <ArrowUpFromLine className="size-4" />}
      {t(isSurplus ? "variance.surplus" : "variance.shortage", {
        amount: formatAmount(Math.abs(variance), locale),
      })}
    </p>
  )
}
