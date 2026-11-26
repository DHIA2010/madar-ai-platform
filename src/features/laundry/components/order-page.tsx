"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Camera,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Printer,
  Tag,
  Trash2,
  Truck,
  XCircle,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { type LaundryOrder, laundryService } from "../services/laundry.service"
import { useLaundryPrinter } from "./print"
import {
  CHIP,
  Choice,
  DANGER,
  errorText,
  HEADING,
  LABEL,
  LaundryPage,
  Loading,
  MUTED,
  PANEL,
  PRIMARY,
  SECONDARY,
  StatusBadge,
  useLaundryAccess,
  useTx,
} from "./shell"

const STEPS = ["received", "processing", "ready", "delivered"] as const

const EVENT_LABEL: Record<string, [string, string]> = {
  created: ["أُنشئ الطلب", "Order created"],
  status: ["تغيّرت الحالة", "Status changed"],
  deposit: ["عربون", "Deposit"],
  invoiced: ["صدرت الفاتورة", "Invoiced"],
  delivered: ["سُلّم للعميل", "Handed over"],
  cancelled: ["أُلغي", "Cancelled"],
  ready_message: ["رسالة الجاهزية", "Ready message"],
  reminder: ["تذكير", "Reminder"],
  updated: ["عُدّل", "Updated"],
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// One order: where it is, what it holds, what is owed, the customer's WhatsApp message, handing
// it over (and paying), photos, its history, and printing the customer's ticket and a tag for
// every piece.
export function LaundryOrderPage() {
  const params = useSearchParams()
  const id = params.get("id") ?? ""
  const isNew = params.get("new") === "1"
  const { tx, ar, money, dateTime } = useTx()
  const { canManage } = useLaundryAccess()
  const [order, setOrder] = useState<LaundryOrder | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [methods, setMethods] = useState<Array<{ code: string; name: string; kind: string }>>([])
  const [staff, setStaff] = useState<Array<{ userId: string; name: string }>>([])
  const [collecting, setCollecting] = useState(false)
  const [method, setMethod] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setOrder(await laundryService.order(id))
    } catch {
      setFailed(true)
    }
  }, [id])

  useEffect(() => {
    if (id) void load()
    void laundryService
      .paymentMethods()
      .then((items) => {
        setMethods(items)
        setMethod(items.find((entry) => entry.kind === "cash")?.code ?? items[0]?.code ?? "")
      })
      .catch(() => undefined)
    void laundryService
      .staff()
      .then(setStaff)
      .catch(() => undefined)
  }, [id, load])

  async function run(work: () => Promise<LaundryOrder>, done?: string) {
    setBusy(true)
    try {
      const updated = await work()
      setOrder(updated)
      if (done) toast.success(done)
      return updated
    } catch (error) {
      toast.error(errorText(error, ar))
      return null
    } finally {
      setBusy(false)
    }
  }

  const printer = useLaundryPrinter()
  const print = (kind: "ticket" | "tags") => {
    if (order) printer.print(order, kind)
  }

  function openWhatsApp(kind: "ready" | "reminder") {
    if (!order) return
    const url = kind === "ready" ? order.whatsapp.readyUrl : order.whatsapp.reminderUrl
    if (!url) {
      toast.error(tx("لا يوجد جوال للعميل.", "The customer has no mobile."))
      return
    }
    window.open(url, "_blank")
    void run(() => laundryService.markNotified(order.id, kind))
  }

  if (!id || failed) {
    return (
      <LaundryPage title={tx("الطلب", "Order")}>
        <p className={cn(PANEL, "p-10 text-center text-[13px]", MUTED)}>
          {tx("الطلب غير موجود.", "Order not found.")}
        </p>
      </LaundryPage>
    )
  }
  if (!order) {
    return (
      <LaundryPage title={tx("الطلب", "Order")}>
        <Loading />
      </LaundryPage>
    )
  }

  const open = order.status !== "delivered" && order.status !== "cancelled"
  const stepIndex = STEPS.indexOf(order.status as (typeof STEPS)[number])
  // One tag per piece: the order number and the piece's place in it.
  const tags = order.lines.flatMap((line) =>
    Array.from({ length: line.quantity }, () => ({
      itemName: line.itemName,
      serviceName: line.serviceName,
      note: line.note,
    }))
  )

  return (
    <LaundryPage
      title={`${tx("طلب", "Order")} ${order.orderNumber}`}
      subtitle={[order.customerName, order.customerPhone]
        .filter((part, index, all): part is string => !!part && all.indexOf(part) === index)
        .join(" · ")}
      actions={
        <>
          <button type="button" className={SECONDARY} onClick={() => print("ticket")}>
            <Printer className="size-4" />
            {tx("إيصال العميل", "Customer ticket")}
          </button>
          <button type="button" className={SECONDARY} onClick={() => print("tags")}>
            <Tag className="size-4" />
            {tx(`ملصقات القطع (${tags.length})`, `Piece tags (${tags.length})`)}
          </button>
          <Link href={ROUTES.laundry} className={SECONDARY}>
            {tx("الطلبات", "Orders")}
          </Link>
        </>
      }
    >
      {isNew ? (
        <div className="rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] p-3 text-[13px] text-[#1d4ed8]">
          {tx(
            "حُفظ الطلب. اطبع إيصال العميل وملصقات القطع من الأعلى.",
            "Order saved. Print the customer ticket and the piece tags from the top."
          )}
        </div>
      ) : null}

      <section className={cn(PANEL, "flex flex-wrap items-center gap-2 p-4")}>
        {order.status === "cancelled" ? (
          <StatusBadge status="cancelled" />
        ) : (
          STEPS.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-bold",
                  index <= stepIndex ? "bg-[#2563eb] text-white" : "bg-[#f1f5f9] text-[#64748b]"
                )}
              >
                {index < stepIndex ? <CheckCircle2 className="size-3.5" /> : null}
                {
                  {
                    received: tx("مستلم", "Received"),
                    processing: tx("قيد العمل", "In progress"),
                    ready: tx("جاهز", "Ready"),
                    delivered: tx("تم التسليم", "Collected"),
                  }[step]
                }
              </span>
              {index < STEPS.length - 1 ? <span className="h-px w-5 bg-[#cbd5e1]" /> : null}
            </div>
          ))
        )}
        <div className="ms-auto flex flex-wrap gap-2">
          {order.urgent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[11.5px] font-bold text-[#b45309]">
              <Zap className="size-3.5" />
              {tx("مستعجل", "Urgent")}
            </span>
          ) : null}
          {order.late && open ? (
            <span className="rounded-full bg-[#fef2f2] px-2.5 py-1 text-[11.5px] font-bold text-[#b42318]">
              {tx("متأخر", "Late")}
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <section className={cn(PANEL, "p-4")}>
            <h2 className={cn("mb-3 text-[14px] font-bold", HEADING)}>
              {tx("القطع", "Pieces")} · {order.pieces}
            </h2>
            <ul className="flex flex-col divide-y divide-[#f1f5f9]">
              {order.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className={cn("font-bold", HEADING)}>
                      {line.itemName} × {line.quantity}
                    </p>
                    <p className={cn("text-[12px]", MUTED)}>
                      {line.serviceName} · {money(line.unitPrice)}
                      {line.coveredQuantity > 0
                        ? ` · ${tx(`${line.coveredQuantity} من الاشتراك`, `${line.coveredQuantity} on the plan`)}`
                        : ""}
                    </p>
                    {line.note ? <p className="text-[12px] text-[#b45309]">{line.note}</p> : null}
                  </div>
                  <span className={cn("font-bold", HEADING)}>{money(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {order.notes ? (
              <p className="mt-3 rounded-[10px] bg-[#fffbeb] p-3 text-[12.5px] text-[#92400e]">
                {order.notes}
              </p>
            ) : null}
          </section>

          <section className={cn(PANEL, "p-4")}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className={cn("text-[14px] font-bold", HEADING)}>{tx("صور القطع", "Photos")}</h2>
              {canManage ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      if (fileInput.current) fileInput.current.value = ""
                      if (!file) return
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error(tx("الصورة أكبر من 5 ميجابايت.", "The photo is over 5 MB."))
                        return
                      }
                      const dataBase64 = await readAsBase64(file)
                      await run(() =>
                        laundryService.addPhoto(order.id, {
                          contentType: file.type || "image/jpeg",
                          dataBase64,
                        })
                      )
                    }}
                  />
                  <button
                    type="button"
                    className={SECONDARY}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Camera className="size-4" />
                    {tx("إضافة صورة", "Add photo")}
                  </button>
                </>
              ) : null}
            </div>
            {order.photos.length === 0 ? (
              <p className={cn("text-[12.5px]", MUTED)}>
                {tx(
                  "صوّر البقع والأضرار عند الاستلام لتجنب الخلاف لاحقًا.",
                  "Photograph stains and damage at drop-off to avoid disputes."
                )}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {order.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative overflow-hidden rounded-[10px] border border-[#e4e9f2]"
                  >
                    <a href={photo.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a photo taken at drop-off */}
                      <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
                    </a>
                    {canManage ? (
                      <button
                        type="button"
                        aria-label={tx("حذف", "Delete")}
                        onClick={() =>
                          void run(() => laundryService.removePhoto(order.id, photo.id))
                        }
                        className="absolute end-1 top-1 hidden rounded-full bg-white/90 p-1 text-[#b42318] group-hover:block"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={cn(PANEL, "p-4")}>
            <h2 className={cn("mb-3 text-[14px] font-bold", HEADING)}>
              {tx("سجل الطلب", "History")}
            </h2>
            <ol className="flex flex-col gap-2">
              {order.events.map((event, index) => (
                <li key={index} className="flex justify-between gap-3 text-[12.5px]">
                  <span className={HEADING}>
                    {(EVENT_LABEL[event.kind] ?? [event.kind, event.kind])[ar ? 0 : 1]}
                    {event.kind === "status" && typeof event.detail.to === "string"
                      ? ` ← ${tx(
                          { received: "مستلم", processing: "قيد العمل", ready: "جاهز" }[
                            event.detail.to
                          ] ?? event.detail.to,
                          event.detail.to
                        )}`
                      : ""}
                    {event.kind === "invoiced" && typeof event.detail.invoiceNumber === "string"
                      ? ` · ${event.detail.invoiceNumber}`
                      : ""}
                    {event.kind === "deposit" && typeof event.detail.amount === "number"
                      ? ` · ${money(event.detail.amount)}`
                      : ""}
                    {event.detail.via === "auto" ? ` · ${tx("تلقائي", "automatic")}` : ""}
                  </span>
                  <span className={MUTED}>{dateTime(event.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex h-fit flex-col gap-4">
          <section className={cn(PANEL, "flex flex-col gap-1.5 p-4 text-[13px]")}>
            <div className="flex justify-between">
              <span className={MUTED}>{tx("القطع", "Pieces")}</span>
              <span className={HEADING}>{money(order.itemsTotal)}</span>
            </div>
            {order.urgentFee > 0 ? (
              <div className="flex justify-between">
                <span className={MUTED}>{tx("رسوم الاستعجال", "Urgent charge")}</span>
                <span className={HEADING}>{money(order.urgentFee)}</span>
              </div>
            ) : null}
            {order.deliveryFee > 0 ? (
              <div className="flex justify-between">
                <span className={MUTED}>{tx("رسوم التوصيل", "Delivery fee")}</span>
                <span className={HEADING}>{money(order.deliveryFee)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-extrabold">
              <span className={HEADING}>{tx("الإجمالي", "Total")}</span>
              <span className={HEADING}>{money(order.total)}</span>
            </div>
            {order.depositAmount > 0 ? (
              <div className="flex justify-between">
                <span className={MUTED}>{tx("عربون مدفوع", "Deposit paid")}</span>
                <span className="text-[#047857]">− {money(order.depositAmount)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-[#eef2f8] pt-2 text-[15px] font-extrabold">
              <span className={HEADING}>
                {order.paid ? tx("مدفوع", "Paid") : tx("المتبقي", "Due")}
              </span>
              <span className={order.paid ? "text-[#047857]" : "text-[#b42318]"}>
                {money(order.due)}
              </span>
            </div>
            {order.invoiceNumber ? (
              <p className={cn("text-[12px]", MUTED)}>
                {tx("الفاتورة", "Invoice")} {order.invoiceNumber}
              </p>
            ) : null}
            <p className={cn("text-[12px]", MUTED)}>
              {tx("موعد الجاهزية", "Ready by")}: {dateTime(order.promisedAt)}
            </p>
          </section>

          {canManage && open ? (
            <section className={cn(PANEL, "flex flex-col gap-2 p-4")}>
              {order.status === "received" ? (
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={busy}
                  onClick={() => void run(() => laundryService.setStatus(order.id, "processing"))}
                >
                  {tx("بدء العمل", "Start work")}
                </button>
              ) : null}
              {order.status === "received" || order.status === "processing" ? (
                <button
                  type="button"
                  className={order.status === "processing" ? PRIMARY : SECONDARY}
                  disabled={busy}
                  onClick={async () => {
                    const updated = await run(() => laundryService.setStatus(order.id, "ready"))
                    if (updated?.messageSent === "sent") {
                      toast.success(
                        tx(
                          "أُرسلت رسالة الجاهزية للعميل تلقائيًا.",
                          "The ready message went out automatically."
                        )
                      )
                    }
                  }}
                >
                  {tx("جاهز للاستلام", "Mark ready")}
                </button>
              ) : null}
              {order.status === "ready" ? (
                <>
                  <button type="button" className={SECONDARY} onClick={() => openWhatsApp("ready")}>
                    <MessageCircle className="size-4 text-[#16a34a]" />
                    {order.readyNotifiedAt
                      ? tx("إعادة رسالة الجاهزية", "Send the ready message again")
                      : tx("رسالة الجاهزية بالواتساب", "WhatsApp: order ready")}
                  </button>
                  <button
                    type="button"
                    className={SECONDARY}
                    onClick={() => openWhatsApp("reminder")}
                  >
                    <MessageCircle className="size-4 text-[#16a34a]" />
                    {tx("تذكير بالاستلام", "Pickup reminder")}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={PRIMARY}
                disabled={busy}
                onClick={() => setCollecting(true)}
              >
                {order.fulfilment === "delivery" ? <Truck className="size-4" /> : null}
                {order.due > 0
                  ? tx(`تسليم وتحصيل ${money(order.due)}`, `Hand over and take ${money(order.due)}`)
                  : tx("تسليم للعميل", "Hand over")}
              </button>
              {collecting ? (
                <div className="flex flex-col gap-2 rounded-[12px] bg-[#f5f7fb] p-3">
                  {order.due > 0 ? (
                    <>
                      <span className={LABEL}>{tx("طريقة الدفع", "Paid by")}</span>
                      <div className="flex flex-wrap gap-2">
                        {methods.map((entry) => (
                          <button
                            key={entry.code}
                            type="button"
                            className={CHIP(method === entry.code)}
                            onClick={() => setMethod(entry.code)}
                          >
                            {entry.name}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className={cn("text-[12.5px]", MUTED)}>
                      {tx("لا يوجد مبلغ متبقٍ.", "Nothing left to pay.")}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={PRIMARY}
                      disabled={busy || (order.due > 0 && !method)}
                      onClick={async () => {
                        const updated = await run(
                          () => laundryService.collect(order.id, order.due > 0 ? method : null),
                          tx("سُلّم الطلب.", "Handed over.")
                        )
                        if (updated) setCollecting(false)
                      }}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                      {tx("تأكيد", "Confirm")}
                    </button>
                    <button
                      type="button"
                      className={SECONDARY}
                      onClick={() => setCollecting(false)}
                    >
                      {tx("إلغاء", "Cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
              {!order.invoiceNumber ? (
                <button
                  type="button"
                  className={DANGER}
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        tx(
                          "إلغاء الطلب؟ العربون يبقى في رصيد العميل.",
                          "Cancel the order? A deposit stays on the customer's balance."
                        )
                      )
                    )
                      return
                    void run(
                      () => laundryService.cancel(order.id),
                      tx("أُلغي الطلب.", "Order cancelled.")
                    )
                  }}
                >
                  <XCircle className="size-4" />
                  {tx("إلغاء الطلب", "Cancel order")}
                </button>
              ) : null}
            </section>
          ) : null}

          {order.fulfilment === "delivery" ? (
            <DeliveryBox
              order={order}
              staff={staff}
              canManage={canManage && open}
              onSaved={setOrder}
            />
          ) : null}
        </aside>
      </div>

      {printer.node}
    </LaundryPage>
  )
}

function DeliveryBox({
  order,
  staff,
  canManage,
  onSaved,
}: {
  order: LaundryOrder
  staff: Array<{ userId: string; name: string }>
  canManage: boolean
  onSaved: (order: LaundryOrder) => void
}) {
  const { tx, ar, dateTime } = useTx()
  const [driver, setDriver] = useState(order.driverUserId ?? "")
  const [saving, setSaving] = useState(false)
  const mapLink = (address: string | null) =>
    address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null
  return (
    <section className={cn(PANEL, "flex flex-col gap-2 p-4 text-[13px]")}>
      <h2 className={cn("flex items-center gap-2 text-[14px] font-bold", HEADING)}>
        <Truck className="size-4 text-[#2563eb]" />
        {tx("التوصيل", "Delivery")}
      </h2>
      <p>
        <span className={MUTED}>{tx("الاستلام من العميل", "Pickup")}: </span>
        {dateTime(order.pickupAt)}{" "}
        {mapLink(order.pickupAddress) ? (
          <a
            className="text-[#2563eb] underline"
            href={mapLink(order.pickupAddress)!}
            target="_blank"
            rel="noreferrer"
          >
            {order.pickupAddress}
          </a>
        ) : null}
      </p>
      <p>
        <span className={MUTED}>{tx("التوصيل", "Delivery")}: </span>
        {dateTime(order.deliveryAt)}{" "}
        {mapLink(order.deliveryAddress) ? (
          <a
            className="text-[#2563eb] underline"
            href={mapLink(order.deliveryAddress)!}
            target="_blank"
            rel="noreferrer"
          >
            {order.deliveryAddress}
          </a>
        ) : null}
      </p>
      {canManage ? (
        <div className="flex gap-2">
          <Choice
            className="flex-1"
            value={driver}
            onChange={setDriver}
            placeholder={tx("بدون مندوب", "No driver")}
            options={[
              { value: "", label: tx("بدون مندوب", "No driver") },
              ...staff.map((person) => ({ value: person.userId, label: person.name })),
            ]}
          />
          <button
            type="button"
            className={SECONDARY}
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              try {
                onSaved(
                  await laundryService.updateOrder(order.id, { driverUserId: driver || null })
                )
                toast.success(tx("حُفظ المندوب.", "Driver saved."))
              } catch (error) {
                toast.error(errorText(error, ar))
              } finally {
                setSaving(false)
              }
            }}
          >
            {tx("حفظ", "Save")}
          </button>
        </div>
      ) : null}
    </section>
  )
}
