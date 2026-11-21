"use client"

// Rooms and equipment: what a service cannot be given without, and how many of each the business
// has. A service is tied to them in its own form; a time is then offered only while one is free.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppDialog, AppInput, AppSwitch } from "@/components/app"

import { useBookingAccess, useBookingError, useLoad } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type { BookingResourceInput } from "../types/booking.types"
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

const BLANK: BookingResourceInput = { name: "", kind: "room", quantity: 1, isActive: true }

export function BookingResourcesPage() {
  const t = useTranslations("booking.resources")
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const data = useLoad(
    () =>
      Promise.all([bookingService.resources(), bookingService.services()]).then(
        ([resources, services]) => ({ resources, services })
      ),
    []
  )
  const [editing, setEditing] = useState<{ id: string | null; draft: BookingResourceInput } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const draft = editing?.draft
  const set = <K extends keyof BookingResourceInput>(key: K, value: BookingResourceInput[K]) =>
    setEditing((current) =>
      current ? { ...current, draft: { ...current.draft, [key]: value } } : current
    )
  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await work()
      toast.success(done)
      setEditing(null)
      data.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

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
      <div className={cn(PANEL, "overflow-hidden")}>
        {data.failed ? (
          <LoadFailed onRetry={data.reload} />
        ) : data.data === null ? (
          <Loading />
        ) : data.data.resources.length === 0 ? (
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("name")}</th>
                  <th className={TH}>{t("kind")}</th>
                  <th className={TH}>{t("quantity")}</th>
                  <th className={TH}>{t("usedBy")}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {data.data.resources.map((resource) => {
                  const users = (data.data?.services ?? [])
                    .filter((service) => service.resourceIds.includes(resource.id))
                    .map((service) => service.name)
                  return (
                    <tr key={resource.id} className="border-b border-[#eef1f6]">
                      <td className={cn(TD, "font-bold")}>
                        {resource.name}
                        {resource.isActive ? null : (
                          <span className="ms-2 rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-bold text-[#667085]">
                            {t("stopped")}
                          </span>
                        )}
                      </td>
                      <td className={TD}>{t(`kinds.${resource.kind}`)}</td>
                      <td className={TD}>{resource.quantity}</td>
                      <td className={cn(TD, users.length ? "" : MUTED)}>
                        {users.length ? users.join("، ") : t("unused")}
                      </td>
                      <td className={TD}>
                        {canManage ? (
                          <span className="flex justify-end gap-2">
                            <button
                              type="button"
                              className={ICON_BUTTON}
                              aria-label={t("edit")}
                              title={t("edit")}
                              onClick={() => {
                                const { id, ...rest } = resource
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
                                  () => bookingService.removeResource(resource.id),
                                  t("removed")
                                )
                              }
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppDialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setEditing(null)
        }}
        title={editing?.id ? t("editTitle") : t("addTitle")}
        description={t("formHint")}
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
                const input = { ...editing.draft, name: editing.draft.name.trim() }
                void act(
                  () =>
                    editing.id
                      ? bookingService.updateResource(editing.id, input)
                      : bookingService.createResource(input),
                  t("saved")
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
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="resource-name">
                {t("name")}
              </label>
              <AppInput
                id="resource-name"
                className={FIELD}
                maxLength={120}
                placeholder={t("namePlaceholder")}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("kind")}</span>
              <Choice
                value={draft.kind}
                onChange={(next) => set("kind", next as "room" | "equipment")}
                ariaLabel={t("kind")}
                options={[
                  { value: "room", label: t("kinds.room") },
                  { value: "equipment", label: t("kinds.equipment") },
                ]}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="resource-quantity">
                {t("quantity")}
              </label>
              <AppInput
                id="resource-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                className={FIELD}
                value={draft.quantity}
                onChange={(event) =>
                  set("quantity", Math.max(1, Math.round(Number(event.target.value) || 1)))
                }
              />
            </div>
            <label className="flex items-center gap-3 sm:col-span-2">
              <AppSwitch
                checked={draft.isActive}
                aria-label={t("inUse")}
                onCheckedChange={(on) => set("isActive", on)}
              />
              <span className="text-[13.5px] font-semibold text-[#0b1738]">{t("inUse")}</span>
            </label>
          </div>
        ) : null}
      </AppDialog>
    </BookingPage>
  )
}
