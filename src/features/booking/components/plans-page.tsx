"use client"

// Packages (a number of visits paid for ahead) and memberships (visits without a count, for a
// length of time): what is on sale, selling one to a customer, and what customers hold.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog, AppInput } from "@/components/app"

import { useBookingAccess, useBookingError, useBookingFormat, useLoad } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type { BookingPlan, BookingPlanInput } from "../types/booking.types"
import { BookingPage, Choice, Empty, LoadFailed, Loading } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  ICON_BUTTON,
  MUTED,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TH,
} from "./styles"

const BLANK: BookingPlanInput = {
  kind: "package",
  name: "",
  description: null,
  price: 0,
  uses: 5,
  validityDays: 90,
  serviceIds: [],
  isActive: true,
}

export function BookingPlansPage() {
  const t = useTranslations("booking.plans")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const data = useLoad(
    () =>
      Promise.all([
        bookingService.plans(),
        bookingService.customerPlans(),
        bookingService.services(),
      ]).then(([plans, held, services]) => ({ plans, held, services })),
    []
  )
  const [editing, setEditing] = useState<{ id: string | null; draft: BookingPlanInput } | null>(
    null
  )
  const [selling, setSelling] = useState<{ plan: BookingPlan; name: string; phone: string } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const draft = editing?.draft
  const set = <K extends keyof BookingPlanInput>(key: K, value: BookingPlanInput[K]) =>
    setEditing((current) =>
      current ? { ...current, draft: { ...current.draft, [key]: value } } : current
    )

  const act = async (work: () => Promise<unknown>, done: string, close: () => void) => {
    setBusy(true)
    try {
      await work()
      toast.success(done)
      close()
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  const covers = (ids: string[]) =>
    ids.length === 0
      ? t("allServices")
      : (data.data?.services ?? [])
          .filter((service) => ids.includes(service.id))
          .map((service) => service.name)
          .join("، ")

  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <button
            type="button"
            className={PRIMARY_BUTTON}
            onClick={() => setEditing({ id: null, draft: BLANK })}
          >
            <Plus className="size-4" />
            {t("add")}
          </button>
        ) : null
      }
    >
      {data.failed ? (
        <LoadFailed onRetry={data.reload} />
      ) : data.data === null ? (
        <Loading />
      ) : data.data.plans.length === 0 ? (
        <div className={PANEL}>
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.data.plans.map((plan) => (
              <article key={plan.id} className={cn(PANEL, "flex flex-col gap-3 p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-[11.5px] font-bold text-[#6d28d9]">
                      {t(`kinds.${plan.kind}`)}
                    </span>
                    <p className="mt-2 truncate text-[16px] font-extrabold text-[#0b1738]">
                      {plan.name}
                    </p>
                  </div>
                  <p className="shrink-0 text-[17px] font-extrabold text-[#6d28d9]">
                    {format.money(plan.price)}
                  </p>
                </div>
                <p className="text-[13px] leading-6 text-[#3b4a66]">
                  {plan.uses === null ? t("unlimited") : t("visits", { count: plan.uses })}
                  {" · "}
                  {t("validFor", { count: plan.validityDays })}
                  <span className={cn("block", MUTED)}>{covers(plan.serviceIds)}</span>
                </p>
                {canManage ? (
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(SECONDARY_BUTTON, "flex-1 text-[#6d28d9]")}
                      disabled={!plan.isActive}
                      onClick={() => setSelling({ plan, name: "", phone: "" })}
                    >
                      <ShoppingBag className="size-4" />
                      {t("sell")}
                    </button>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={t("edit")}
                      title={t("edit")}
                      onClick={() => {
                        const { id, ...rest } = plan
                        setEditing({ id, draft: rest })
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={cn(ICON_BUTTON, "text-[#b42318]")}
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() =>
                        void act(
                          () => bookingService.removePlan(plan.id),
                          t("removed"),
                          () => undefined
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className={cn(PANEL, "overflow-hidden")}>
            <h2 className="px-5 pt-4 text-[16px] font-extrabold text-[#0b1738]">
              {t("held.title")}
            </h2>
            {data.data.held.length === 0 ? (
              <Empty>{t("held.empty")}</Empty>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr>
                      <th className={TH}>{t("held.customer")}</th>
                      <th className={TH}>{t("held.plan")}</th>
                      <th className={TH}>{t("held.left")}</th>
                      <th className={TH}>{t("held.until")}</th>
                      <th className={TH}>{t("held.state")}</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.held.map((held) => (
                      <tr key={held.id} className="border-b border-[#eef1f6]">
                        <td className={TD}>
                          <span className="block font-semibold">{held.customerName}</span>
                          {held.customerPhone ? (
                            <span className={cn("block text-[12.5px]", MUTED)} dir="ltr">
                              {held.customerPhone}
                            </span>
                          ) : null}
                        </td>
                        <td className={TD}>{held.planName}</td>
                        <td className={TD}>
                          {held.usesLeft === null
                            ? t("unlimited")
                            : t("held.leftOf", { left: held.usesLeft, total: held.usesTotal ?? 0 })}
                        </td>
                        <td className={TD}>{format.day(held.expiresOn, "short")}</td>
                        <td className={TD}>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                              held.usable
                                ? "bg-[#e7f8ee] text-[#137a41]"
                                : "bg-[#f1f4f9] text-[#667085]"
                            )}
                          >
                            {held.usable
                              ? t("held.usable")
                              : held.status === "cancelled"
                                ? t("held.cancelled")
                                : t("held.finished")}
                          </span>
                        </td>
                        <td className={TD}>
                          {canManage && held.status === "active" ? (
                            <button
                              type="button"
                              className="text-[12.5px] font-semibold text-[#b42318]"
                              onClick={() =>
                                void act(
                                  () => bookingService.cancelCustomerPlan(held.id),
                                  t("held.cancelledDone"),
                                  () => undefined
                                )
                              }
                            >
                              {t("held.cancel")}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <AppDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setEditing(null)
        }}
        title={editing?.id ? t("editTitle") : t("addTitle")}
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !draft?.name.trim()}
              onClick={() => {
                if (!editing) return
                const input = {
                  ...editing.draft,
                  name: editing.draft.name.trim(),
                  uses: editing.draft.kind === "membership" ? null : (editing.draft.uses ?? 1),
                }
                void act(
                  () =>
                    editing.id
                      ? bookingService.updatePlan(editing.id, input)
                      : bookingService.createPlan(input),
                  t("saved"),
                  () => setEditing(null)
                )
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={FIELD_LABEL}>{t("form.kind")}</span>
              <Choice
                value={draft.kind}
                onChange={(next) => set("kind", next as "package" | "membership")}
                ariaLabel={t("form.kind")}
                options={[
                  { value: "package", label: t("kinds.package"), hint: t("form.packageHint") },
                  {
                    value: "membership",
                    label: t("kinds.membership"),
                    hint: t("form.membershipHint"),
                  },
                ]}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="plan-name">
                {t("form.name")}
              </label>
              <AppInput
                id="plan-name"
                className={FIELD}
                maxLength={120}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="plan-price">
                {t("form.price")}
              </label>
              <AppInput
                id="plan-price"
                type="number"
                inputMode="decimal"
                min={0}
                className={FIELD}
                value={draft.price}
                onChange={(event) => set("price", Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
            {draft.kind === "package" ? (
              <div>
                <label className={FIELD_LABEL} htmlFor="plan-uses">
                  {t("form.uses")}
                </label>
                <AppInput
                  id="plan-uses"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className={FIELD}
                  value={draft.uses ?? 1}
                  onChange={(event) =>
                    set("uses", Math.max(1, Math.round(Number(event.target.value) || 1)))
                  }
                />
              </div>
            ) : null}
            <div>
              <label className={FIELD_LABEL} htmlFor="plan-days">
                {t("form.days")}
              </label>
              <AppInput
                id="plan-days"
                type="number"
                inputMode="numeric"
                min={1}
                className={FIELD}
                value={draft.validityDays}
                onChange={(event) =>
                  set("validityDays", Math.max(1, Math.round(Number(event.target.value) || 1)))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <span className={FIELD_LABEL}>{t("form.services")}</span>
              <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("form.servicesHint")}</p>
              <div className="flex flex-wrap gap-2">
                {(data.data?.services ?? []).map((service) => {
                  const on = draft.serviceIds.includes(service.id)
                  return (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set(
                          "serviceIds",
                          on
                            ? draft.serviceIds.filter((id) => id !== service.id)
                            : [...draft.serviceIds, service.id]
                        )
                      }
                      className={cn(
                        "h-10 rounded-full border px-4 text-[13px] font-semibold transition",
                        on
                          ? "border-[#6d28d9] bg-[#f5f3ff] text-[#6d28d9]"
                          : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#6d28d9]/40"
                      )}
                    >
                      {service.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={selling !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setSelling(null)
        }}
        title={selling ? t("sellTitle", { name: selling.plan.name }) : ""}
        description={
          selling ? t("sellHint", { amount: format.money(selling.plan.price) }) : undefined
        }
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setSelling(null)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !selling?.name.trim()}
              onClick={() => {
                if (!selling) return
                void act(
                  () =>
                    bookingService.sellPlan({
                      planId: selling.plan.id,
                      customerName: selling.name.trim(),
                      customerPhone: selling.phone.trim() || null,
                    }),
                  t("sold"),
                  () => setSelling(null)
                )
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("confirmSell")}
            </button>
          </>
        }
      >
        {selling ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL} htmlFor="sell-name">
                {t("customerName")}
              </label>
              <AppInput
                id="sell-name"
                className={FIELD}
                maxLength={120}
                value={selling.name}
                onChange={(event) => setSelling({ ...selling, name: event.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="sell-phone">
                {t("customerPhone")}
              </label>
              <AppInput
                id="sell-phone"
                className={FIELD}
                dir="ltr"
                inputMode="tel"
                maxLength={30}
                placeholder="05xxxxxxxx"
                value={selling.phone}
                onChange={(event) => setSelling({ ...selling, phone: event.target.value })}
              />
              <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("phoneHint")}</p>
            </div>
          </div>
        ) : null}
      </AppDialog>
    </BookingPage>
  )
}
