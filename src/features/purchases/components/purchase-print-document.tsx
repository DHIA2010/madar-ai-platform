"use client"

import { useTranslations } from "next-intl"

import type { Supplier } from "@/features/suppliers"
import { useWorkspace } from "@/features/workspace"

import {
  lineItemSubtotal,
  type Purchase,
  purchaseGrandTotal,
  purchaseItemsSubtotal,
} from "../types"

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`
  }
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-bold">{label}: </span>
      <span>{value || "—"}</span>
    </p>
  )
}

function TotalLine({
  label,
  value,
  emphasized = false,
}: {
  label: string
  value: string
  emphasized?: boolean
}) {
  return (
    <div
      className={
        emphasized
          ? "flex items-center justify-between border-b-2 border-[#0b1738] pb-2 text-[16px]"
          : "flex items-center justify-between border-b border-[#e1e7f0] pb-2 text-[13px]"
      }
    >
      <span className={emphasized ? "font-extrabold" : ""}>{label}</span>
      <span className={emphasized ? "font-extrabold" : "font-bold"}>{value}</span>
    </div>
  )
}

// A4-sized printable purchase order -- portaled straight to <body> by PurchasesListPage and shown
// only under the print media query defined alongside it there. `supplier` is passed in by the
// caller (already fetched for the list) rather than looked up here -- Suppliers no longer has a
// synchronous store to read from.
export function PurchasePrintDocument({
  purchase,
  supplier,
}: {
  purchase: Purchase
  supplier: Supplier | null
}) {
  const t = useTranslations("purchases.print")
  const { currentOrganization } = useWorkspace()
  const subtotal = purchaseItemsSubtotal(purchase.items)
  const grandTotal = purchaseGrandTotal(purchase)
  const itemsTax = purchase.items.reduce(
    (sum, item) => sum + (item.netUnitCost * item.qty - item.discount) * (item.taxPercent / 100),
    0
  )
  const orderTax = subtotal * (purchase.orderTaxPercent / 100)

  return (
    <div
      id="purchase-print-target"
      className="hidden bg-white p-[14mm] text-[#0b1738] print:block"
      style={{ width: "210mm", minHeight: "297mm", direction: "rtl" }}
      dir="rtl"
    >
      <div className="mb-2 flex items-start justify-between">
        <h1 className="text-[22px] font-extrabold">{t("title")}</h1>
        {currentOrganization?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentOrganization.logoUrl}
            alt=""
            className="size-16 rounded-[10px] object-contain"
          />
        ) : (
          <span />
        )}
      </div>
      <h2 className="mb-6 text-right text-[19px] font-extrabold">
        {currentOrganization?.name ?? ""}
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
        <div className="space-y-2 text-right">
          <DetailLine label={t("orderNumber")} value={purchase.code} />
          <DetailLine label={t("orderDate")} value={purchase.date} />
          <DetailLine label={t("dueDate")} value={purchase.dueDate ?? ""} />
          <DetailLine label={t("deliveryDate")} value={purchase.deliveryDate ?? ""} />
        </div>
        <div className="space-y-2 text-right">
          <DetailLine label={t("supplierName")} value={purchase.supplierName} />
          <DetailLine label={t("supplierPhone")} value={supplier?.phone ?? ""} />
          <DetailLine
            label={t("supplierTaxNumber")}
            value={supplier?.companyDetails.taxNumber ?? ""}
          />
          <DetailLine label={t("warehouse")} value={purchase.warehouseName} />
        </div>
      </div>

      <table className="mb-8 w-full border-collapse border border-[#0b1738] text-[11.5px]">
        <thead>
          <tr className="bg-[#f1f3f6]">
            <th className="border border-[#0b1738] px-2 py-2 text-right font-bold">
              {t("table.product")}
            </th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">{t("table.sku")}</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">
              {t("table.priceExclTax")}
            </th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">{t("table.tax")}</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">
              {t("table.priceInclTax")}
            </th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">{t("table.qty")}</th>
            <th className="border border-[#0b1738] px-2 py-2 font-bold">{t("table.total")}</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((item) => (
            <tr key={item.id}>
              <td className="border border-[#0b1738] px-2 py-2 text-right">{item.productName}</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">{item.sku}</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">
                {formatMoney(item.netUnitCost, purchase.currency)}
              </td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">{item.taxPercent}%</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">
                {formatMoney(item.netUnitCost * (1 + item.taxPercent / 100), purchase.currency)}
              </td>
              <td className="border border-[#0b1738] px-2 py-2 text-center">{item.qty}</td>
              <td className="border border-[#0b1738] px-2 py-2 text-center font-semibold">
                {formatMoney(lineItemSubtotal(item), purchase.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-[95mm] space-y-2.5">
          <TotalLine
            label={t("subtotalBeforeTax")}
            value={formatMoney(subtotal, purchase.currency)}
          />
          <TotalLine label={t("taxAmount")} value={formatMoney(itemsTax, purchase.currency)} />
          {purchase.orderTaxPercent > 0 ? (
            <TotalLine
              label={t("orderTax", { pct: purchase.orderTaxPercent })}
              value={formatMoney(orderTax, purchase.currency)}
            />
          ) : null}
          {purchase.discountAmount > 0 ? (
            <TotalLine
              label={t("orderDiscount")}
              value={`-${formatMoney(purchase.discountAmount, purchase.currency)}`}
            />
          ) : null}
          {purchase.shippingAmount > 0 ? (
            <TotalLine
              label={t("shipping")}
              value={formatMoney(purchase.shippingAmount, purchase.currency)}
            />
          ) : null}
          {purchase.otherCosts > 0 ? (
            <TotalLine
              label={t("otherCosts")}
              value={formatMoney(purchase.otherCosts, purchase.currency)}
            />
          ) : null}
          <TotalLine
            label={t("grandTotal")}
            value={formatMoney(grandTotal, purchase.currency)}
            emphasized
          />
        </div>
      </div>

      {purchase.note ? (
        <div className="mt-6 border-t border-[#e1e7f0] pt-4">
          <p className="text-[11px] font-semibold text-[#95a4bd]">{t("notes")}</p>
          <p className="mt-1 text-[12px]">{purchase.note}</p>
        </div>
      ) : null}
    </div>
  )
}
