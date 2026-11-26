"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { MapPin, MessageCircle, Truck } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { type LaundryOrderSummary, laundryService } from "../services/laundry.service"
import { CHIP, HEADING, LaundryPage, Loading, MUTED, PANEL, StatusBadge, useTx } from "./shell"

type Job = { order: LaundryOrderSummary; kind: "pickup" | "delivery"; at: string | null }

// The driver's day: clothes to collect from customers and orders to take back, by time, with
// the driver, a map link and the customer's WhatsApp.
export function LaundryDeliveriesPage() {
  const { tx, money, dateTime } = useTx()
  const [orders, setOrders] = useState<LaundryOrderSummary[] | null>(null)
  const [staff, setStaff] = useState<Array<{ userId: string; name: string }>>([])
  const [day, setDay] = useState<"today" | "tomorrow" | "all">("today")

  useEffect(() => {
    void laundryService.orders({ status: "open" }).then(setOrders)
    void laundryService
      .staff()
      .then(setStaff)
      .catch(() => undefined)
  }, [])

  const jobs = useMemo(() => {
    const list: Job[] = []
    for (const order of orders ?? []) {
      if (order.fulfilment !== "delivery") continue
      if (order.status === "received" && order.pickupAt)
        list.push({ order, kind: "pickup", at: order.pickupAt })
      if (order.status !== "delivered") list.push({ order, kind: "delivery", at: order.deliveryAt })
    }
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (day === "tomorrow") start.setDate(start.getDate() + 1)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return list
      .filter((job) => {
        if (day === "all") return true
        if (!job.at) return day === "today"
        const at = new Date(job.at).getTime()
        return day === "today" ? at < end.getTime() : at >= start.getTime() && at < end.getTime()
      })
      .sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime())
  }, [orders, day])
  const nameOf = (id: string | null) =>
    staff.find((person) => person.userId === id)?.name ?? tx("بدون مندوب", "No driver")

  return (
    <LaundryPage
      title={tx("التوصيل", "Delivery")}
      subtitle={tx(
        "الاستلام من العملاء والتوصيل لهم.",
        "Collecting from and delivering to customers."
      )}
    >
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["today", tx("اليوم", "Today")],
            ["tomorrow", tx("غدًا", "Tomorrow")],
            ["all", tx("الكل", "All")],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className={CHIP(day === key)} onClick={() => setDay(key)}>
            {label}
          </button>
        ))}
      </div>
      {!orders ? (
        <Loading />
      ) : jobs.length === 0 ? (
        <p className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
          {tx("لا توجد مشاوير.", "No trips.")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <div
              key={`${job.order.id}:${job.kind}`}
              className={cn(PANEL, "flex flex-col gap-1.5 p-4 text-[13px]")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold",
                    job.kind === "pickup"
                      ? "bg-[#eef2ff] text-[#3730a3]"
                      : "bg-[#eff6ff] text-[#2563eb]"
                  )}
                >
                  <Truck className="size-3.5" />
                  {job.kind === "pickup"
                    ? tx("استلام من العميل", "Collect from customer")
                    : tx("توصيل للعميل", "Deliver to customer")}
                </span>
                <StatusBadge status={job.order.status} />
              </div>
              <Link
                href={ROUTES.laundryOrder(job.order.id)}
                className={cn("font-extrabold hover:underline", HEADING)}
              >
                {job.order.orderNumber} · {job.order.customerName ?? "—"}
              </Link>
              <p className={MUTED}>
                {dateTime(job.at)} · {nameOf(job.order.driverUserId)}
              </p>
              <p
                className={
                  job.order.due > 0 ? "font-bold text-[#b42318]" : "font-bold text-[#047857]"
                }
              >
                {job.order.due > 0
                  ? `${tx("تحصيل", "Collect")} ${money(job.order.due)}`
                  : tx("مدفوع", "Paid")}
              </p>
              <div className="mt-1 flex gap-2">
                <Link
                  href={ROUTES.laundryOrder(job.order.id)}
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-[#2563eb]"
                >
                  <MapPin className="size-3.5" />
                  {tx("العنوان والتفاصيل", "Address and details")}
                </Link>
                {job.order.customerPhone ? (
                  <a
                    href={`https://wa.me/${job.order.customerPhone.replace(/\D/g, "").replace(/^0/, "966")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-[#16a34a]"
                  >
                    <MessageCircle className="size-3.5" />
                    {tx("واتساب", "WhatsApp")}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </LaundryPage>
  )
}
