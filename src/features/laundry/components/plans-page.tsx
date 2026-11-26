"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import {
  type LaundryPlan,
  laundryService,
  type LaundrySubscription,
} from "../services/laundry.service"
import {
  Choice,
  errorText,
  FIELD,
  HEADING,
  LABEL,
  LaundryPage,
  Loading,
  MUTED,
  PANEL,
  PRIMARY,
  SECONDARY,
  useLaundryAccess,
  useTx,
} from "./shell"

// Laundry subscriptions: plans of so many pieces for a price (sold with a tax invoice), and the
// customers who have one, with the pieces they have left.
export function LaundryPlansPage() {
  const { tx, ar, money, dateTime } = useTx()
  const { canManage } = useLaundryAccess()
  const [plans, setPlans] = useState<LaundryPlan[] | null>(null)
  const [subscriptions, setSubscriptions] = useState<LaundrySubscription[]>([])
  const [methods, setMethods] = useState<Array<{ code: string; name: string }>>([])
  const [form, setForm] = useState({ name: "", pieces: "30", price: "", validDays: "30" })
  const [sell, setSell] = useState({ planId: "", phone: "", name: "", method: "" })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void laundryService.plans().then(setPlans)
    void laundryService.subscriptions().then(setSubscriptions)
    void laundryService.paymentMethods().then((items) => {
      setMethods(items)
      setSell((current) => ({ ...current, method: items[0]?.code ?? "" }))
    })
  }, [])

  async function addPlan() {
    if (!form.name.trim() || !Number(form.pieces) || form.price === "") return
    setBusy(true)
    try {
      setPlans(
        await laundryService.savePlan(null, {
          name: form.name.trim(),
          pieces: Number(form.pieces),
          price: Number(form.price),
          validDays: Number(form.validDays) || 30,
        })
      )
      setForm({ name: "", pieces: "30", price: "", validDays: "30" })
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setBusy(false)
    }
  }

  async function sellPlan() {
    if (!sell.planId || !sell.phone.trim() || !sell.method) {
      toast.error(tx("اختر الباقة وأدخل جوال العميل.", "Choose a plan and enter the mobile."))
      return
    }
    setBusy(true)
    try {
      const created = await laundryService.sellSubscription({
        planId: sell.planId,
        customerPhone: sell.phone.trim(),
        customerName: sell.name.trim() || null,
        paymentMethodCode: sell.method,
      })
      setSubscriptions((current) => [created, ...current])
      setSell((current) => ({ ...current, phone: "", name: "" }))
      toast.success(
        tx(
          `بيع الاشتراك · فاتورة ${created.invoiceNumber ?? ""}`,
          `Plan sold · invoice ${created.invoiceNumber ?? ""}`
        )
      )
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setBusy(false)
    }
  }

  return (
    <LaundryPage
      title={tx("الاشتراكات", "Subscriptions")}
      subtitle={tx(
        "باقات بعدد قطع شهري. تُخصم القطع تلقائيًا من طلبات العميل.",
        "Plans with a number of pieces. Pieces come off the customer's orders automatically."
      )}
    >
      {!plans ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={cn(PANEL, "flex flex-col gap-3 p-4")}>
            <h2 className={cn("text-[14px] font-bold", HEADING)}>{tx("الباقات", "Plans")}</h2>
            {plans.length === 0 ? (
              <p className={cn("text-[12.5px]", MUTED)}>
                {tx("لا توجد باقات بعد.", "No plans yet.")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {plans.map((plan) => (
                  <li
                    key={plan.id}
                    className="flex items-center justify-between rounded-[12px] border border-[#eef2f8] p-3 text-[13px]"
                  >
                    <span className={cn("font-bold", HEADING)}>{plan.name}</span>
                    <span className={MUTED}>
                      {plan.pieces} {tx("قطعة", "pcs")} · {money(plan.price)} · {plan.validDays}{" "}
                      {tx("يوم", "days")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <div className="grid grid-cols-2 gap-2 border-t border-[#eef2f8] pt-3">
                <label className="col-span-2 block">
                  <span className={LABEL}>{tx("اسم الباقة", "Plan name")}</span>
                  <input
                    className={FIELD}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder={tx("مثال: الباقة الشهرية", "e.g. Monthly")}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>{tx("عدد القطع", "Pieces")}</span>
                  <input
                    type="number"
                    className={FIELD}
                    value={form.pieces}
                    onChange={(event) => setForm({ ...form, pieces: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>{tx("السعر (ر.س)", "Price (SAR)")}</span>
                  <input
                    type="number"
                    className={FIELD}
                    value={form.price}
                    onChange={(event) => setForm({ ...form, price: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>{tx("الصلاحية (أيام)", "Valid for (days)")}</span>
                  <input
                    type="number"
                    className={FIELD}
                    value={form.validDays}
                    onChange={(event) => setForm({ ...form, validDays: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className={cn(SECONDARY, "self-end")}
                  disabled={busy}
                  onClick={() => void addPlan()}
                >
                  <Plus className="size-4" />
                  {tx("إضافة باقة", "Add plan")}
                </button>
              </div>
            ) : null}
          </section>

          {canManage ? (
            <section className={cn(PANEL, "flex flex-col gap-3 p-4")}>
              <h2 className={cn("text-[14px] font-bold", HEADING)}>
                {tx("بيع اشتراك لعميل", "Sell a plan")}
              </h2>
              <Choice
                value={sell.planId}
                onChange={(next) => setSell({ ...sell, planId: next })}
                placeholder={tx("اختر الباقة", "Choose a plan")}
                options={plans
                  .filter((plan) => plan.active)
                  .map((plan) => ({
                    value: plan.id,
                    label: `${plan.name} — ${money(plan.price)}`,
                  }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={FIELD}
                  dir="ltr"
                  value={sell.phone}
                  onChange={(event) => setSell({ ...sell, phone: event.target.value })}
                  placeholder="05XXXXXXXX"
                />
                <input
                  className={FIELD}
                  value={sell.name}
                  onChange={(event) => setSell({ ...sell, name: event.target.value })}
                  placeholder={tx("اسم العميل", "Name")}
                />
              </div>
              <Choice
                value={sell.method}
                onChange={(next) => setSell({ ...sell, method: next })}
                ariaLabel={tx("طريقة الدفع", "Payment method")}
                options={methods.map((entry) => ({ value: entry.code, label: entry.name }))}
              />
              <button
                type="button"
                className={PRIMARY}
                disabled={busy}
                onClick={() => void sellPlan()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {tx("بيع وإصدار الفاتورة", "Sell and invoice")}
              </button>
            </section>
          ) : null}

          <section className={cn(PANEL, "overflow-x-auto p-4 lg:col-span-2")}>
            <h2 className={cn("mb-3 text-[14px] font-bold", HEADING)}>
              {tx("المشتركون", "Subscribers")}
            </h2>
            {subscriptions.length === 0 ? (
              <p className={cn("text-[12.5px]", MUTED)}>
                {tx("لا يوجد مشتركون بعد.", "No subscribers yet.")}
              </p>
            ) : (
              <table className="w-full min-w-[600px] text-[13px]">
                <thead>
                  <tr className={cn("border-b border-[#eef2f8] text-[12px]", MUTED)}>
                    <th className="py-2 text-start">{tx("العميل", "Customer")}</th>
                    <th className="py-2 text-start">{tx("الباقة", "Plan")}</th>
                    <th className="py-2 text-start">{tx("المتبقي", "Left")}</th>
                    <th className="py-2 text-start">{tx("ينتهي", "Ends")}</th>
                    <th className="py-2 text-start">{tx("الفاتورة", "Invoice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((entry) => (
                    <tr key={entry.id} className="border-b border-[#f3f5f9]">
                      <td className={cn("py-2 font-semibold", HEADING)}>
                        {entry.customerName ?? "—"}
                      </td>
                      <td className={HEADING}>{entry.planName}</td>
                      <td className={entry.active ? "font-bold text-[#047857]" : MUTED}>
                        {entry.piecesLeft} / {entry.piecesTotal}
                      </td>
                      <td className={MUTED}>{dateTime(entry.endsAt)}</td>
                      <td className={MUTED}>{entry.invoiceNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </LaundryPage>
  )
}
