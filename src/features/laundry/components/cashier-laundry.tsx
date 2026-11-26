"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, Printer, Search, Shirt, Tag, Truck, Zap } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppDialog } from "@/components/app"

import {
  type LaundryOrder,
  type LaundryOrderSummary,
  laundryService,
} from "../services/laundry.service"
import { LaundryNewOrderForm } from "./new-order-page"
import { useLaundryPrinter } from "./print"
import {
  CHIP,
  errorText,
  FIELD,
  HEADING,
  MUTED,
  PANEL,
  PRIMARY,
  SECONDARY,
  StatusBadge,
  useTx,
} from "./shell"

type Tab = "new" | "handover"

// The cashier's laundry window (the Laundry plugin inside the POS screen): taking clothes in, and
// handing an order over with whatever is owed paid at the till -- in this cashier's shift, with
// the tax invoice printed like any sale.
export function CashierLaundryDialog({
  open,
  onOpenChange,
  shiftOpen,
  onInvoiced,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Money only moves with a shift open (the drawer must balance at closing).
  shiftOpen: boolean
  // An order was paid at hand-over: the cashier prints its tax invoice.
  onInvoiced: (invoiceNumber: string) => void
}) {
  const { tx } = useTx()
  const [tab, setTab] = useState<Tab>("handover")
  const [created, setCreated] = useState<LaundryOrder | null>(null)
  const [formKey, setFormKey] = useState(0)
  const printer = useLaundryPrinter()
  const noShift = shiftOpen
    ? null
    : tx("افتح وردية أولًا لاستلام المبالغ.", "Open a shift first to take payments.")

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Shirt className="size-4 text-[#2563eb]" />
          {tx("المغسلة", "Laundry")}
        </span>
      }
      contentClassName="max-w-[min(1120px,96vw)] [direction:rtl]"
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pe-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className={CHIP(tab === "handover")}
              onClick={() => setTab("handover")}
            >
              {tx("تسليم طلب", "Hand over")}
            </button>
            <button type="button" className={CHIP(tab === "new")} onClick={() => setTab("new")}>
              {tx("استلام ملابس", "Take clothes in")}
            </button>
          </div>
          <Link
            href={ROUTES.laundry}
            className="text-[12.5px] font-bold text-[#2563eb] hover:underline"
          >
            {tx("لوحة الطلبات", "Orders board")}
          </Link>
        </div>

        {tab === "new" ? (
          created ? (
            <div className={cn(PANEL, "flex flex-col items-center gap-3 p-8 text-center")}>
              <CheckCircle2 className="size-10 text-[#16a34a]" />
              <p className={cn("text-[16px] font-extrabold", HEADING)}>
                {tx("حُفظ الطلب", "Order saved")} {created.orderNumber}
              </p>
              <p className={cn("text-[13px]", MUTED)}>
                {created.pieces} {tx("قطعة", "pcs")} ·{" "}
                {created.paid
                  ? tx("مدفوع", "Paid")
                  : `${tx("المتبقي", "Due")} ${created.due.toFixed(2)}`}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => printer.print(created, "ticket")}
                >
                  <Printer className="size-4" />
                  {tx("إيصال العميل", "Customer ticket")}
                </button>
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => printer.print(created, "tags")}
                >
                  <Tag className="size-4" />
                  {tx("ملصقات القطع", "Piece tags")}
                </button>
                {created.invoiceNumber ? (
                  <button
                    type="button"
                    className={SECONDARY}
                    onClick={() => onInvoiced(created.invoiceNumber!)}
                  >
                    <Printer className="size-4" />
                    {tx("الفاتورة الضريبية", "Tax invoice")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={PRIMARY}
                  onClick={() => {
                    setCreated(null)
                    setFormKey((key) => key + 1)
                  }}
                >
                  {tx("طلب جديد", "New order")}
                </button>
              </div>
            </div>
          ) : (
            <LaundryNewOrderForm
              key={formKey}
              embedded
              disabledReason={noShift}
              onCreated={(order) => {
                setCreated(order)
                // Paid in full at drop-off: its tax invoice prints like a sale.
                if (order.invoiceNumber) onInvoiced(order.invoiceNumber)
                printer.print(order, "ticket")
              }}
            />
          )
        ) : (
          <HandOver shiftOpen={shiftOpen} onInvoiced={onInvoiced} />
        )}
      </div>
      {printer.node}
    </AppDialog>
  )
}

// Finding the order (by number, mobile or name; the ready ones first) and handing it over.
function HandOver({
  shiftOpen,
  onInvoiced,
}: {
  shiftOpen: boolean
  onInvoiced: (invoiceNumber: string) => void
}) {
  const { tx, ar, money, dateTime } = useTx()
  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<LaundryOrderSummary[] | null>(null)
  const [selected, setSelected] = useState<LaundryOrder | null>(null)
  const [methods, setMethods] = useState<Array<{ code: string; name: string; kind: string }>>([])
  const [method, setMethod] = useState("")
  const [received, setReceived] = useState("")
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    void laundryService.paymentMethods().then((items) => {
      setMethods(items)
      setMethod(items.find((entry) => entry.kind === "cash")?.code ?? items[0]?.code ?? "")
    })
  }, [])

  useEffect(() => {
    let active = true
    const query = search.trim()
    laundryService
      .orders(query ? { status: "open", search: query } : { status: "ready" })
      .then((items) => {
        if (active) setOrders(items)
      })
      .catch(() => {
        if (active) setOrders([])
      })
    return () => {
      active = false
    }
  }, [search, reload])

  async function pick(id: string) {
    setReceived("")
    try {
      setSelected(await laundryService.order(id))
    } catch (error) {
      toast.error(errorText(error, ar))
    }
  }

  const chosen = methods.find((entry) => entry.code === method)
  const change = useMemo(() => {
    if (!selected || chosen?.kind !== "cash") return 0
    const amount = Number(received) || 0
    return amount > selected.due ? Math.round((amount - selected.due) * 100) / 100 : 0
  }, [received, selected, chosen])

  async function handOver() {
    if (!selected) return
    setBusy(true)
    try {
      const done = await laundryService.collect(selected.id, selected.due > 0 ? method : null)
      toast.success(tx(`سُلّم الطلب ${done.orderNumber}`, `Order ${done.orderNumber} handed over`))
      if (selected.due > 0 && done.invoiceNumber) onInvoiced(done.invoiceNumber)
      setSelected(null)
      setReload((key) => key + 1)
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className={cn("pointer-events-none absolute inset-y-0 start-3 my-auto size-4", MUTED)}
          />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tx("رقم الطلب أو جوال العميل أو اسمه", "Order no., mobile or name")}
            className={cn(FIELD, "ps-9")}
          />
        </div>
        <p className={cn("text-[12px]", MUTED)}>
          {search.trim()
            ? tx("الطلبات المفتوحة المطابقة", "Matching open orders")
            : tx("الطلبات الجاهزة للاستلام", "Orders ready to collect")}
        </p>
        {orders === null ? (
          <div className="flex justify-center py-10 text-[#6b7b96]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <p className={cn(PANEL, "p-8 text-center text-[13px]", MUTED)}>
            {tx("لا توجد طلبات.", "No orders.")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => void pick(order.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-[14px] border bg-white p-3 text-start transition hover:border-[#2563eb]/50",
                  selected?.id === order.id
                    ? "border-[#2563eb] ring-1 ring-[#2563eb]"
                    : "border-[#e4e9f2]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-[13.5px] font-extrabold", HEADING)}>
                    {order.orderNumber}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <span className={cn("truncate text-[12px]", MUTED)}>
                  {[order.customerName, order.customerPhone].filter(Boolean).join(" · ") ||
                    tx("عميل", "Customer")}
                </span>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className={HEADING}>
                    {order.pieces} {tx("قطعة", "pcs")}
                  </span>
                  {order.urgent ? <Zap className="size-3.5 text-[#b45309]" /> : null}
                  {order.fulfilment === "delivery" ? (
                    <Truck className="size-3.5 text-[#2563eb]" />
                  ) : null}
                  <span
                    className={
                      order.due > 0 ? "font-bold text-[#b42318]" : "font-bold text-[#047857]"
                    }
                  >
                    {order.due > 0 ? money(order.due) : tx("مدفوع", "Paid")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className={cn(PANEL, "flex h-fit flex-col gap-3 p-4")}>
        {!selected ? (
          <p className={cn("py-10 text-center text-[13px]", MUTED)}>
            {tx("اختر طلبًا لتسليمه.", "Pick an order to hand over.")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className={cn("text-[15px] font-extrabold", HEADING)}>
                {selected.orderNumber}
              </span>
              <StatusBadge status={selected.status} />
            </div>
            <ul className="flex flex-col gap-1 text-[12.5px]">
              {selected.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-2">
                  <span className={HEADING}>
                    {line.itemName} · {line.serviceName} × {line.quantity}
                  </span>
                  <span className={MUTED}>{money(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1 border-t border-[#eef2f8] pt-2 text-[13px]">
              <div className="flex justify-between">
                <span className={MUTED}>{tx("الإجمالي", "Total")}</span>
                <span className={HEADING}>{money(selected.total)}</span>
              </div>
              {selected.depositAmount > 0 ? (
                <div className="flex justify-between">
                  <span className={MUTED}>{tx("عربون مدفوع", "Deposit paid")}</span>
                  <span className="text-[#047857]">− {money(selected.depositAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-[16px] font-extrabold">
                <span className={HEADING}>
                  {selected.due > 0 ? tx("المطلوب الآن", "Due now") : tx("مدفوع", "Paid")}
                </span>
                <span className={selected.due > 0 ? "text-[#2563eb]" : "text-[#047857]"}>
                  {money(selected.due)}
                </span>
              </div>
              <p className={cn("text-[11.5px]", MUTED)}>
                {tx("موعد الجاهزية", "Ready by")}: {dateTime(selected.promisedAt)}
              </p>
            </div>

            {selected.due > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-[12.5px] font-semibold text-[#344054]">
                  {tx("طريقة الدفع", "Paid by")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {methods.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      onClick={() => setMethod(entry.code)}
                      className={cn(
                        "h-11 rounded-[12px] border px-3 text-[13px] font-bold transition",
                        method === entry.code
                          ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                          : "border-[#e1e7f0] bg-white text-[#0b1738]"
                      )}
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
                {chosen?.kind === "cash" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={received}
                      onChange={(event) => setReceived(event.target.value)}
                      placeholder={tx("المبلغ المستلم (اختياري)", "Cash received (optional)")}
                      className={FIELD}
                    />
                    {change > 0 ? (
                      <span className="shrink-0 text-[13px] font-bold text-[#16a34a]">
                        {tx("الباقي", "Change")} {money(change)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected.due > 0 && !shiftOpen ? (
              <p className="rounded-[10px] bg-[#fffbeb] px-3 py-2 text-[12px] font-semibold text-[#92400e]">
                {tx("افتح وردية أولًا لاستلام المبلغ.", "Open a shift first to take the payment.")}
              </p>
            ) : null}
            <button
              type="button"
              className={PRIMARY}
              disabled={busy || (selected.due > 0 && (!method || !shiftOpen))}
              onClick={() => void handOver()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {selected.due > 0
                ? tx(
                    `تحصيل ${money(selected.due)} وتسليم`,
                    `Take ${money(selected.due)} and hand over`
                  )
                : tx("تسليم للعميل", "Hand over")}
            </button>
            <Link
              href={ROUTES.laundryOrder(selected.id)}
              className="text-center text-[12.5px] font-bold text-[#2563eb] hover:underline"
            >
              {tx("تفاصيل الطلب", "Order details")}
            </Link>
          </>
        )}
      </aside>
    </div>
  )
}
