"use client"

// The last step of a cashier exchange: what came back, what goes out, and the difference --
// taken from the customer, given back to them (by a payment method or on their balance), or
// nothing when it is the same price. See PosInvoicesService.createExchange on the backend.

import { useState } from "react"
import { useLocale } from "next-intl"
import { ArrowLeftRight, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/locales"
import type { PaymentKind } from "@/features/pos/services/pos-payment-methods.service"

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

const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#5b6b85]"
const BALANCE = "__customer_balance"

export type ExchangeSettlement =
  | { payments: Array<{ paymentMethodCode: string; amount: number }>; refund: null }
  | { payments: []; refund: { paymentMethodCode: string } | { toCustomerBalance: true } | null }

export function ExchangeSettleDialog({
  open,
  invoiceNumber,
  credit,
  newTotal,
  hasCustomer,
  methods,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  invoiceNumber: string
  // The returned items' value, and what the new items cost.
  credit: number
  newTotal: number
  // The original sale was to a known customer: the rest can be kept on their balance.
  hasCustomer: boolean
  methods: Array<{ code: string; name: string; kind: PaymentKind }>
  busy: boolean
  onConfirm: (settlement: ExchangeSettlement) => void
  onClose: () => void
}) {
  const locale = useLocale() as Locale
  const ar = locale === "ar"
  const tx = (arabic: string, english: string) => (ar ? arabic : english)
  const money = (value: number) => {
    const amount = new Intl.NumberFormat(ar ? "ar-SA-u-nu-latn" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
    return ar ? `${amount} ر.س` : `SAR ${amount}`
  }

  const difference = Math.round((newTotal - credit) * 100) / 100
  const owes = difference > 0.004
  const owed = difference < -0.004
  // Money methods only: a balance or deferred method is not how a difference is settled here.
  const usable = methods.filter((method) => method.kind !== "credit" && method.kind !== "prepaid")
  const [picked, setPicked] = useState<string>("")
  const [received, setReceived] = useState("")

  // Cash is picked first (once the methods have loaded) until the cashier picks another. The
  // dialog is mounted afresh each time it opens, so nothing carries over.
  const defaultCode = usable.find((method) => method.kind === "cash")?.code ?? usable[0]?.code ?? ""

  const chosen = picked || defaultCode
  const setChosen = setPicked
  const chosenMethod = usable.find((method) => method.code === chosen)
  const receivedAmount = Number(received) || 0
  const change =
    owes && chosenMethod?.kind === "cash" && receivedAmount > difference
      ? Math.round((receivedAmount - difference) * 100) / 100
      : 0

  function confirm() {
    if (owes) {
      if (!chosen) return
      onConfirm({ payments: [{ paymentMethodCode: chosen, amount: difference }], refund: null })
    } else if (owed) {
      if (!chosen) return
      onConfirm({
        payments: [],
        refund: chosen === BALANCE ? { toCustomerBalance: true } : { paymentMethodCode: chosen },
      })
    } else {
      onConfirm({ payments: [], refund: null })
    }
  }

  const tiles = [
    ...usable.map((method) => ({ code: method.code, name: method.name })),
    ...(owed && hasCustomer
      ? [{ code: BALANCE, name: tx("رصيد العميل", "Customer balance") }]
      : []),
  ]

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className={cn("sm:max-w-[30rem]", ar ? "[direction:rtl]" : "[direction:ltr]")}>
        <DialogHeader className="text-right">
          <DialogTitle
            className={cn("flex items-center gap-2 text-[15px] font-extrabold", HEADING)}
          >
            <ArrowLeftRight className="size-4" />
            {tx("إتمام الاستبدال", "Complete the exchange")}
          </DialogTitle>
          <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
            {tx(`من الفاتورة ${invoiceNumber}`, `From invoice ${invoiceNumber}`)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-[12px] bg-[#f4f7fc] p-3 text-[13px]">
          <div className="flex justify-between">
            <span className={MUTED}>{tx("قيمة المرتجع", "Coming back")}</span>
            <span className={cn("font-bold", HEADING)}>{money(credit)}</span>
          </div>
          <div className="flex justify-between">
            <span className={MUTED}>{tx("قيمة المنتجات الجديدة", "New items")}</span>
            <span className={cn("font-bold", HEADING)}>{money(newTotal)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-[#e1e7f0] pt-2 text-[15px] font-extrabold">
            <span className={HEADING}>
              {owes
                ? tx("المطلوب من العميل", "Customer pays")
                : owed
                  ? tx("للعميل", "Back to the customer")
                  : tx("لا يوجد فرق", "No difference")}
            </span>
            <span className={owes ? "text-[#2563eb]" : owed ? "text-[#16a34a]" : HEADING}>
              {money(Math.abs(difference))}
            </span>
          </div>
        </div>

        {owes || owed ? (
          <div className="flex flex-col gap-2">
            <p className={cn("text-[12px] font-semibold", HEADING)}>
              {owes ? tx("طريقة الدفع", "Paid by") : tx("كيف يرجع المبلغ؟", "Give it back by")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tiles.map((tile) => (
                <button
                  key={tile.code}
                  type="button"
                  onClick={() => setChosen(tile.code)}
                  className={cn(
                    "rounded-[10px] border px-3 py-2.5 text-[12.5px] font-bold transition-colors",
                    chosen === tile.code
                      ? "border-black bg-black text-white"
                      : "border-[#e5e9f0] bg-white text-[#0d1b3e]"
                  )}
                >
                  {tile.name}
                </button>
              ))}
            </div>
            {owes && chosenMethod?.kind === "cash" ? (
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={received}
                  onChange={(event) => setReceived(event.target.value)}
                  placeholder={tx("المبلغ المستلم (اختياري)", "Cash received (optional)")}
                  className="h-10 rounded-[8px] border-[#e8edf3] text-[13px]"
                />
                {change > 0 ? (
                  <span className="shrink-0 text-[12.5px] font-bold text-[#16a34a]">
                    {tx(`الباقي ${money(change)}`, `Change ${money(change)}`)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className={cn("text-center text-[12.5px]", MUTED)}>
            {tx("نفس السعر: لا يُدفع ولا يُرجع شيء.", "Same price: nothing to pay or give back.")}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            className="h-11 gap-2 rounded-[10px] bg-black px-6 text-[13px] font-semibold text-white hover:bg-[#1a1a1a]"
            disabled={busy || ((owes || owed) && !chosen)}
            onClick={confirm}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {tx("تأكيد الاستبدال", "Confirm exchange")}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85]"
            disabled={busy}
            onClick={onClose}
          >
            {tx("رجوع", "Back")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
