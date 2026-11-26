"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { createPortal } from "react-dom"

import { printThermalReceipt } from "@/lib/print-thermal-receipt"

import { useWorkspace } from "@/features/workspace"

import type { LaundryOrder } from "../services/laundry.service"
import { useTx } from "./shell"

const PRINT_ID = "laundry-print"

// Prints an order's customer ticket or a numbered tag for every piece on the receipt printer
// (72mm), from the order page or the cashier's laundry window. Render `node` once on the screen.
export function useLaundryPrinter() {
  const { tx, dateTime } = useTx()
  const { currentOrganization } = useWorkspace()
  const [job, setJob] = useState<{ order: LaundryOrder; kind: "ticket" | "tags" } | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (!job) return
    let active = true
    void QRCode.toDataURL(job.order.orderNumber, { margin: 0, width: 160 })
      .catch(() => null)
      .then((url) => {
        if (!active) return
        setQr(url)
        window.setTimeout(() => {
          printThermalReceipt(PRINT_ID)
          setJob(null)
        }, 150)
      })
    return () => {
      active = false
    }
  }, [job])

  const order = job?.order
  const printing = job?.kind ?? null
  const business = currentOrganization?.name ?? ""
  const tags = order
    ? order.lines.flatMap((line) =>
        Array.from({ length: line.quantity }, () => ({
          itemName: line.itemName,
          serviceName: line.serviceName,
          note: line.note,
        }))
      )
    : []

  const node =
    order && typeof document !== "undefined" ? (
      <>
        {createPortal(
          <div id={PRINT_ID} className="hidden print:block" dir="rtl">
            {printing === "ticket" ? (
              <div className="w-full p-2 text-[12px] text-black">
                <p className="text-center text-[15px] font-bold">{business}</p>
                <p className="text-center text-[13px] font-bold">
                  {tx("إيصال استلام ملابس", "Laundry ticket")}
                </p>
                <p className="mt-1 text-center text-[22px] font-black">{order.orderNumber}</p>
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the order number as a QR
                  <img src={qr} alt="" className="mx-auto my-1 size-24" />
                ) : null}
                <p>
                  {tx("العميل", "Customer")}: {order.customerName ?? "—"}{" "}
                  {order.customerPhone ?? ""}
                </p>
                <p>
                  {tx("الاستلام", "Received")}: {dateTime(order.createdAt)}
                </p>
                <p className="font-bold">
                  {tx("الجاهزية", "Ready by")}: {dateTime(order.promisedAt)}
                </p>
                <div className="my-1 border-t border-dashed border-black" />
                {order.lines.map((line) => (
                  <div key={line.id} className="flex justify-between">
                    <span>
                      {line.itemName} - {line.serviceName} × {line.quantity}
                    </span>
                    <span>{line.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
                {order.urgentFee > 0 ? (
                  <div className="flex justify-between">
                    <span>{tx("رسوم الاستعجال", "Urgent")}</span>
                    <span>{order.urgentFee.toFixed(2)}</span>
                  </div>
                ) : null}
                {order.deliveryFee > 0 ? (
                  <div className="flex justify-between">
                    <span>{tx("رسوم التوصيل", "Delivery")}</span>
                    <span>{order.deliveryFee.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="my-1 border-t border-dashed border-black" />
                <div className="flex justify-between font-bold">
                  <span>{tx("الإجمالي", "Total")}</span>
                  <span>{order.total.toFixed(2)}</span>
                </div>
                {order.depositAmount > 0 ? (
                  <div className="flex justify-between">
                    <span>{tx("عربون", "Deposit")}</span>
                    <span>{order.depositAmount.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-bold">
                  <span>{order.paid ? tx("مدفوع", "Paid") : tx("المتبقي", "Due")}</span>
                  <span>{order.due.toFixed(2)}</span>
                </div>
                {order.notes ? (
                  <p className="mt-1">
                    {tx("ملاحظات", "Notes")}: {order.notes}
                  </p>
                ) : null}
                <p className="mt-2 text-center text-[11px]">
                  {tx(
                    "يُرجى إحضار هذا الإيصال عند الاستلام. هذا ليس فاتورة ضريبية.",
                    "Bring this ticket when collecting. Not a tax invoice."
                  )}
                </p>
              </div>
            ) : (
              <div className="w-full text-black">
                {tags.map((tag, index) => (
                  <div
                    key={index}
                    className="border-b border-dashed border-black p-2 text-[12px]"
                    style={{ breakInside: "avoid" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[16px] font-black">{order.orderNumber}</span>
                      <span className="text-[14px] font-bold">
                        {index + 1}/{tags.length}
                      </span>
                    </div>
                    <p className="font-bold">
                      {tag.itemName} - {tag.serviceName}
                    </p>
                    <p>
                      {order.customerName ?? ""} {order.customerPhone ?? ""}
                    </p>
                    <p>
                      {tx("جاهز", "Ready")}: {dateTime(order.promisedAt)}
                      {order.urgent ? ` · ${tx("مستعجل", "URGENT")}` : ""}
                    </p>
                    {tag.note ? <p>{tag.note}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
        <style>{`
          @media print {
            body > *:not(#${PRINT_ID}) { display: none !important; }
            #${PRINT_ID} { width: 72mm; }
          }
        `}</style>
      </>
    ) : null

  return {
    print: (target: LaundryOrder, kind: "ticket" | "tags") => setJob({ order: target, kind }),
    node,
  }
}
