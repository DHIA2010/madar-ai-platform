"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Plus, Search, Truck, Zap } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { type LaundryOrderSummary, laundryService } from "../services/laundry.service"
import {
  CHIP,
  errorText,
  FIELD,
  HEADING,
  LaundryPage,
  Loading,
  MUTED,
  PANEL,
  PRIMARY,
  StatusBadge,
  useLaundryAccess,
  useTx,
} from "./shell"

type View = "open" | "unclaimed" | "delivered" | "all"
const COLUMNS = ["received", "processing", "ready"] as const
const NEXT: Record<string, "processing" | "ready" | null> = {
  received: "processing",
  processing: "ready",
  ready: null,
}

// The orders board: what came in, what is being worked on, what is ready -- with what is due
// today, what is late, and the next step a tap away.
export function LaundryBoardPage() {
  const { tx, ar, money, dateTime } = useTx()
  const { canManage } = useLaundryAccess()
  const [view, setView] = useState<View>("open")
  const [search, setSearch] = useState("")
  const [orders, setOrders] = useState<LaundryOrderSummary[] | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const status = view === "all" ? null : view
    laundryService
      .orders({ status, search: search.trim() || null })
      .then((items) => {
        if (active) setOrders(items)
      })
      .catch(() => {
        if (active) setOrders([])
      })
    return () => {
      active = false
    }
  }, [view, search, reload])

  const stats = useMemo(() => {
    const list = orders ?? []
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    return {
      dueToday: list.filter(
        (order) =>
          (order.status === "received" || order.status === "processing") &&
          order.promisedAt &&
          new Date(order.promisedAt).getTime() <= endOfToday.getTime()
      ).length,
      late: list.filter((order) => order.late && order.status !== "delivered").length,
      ready: list.filter((order) => order.status === "ready").length,
      due: list.reduce((sum, order) => sum + order.due, 0),
    }
  }, [orders])

  async function advance(order: LaundryOrderSummary) {
    const next = NEXT[order.status]
    if (!next) return
    setBusy(order.id)
    try {
      const updated = await laundryService.setStatus(order.id, next)
      if (next === "ready") {
        toast.success(
          updated.messageSent === "sent"
            ? tx(
                "جاهز، وأُرسلت رسالة واتساب للعميل.",
                "Ready, and the customer got a WhatsApp message."
              )
            : tx(
                "أصبح الطلب جاهزًا. أرسل له رسالة من صفحة الطلب.",
                "Ready. Message the customer from the order page."
              )
        )
      }
      setReload((key) => key + 1)
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setBusy(null)
    }
  }

  const Card = ({ order }: { order: LaundryOrderSummary }) => (
    <div className="rounded-[14px] border border-[#e4e9f2] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={ROUTES.laundryOrder(order.id)} className="min-w-0">
          <p className={cn("text-[13.5px] font-extrabold hover:underline", HEADING)}>
            {order.orderNumber}
          </p>
          <p className={cn("truncate text-[12px]", MUTED)}>
            {order.customerName ?? tx("عميل", "Customer")}
            {order.customerPhone ? ` · ${order.customerPhone}` : ""}
          </p>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {order.urgent ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10.5px] font-bold text-[#b45309]">
              <Zap className="size-3" />
              {tx("مستعجل", "Urgent")}
            </span>
          ) : null}
          {order.fulfilment === "delivery" ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10.5px] font-bold text-[#2563eb]">
              <Truck className="size-3" />
              {tx("توصيل", "Delivery")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className={HEADING}>
          {order.pieces} {tx("قطعة", "pcs")}
        </span>
        <span className={order.due > 0 ? "font-bold text-[#b42318]" : "font-bold text-[#047857]"}>
          {order.due > 0 ? `${tx("متبقي", "Due")} ${money(order.due)}` : tx("مدفوع", "Paid")}
        </span>
      </div>
      <p className={cn("mt-1 text-[11.5px]", order.late ? "font-bold text-[#b42318]" : MUTED)}>
        {order.late ? <AlertTriangle className="me-1 inline size-3" /> : null}
        {order.status === "ready"
          ? `${tx("جاهز منذ", "Ready since")} ${dateTime(order.readyAt)}`
          : `${tx("موعد التسليم", "Promised")} ${dateTime(order.promisedAt)}`}
      </p>
      {canManage && NEXT[order.status] ? (
        <button
          type="button"
          disabled={busy === order.id}
          onClick={() => void advance(order)}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-[10px] bg-[#eff6ff] text-[12px] font-bold text-[#2563eb] hover:bg-[#dbeafe] disabled:opacity-60"
        >
          {NEXT[order.status] === "processing"
            ? tx("بدء العمل", "Start")
            : tx("جاهز للاستلام", "Mark ready")}
          <ArrowLeft className={cn("size-3.5", !ar && "rotate-180")} />
        </button>
      ) : null}
      {order.status === "ready" ? (
        <Link
          href={ROUTES.laundryOrder(order.id)}
          className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-[10px] bg-[#2563eb] text-[12px] font-bold text-white hover:bg-[#1d4ed8]"
        >
          {tx("تسليم للعميل", "Hand over")}
        </Link>
      ) : null}
    </div>
  )

  const tabs: Array<[View, string]> = [
    ["open", tx("الطلبات المفتوحة", "Open")],
    ["unclaimed", tx("لم تُستلم", "Unclaimed")],
    ["delivered", tx("تم تسليمها", "Collected")],
    ["all", tx("الكل", "All")],
  ]

  return (
    <LaundryPage
      title={tx("المغاسل", "Laundry")}
      subtitle={tx(
        "كل الطلبات من الاستلام حتى التسليم.",
        "Every order from drop-off to collection."
      )}
      actions={
        canManage ? (
          <Link href={ROUTES.laundryNew} className={PRIMARY}>
            <Plus className="size-4" />
            {tx("طلب جديد", "New order")}
          </Link>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [tx("تسليمها اليوم", "Due today"), String(stats.dueToday), "text-[#0b1738]"],
          [
            tx("متأخرة", "Late"),
            String(stats.late),
            stats.late > 0 ? "text-[#b42318]" : "text-[#0b1738]",
          ],
          [tx("جاهزة بانتظار العميل", "Ready, waiting"), String(stats.ready), "text-[#047857]"],
          [tx("مبالغ لم تُحصّل", "Not yet collected"), money(stats.due), "text-[#0b1738]"],
        ].map(([label, value, tone]) => (
          <div key={label} className={cn(PANEL, "p-4")}>
            <p className={cn("text-[12px] font-semibold", MUTED)}>{label}</p>
            <p className={cn("mt-1 text-[20px] font-black", tone)}>{value}</p>
          </div>
        ))}
      </div>

      <div className={cn(PANEL, "flex flex-wrap items-center justify-between gap-3 p-3")}>
        <div className="flex flex-wrap gap-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={CHIP(view === key)}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className={cn("pointer-events-none absolute inset-y-0 start-3 my-auto size-4", MUTED)}
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tx("رقم الطلب أو الجوال أو الاسم", "Order no., mobile or name")}
            className={cn(FIELD, "ps-9")}
          />
        </div>
      </div>

      {orders === null ? (
        <Loading />
      ) : view === "open" && !search.trim() ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const list = orders.filter((order) => order.status === column)
            return (
              <div key={column} className="flex flex-col gap-2 rounded-[18px] bg-[#f5f7fb] p-3">
                <div className="flex items-center justify-between px-1">
                  <StatusBadge status={column} />
                  <span className={cn("text-[12px] font-bold", MUTED)}>{list.length}</span>
                </div>
                {list.length === 0 ? (
                  <p className={cn("py-8 text-center text-[12px]", MUTED)}>
                    {tx("لا يوجد", "None")}
                  </p>
                ) : (
                  list.map((order) => <Card key={order.id} order={order} />)
                )}
              </div>
            )
          })}
        </div>
      ) : orders.length === 0 ? (
        <p className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
          {view === "unclaimed"
            ? tx("لا توجد طلبات جاهزة متأخرة الاستلام.", "No ready orders waiting too long.")
            : tx("لا توجد طلبات.", "No orders.")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <div key={order.id} className="flex flex-col gap-1">
              <StatusBadge status={order.status} />
              <Card order={order} />
            </div>
          ))}
        </div>
      )}
    </LaundryPage>
  )
}
