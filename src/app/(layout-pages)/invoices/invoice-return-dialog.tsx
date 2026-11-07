"use client"

// The itemized return (إشعار دائن) -- per-line quantities, the refund method(s) and a note -- shared
// by the invoices page and the cashier, so a return looks and works the same from both. See
// PosInvoicesService.createReturn() on the backend, which validates every requested quantity
// against what that line still has left.

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/locales"
import {
  type Invoice,
  type InvoiceReturn,
  posInvoicesService,
} from "@/features/pos/services/pos-invoices.service"

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
import { Textarea } from "@/components/ui/textarea"

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"

function formatAmount(value: number, locale: Locale): string {
  const amount = new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return locale === "ar" ? `${amount} ر.س` : `SAR ${amount}`
}

type ReturnPaymentMethod = { code: string; name: string; enabled?: boolean }

// The return's state and submit: open(invoice) starts one (every line at its full remaining
// quantity, refunded through the sale's own method -- so a full return is "open and submit"), and
// onReturned gets the created credit note to refresh and print.
export function useInvoiceReturn({
  paymentMethods,
  onReturned,
}: {
  paymentMethods: ReturnPaymentMethod[]
  onReturned: (created: InvoiceReturn) => void | Promise<void>
}) {
  const t = useTranslations("invoices")
  const locale = useLocale() as Locale
  const enabledMethods = useMemo(
    () => paymentMethods.filter((method) => method.enabled !== false),
    [paymentMethods]
  )
  const [target, setTarget] = useState<Invoice | null>(null)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  // One entry per method the refund goes back through -- a refund can be split, like a sale.
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // A live estimate from the same per-unit rate createReturn() prorates from; the backend
  // re-derives the real figure.
  const previewTotal = useMemo(() => {
    if (!target) return 0
    const raw = target.items.reduce((sum, item) => {
      const quantity = Math.trunc(Number(quantities[item.id]) || 0)
      if (quantity <= 0 || item.quantity <= 0) return sum
      return sum + ((item.netAmount + item.taxAmount) / item.quantity) * quantity
    }, 0)
    return Math.round(raw * 100) / 100
  }, [target, quantities])

  const paymentEntries = useMemo(
    () =>
      Object.entries(paymentAmounts)
        .map(([code, value]) => ({ code, amount: Math.round((Number(value) || 0) * 100) / 100 }))
        .filter((entry) => entry.amount > 0),
    [paymentAmounts]
  )

  function open(invoice: Invoice) {
    setTarget(invoice)
    const fullQuantities = Object.fromEntries(
      invoice.items
        .filter((item) => item.quantity - item.returnedQuantity > 0)
        .map((item) => [item.id, String(item.quantity - item.returnedQuantity)])
    )
    setQuantities(fullQuantities)
    setNotes("")
    const defaultCode =
      enabledMethods.find((method) => method.code === invoice.paymentMethodCode)?.code ??
      enabledMethods[0]?.code
    const total = invoice.items.reduce((sum, item) => {
      const quantity = Math.trunc(Number(fullQuantities[item.id]) || 0)
      if (quantity <= 0 || item.quantity <= 0) return sum
      return sum + ((item.netAmount + item.taxAmount) / item.quantity) * quantity
    }, 0)
    setPaymentAmounts(
      defaultCode ? { [defaultCode]: (Math.round(total * 100) / 100).toFixed(2) } : {}
    )
  }

  async function submit() {
    if (!target) return
    const items = target.items
      .map((item) => ({
        invoiceItemId: item.id,
        quantity: Math.trunc(Number(quantities[item.id]) || 0),
      }))
      .filter((entry) => entry.quantity > 0)
    if (items.length === 0) {
      toast.error(t("returnDialog.toasts.selectQuantity"))
      return
    }
    if (paymentEntries.length === 0) {
      toast.error(t("returnDialog.toasts.selectPaymentMethod"))
      return
    }
    const paymentTotal =
      Math.round(paymentEntries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100
    if (Math.abs(paymentTotal - previewTotal) > 0.01) {
      toast.error(
        t("returnDialog.toasts.amountMismatch", { amount: formatAmount(paymentTotal, locale) })
      )
      return
    }

    setSubmitting(true)
    try {
      const created = await posInvoicesService.createReturn(target.id, {
        items,
        payments: paymentEntries.map((entry) => ({
          paymentMethodCode: entry.code,
          amount: entry.amount,
        })),
        notes: notes.trim() || null,
      })
      toast.success(t("returnDialog.toasts.success", { number: created.returnNumber }))
      setTarget(null)
      await onReturned(created)
    } catch {
      toast.error(t("returnDialog.toasts.failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    open,
    dialogProps: {
      invoice: target,
      quantities,
      onQuantitiesChange: setQuantities,
      notes,
      onNotesChange: setNotes,
      paymentMethods: enabledMethods,
      paymentAmounts,
      onPaymentAmountsChange: setPaymentAmounts,
      previewTotal,
      submitting,
      onSubmit: () => void submit(),
      onClose: () => setTarget(null),
    },
  }
}

// A per-line quantity picker, not a single "return everything" click -- see createReturn() on
// the backend, which validates every requested quantity against what that specific line still
// actually has left (quantity - returnedQuantity), across however many separate return events
// have already touched it.
// One refund method tile -- tapping the card makes it the sole method for the whole return total
// (clearing any other tile), typing directly into the field builds a deliberate split across more
// than one. Same interaction CashierPage's own checkout payment tiles already use.
function ReturnPaymentTile({
  name,
  amount,
  selected,
  onAmountChange,
  onSelectFull,
}: {
  name: string
  amount: string
  selected: boolean
  onAmountChange: (value: string) => void
  onSelectFull: () => void
}) {
  const t = useTranslations("invoices")
  return (
    <div
      onClick={onSelectFull}
      className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-2 rounded-[12px] border bg-white p-3 transition-colors",
        selected ? "border-black" : "border-[#e5e9f0]"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-black bg-black" : "border-[#c7d2e0] bg-white"
          )}
        >
          {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className={cn("truncate text-[13px] font-bold", HEADING)}>{name}</span>
      </div>
      <div dir="ltr" className="relative">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          onClick={(event) => event.stopPropagation()}
          placeholder="0.00"
          className="h-10 rounded-[8px] border-[#e8edf3] pe-9 text-left text-[13px]"
        />
        <span className="pointer-events-none absolute inset-y-0 end-3 my-auto h-fit text-[11px] font-semibold text-[#8098b4]">
          {t("returnDialog.currencyUnit")}
        </span>
      </div>
    </div>
  )
}

export function ReturnDialog({
  invoice,
  quantities,
  onQuantitiesChange,
  notes,
  onNotesChange,
  paymentMethods,
  paymentAmounts,
  onPaymentAmountsChange,
  previewTotal,
  submitting,
  onSubmit,
  onClose,
}: {
  invoice: Invoice | null
  quantities: Record<string, string>
  onQuantitiesChange: (next: Record<string, string>) => void
  notes: string
  onNotesChange: (next: string) => void
  paymentMethods: Array<{ code: string; name: string }>
  paymentAmounts: Record<string, string>
  onPaymentAmountsChange: (next: Record<string, string>) => void
  previewTotal: number
  submitting: boolean
  onSubmit: () => void
  onClose: () => void
}) {
  const t = useTranslations("invoices")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const returnableItems = (invoice?.items ?? []).filter(
    (item) => item.quantity - item.returnedQuantity > 0
  )

  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col sm:max-w-[50rem]",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
      >
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            {t("returnDialog.title")}
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            {invoice ? t("returnDialog.description", { number: invoice.invoiceNumber }) : ""}
          </DialogDescription>
        </DialogHeader>

        {returnableItems.length === 0 ? (
          <p className={cn("py-6 text-center text-[12.5px]", MUTED)}>
            {t("returnDialog.noItemsLeft")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pe-1">
            {returnableItems.map((item) => {
              const remaining = item.quantity - item.returnedQuantity
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e8edf3] p-3"
                >
                  <div className="min-w-0">
                    <p className={cn("truncate text-[12.5px] font-semibold", HEADING)}>
                      {item.productName}
                    </p>
                    <p className="text-[11px] text-[#e0484d]">
                      {t("returnDialog.remainingLabel", { remaining, quantity: item.quantity })}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    step="1"
                    value={quantities[item.id] ?? ""}
                    onChange={(event) =>
                      onQuantitiesChange({ ...quantities, [item.id]: event.target.value })
                    }
                    placeholder="0"
                    className="h-10 w-20 rounded-[8px] border-[#e8edf3] text-center text-[13px]"
                  />
                </div>
              )
            })}

            <div className="flex items-center justify-between rounded-[10px] bg-[#f4f7fc] px-3 py-2.5">
              <span className={cn("text-[13px] font-extrabold", HEADING)}>
                {t("returnDialog.total")}
              </span>
              <span className={cn("text-[14px] font-extrabold", HEADING)}>
                {formatAmount(previewTotal, locale)}
              </span>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("returnDialog.refundMethodLabel")} <span className="text-[#e0484d]">*</span>
              </Label>
              <div className="grid grid-cols-3 gap-2.5">
                {paymentMethods.map((method) => (
                  <ReturnPaymentTile
                    key={method.code}
                    name={method.name}
                    amount={paymentAmounts[method.code] ?? ""}
                    selected={(Number(paymentAmounts[method.code]) || 0) > 0}
                    onAmountChange={(value) =>
                      onPaymentAmountsChange({ ...paymentAmounts, [method.code]: value })
                    }
                    onSelectFull={() =>
                      onPaymentAmountsChange({ [method.code]: previewTotal.toFixed(2) })
                    }
                  />
                ))}
              </div>
            </div>

            <div>
              <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
                {t("returnDialog.notesLabel")}
              </Label>
              <Textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                rows={2}
                placeholder={t("returnDialog.notesPlaceholder")}
                className="resize-none rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {returnableItems.length > 0 ? (
            <Button
              className="h-11 gap-2 rounded-[10px] bg-black px-6 text-[13px] font-semibold text-white hover:bg-[#1a1a1a]"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting ? t("returnDialog.submitting") : t("returnDialog.submit")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={submitting}
            onClick={onClose}
          >
            {tCommon("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
