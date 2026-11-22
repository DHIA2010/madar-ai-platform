"use client"

// What the business offers: each service's length, price, the free minutes it keeps after
// itself, how many people share one slot, and whether customers can book it themselves.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Link2, Loader2, PackagePlus, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppConfirmDialog, AppDialog, AppInput, AppSwitch } from "@/components/app"

import { useBookingAccess, useBookingError, useBookingFormat, useLoad } from "../hooks/use-booking"
import { bookingService } from "../services/booking.service"
import type {
  BookingServiceInput,
  BookingServiceItem,
  ServiceAddon,
  ServiceOption,
} from "../types/booking.types"
import { ImageField } from "./image-field"
import { BookingPage, Empty, LoadFailed, Loading } from "./shell"
import {
  FIELD,
  FIELD_LABEL,
  ICON_BUTTON,
  MUTED,
  PALETTE,
  PANEL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TD,
  TEXTAREA,
  TH,
} from "./styles"

const BLANK: BookingServiceInput = {
  name: "",
  description: null,
  category: null,
  durationMinutes: 30,
  price: 0,
  bufferMinutes: 0,
  capacity: 1,
  color: PALETTE[0],
  imageUrl: null,
  visibility: "published",
  isActive: true,
  options: [],
  addons: [],
  bundleServiceIds: [],
  resourceIds: [],
}

export function BookingServicesPage() {
  const t = useTranslations("booking.services")
  const format = useBookingFormat()
  const errorText = useBookingError()
  const { canManage } = useBookingAccess()
  const services = useLoad(() => bookingService.services(), [])
  const resources = useLoad(() => bookingService.resources(), [])
  const [editing, setEditing] = useState<{ id: string | null; draft: BookingServiceInput } | null>(
    null
  )
  const [removing, setRemoving] = useState<BookingServiceItem | null>(null)
  const [busy, setBusy] = useState(false)
  // What the business already sells from the cashier and is not a booking service yet: brought in
  // with one press instead of being typed again. Products saved as "service" are suggested; the
  // rest can be picked by hand, since many businesses keep their services as ordinary products.
  const products = useLoad(() => bookingService.linkableProducts().catch(() => []), [])
  const [importing, setImporting] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const offered = products.data ?? []
  const suggested = offered.filter((product) => product.isService)
  const wanted = search.trim().toLowerCase()
  const shown = wanted
    ? offered.filter((product) =>
        [product.name, product.category ?? ""].some((value) => value.toLowerCase().includes(wanted))
      )
    : offered
  const openImport = () => {
    setChosen(suggested.map((product) => product.id))
    setSearch("")
    setImporting(true)
  }

  const bringIn = async () => {
    setBusy(true)
    try {
      const made = await bookingService.importProducts(chosen)
      toast.success(t("import.done", { count: made.length }))
      setImporting(false)
      setChosen([])
      services.reload()
      products.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof BookingServiceInput>(key: K, value: BookingServiceInput[K]) =>
    setEditing((current) =>
      current ? { ...current, draft: { ...current.draft, [key]: value } } : current
    )
  const whole = (value: string, least: number) => Math.max(least, Math.round(Number(value) || 0))

  const save = async () => {
    if (!editing || !editing.draft.name.trim()) return
    setBusy(true)
    try {
      const draft = {
        ...editing.draft,
        name: editing.draft.name.trim(),
        // A row left without a name was never meant.
        options: editing.draft.options.filter((option) => option.name.trim()),
        addons: editing.draft.addons.filter((addon) => addon.name.trim()),
      }
      if (editing.id) await bookingService.updateService(editing.id, draft)
      else await bookingService.createService(draft)
      toast.success(t("saved"))
      setEditing(null)
      services.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await bookingService.removeService(removing.id)
      toast.success(t("removed"))
      setRemoving(null)
      services.reload()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const draft = editing?.draft
  const changeOption = (index: number, patch: Partial<ServiceOption>) =>
    set(
      "options",
      (draft?.options ?? []).map((option, position) =>
        position === index ? { ...option, ...patch } : option
      )
    )
  const changeAddon = (index: number, patch: Partial<ServiceAddon>) =>
    set(
      "addons",
      (draft?.addons ?? []).map((addon, position) =>
        position === index ? { ...addon, ...patch } : addon
      )
    )
  // The other services a bundle can be made of.
  const others = (services.data ?? []).filter(
    (service) => service.id !== editing?.id && service.bundleServiceIds.length === 0
  )
  const SMALL = cn(FIELD, "h-10")
  const amount = (value: string) => Math.max(0, Number(value) || 0)
  // One editable row of an option or an add-on: its name, two figures, and a remove button.
  const row = (
    key: string,
    name: { value: string; label: string; onChange: (next: string) => void },
    figures: Array<{
      value: number
      label: string
      step?: number
      onChange: (next: string) => void
    }>,
    onRemove: () => void
  ) => (
    <div key={key} className="flex flex-wrap items-center gap-2">
      <AppInput
        className={cn(SMALL, "min-w-[140px] flex-1")}
        maxLength={80}
        placeholder={name.label}
        aria-label={name.label}
        value={name.value}
        onChange={(event) => name.onChange(event.target.value)}
      />
      {figures.map((figure) => (
        <label key={figure.label} className="flex items-center gap-1.5 text-[12px] text-[#52607a]">
          {figure.label}
          <AppInput
            type="number"
            inputMode="decimal"
            min={0}
            step={figure.step ?? 1}
            className={cn(SMALL, "w-[84px]")}
            value={figure.value}
            onChange={(event) => figure.onChange(event.target.value)}
          />
        </label>
      ))}
      <button
        type="button"
        aria-label={t("form.removeRow")}
        className="flex size-10 items-center justify-center rounded-[10px] text-[#b42318] hover:bg-[#fef3f2]"
        onClick={onRemove}
      >
        <X className="size-4" />
      </button>
    </div>
  )
  return (
    <BookingPage
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => setEditing({ id: null, draft: BLANK })}
            >
              <Plus className="size-4" />
              {t("add")}
            </button>
            {offered.length > 0 ? (
              <button type="button" className={SECONDARY_BUTTON} onClick={openImport}>
                <PackagePlus className="size-4" />
                {t("import.button")}
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      {canManage && suggested.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[#ddd6fe] bg-[#f5f3ff] px-4 py-3">
          <PackagePlus className="size-5 shrink-0 text-[#6d28d9]" />
          <p className="min-w-0 flex-1 text-[13.5px] leading-6 text-[#4c1d95]">
            {t("import.notice", { count: suggested.length })}
          </p>
          <button type="button" className={PRIMARY_BUTTON} onClick={openImport}>
            {t("import.open")}
          </button>
        </div>
      ) : null}
      <div className={cn(PANEL, "overflow-hidden")}>
        {services.failed ? (
          <LoadFailed onRetry={services.reload} />
        ) : services.data === null ? (
          <Loading />
        ) : services.data.length === 0 ? (
          <Empty title={t("emptyTitle")}>{t("emptyHint")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>{t("columns.name")}</th>
                  <th className={TH}>{t("columns.duration")}</th>
                  <th className={TH}>{t("columns.price")}</th>
                  <th className={TH}>{t("columns.capacity")}</th>
                  <th className={TH}>{t("columns.shown")}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {services.data.map((service) => (
                  <tr key={service.id} className="border-b border-[#eef1f6]">
                    <td className={TD}>
                      <span className="flex items-center gap-2.5">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: service.color ?? "#6d28d9" }}
                        />
                        <span className="min-w-0">
                          <span className="block font-bold">{service.name}</span>
                          {service.productId ? (
                            <span className="flex items-center gap-1 text-[12px] font-semibold text-[#067647]">
                              <Link2 className="size-3.5" />
                              {t("import.linked")}
                            </span>
                          ) : null}
                          {service.category ? (
                            <span className={cn("block text-[12px]", MUTED)}>
                              {service.category}
                            </span>
                          ) : null}
                          {service.options.length + service.addons.length > 0 ||
                          service.bundleServiceIds.length > 0 ? (
                            <span className="block text-[12px] text-[#6d28d9]">
                              {[
                                service.bundleServiceIds.length > 0 ? t("bundleTag") : null,
                                service.options.length > 0
                                  ? t("optionsTag", { count: service.options.length })
                                  : null,
                                service.addons.length > 0
                                  ? t("addonsTag", { count: service.addons.length })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className={TD}>
                      {format.duration(service.durationMinutes)}
                      {service.bufferMinutes ? (
                        <span className={cn("block text-[12px]", MUTED)}>
                          {t("bufferAfter", { time: format.duration(service.bufferMinutes) })}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>{format.money(service.price)}</td>
                    <td className={TD}>
                      {service.capacity > 1 ? t("group", { count: service.capacity }) : t("single")}
                    </td>
                    <td className={TD}>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                          !service.isActive
                            ? "bg-[#f1f4f9] text-[#667085]"
                            : service.visibility === "published"
                              ? "bg-[#e7f8ee] text-[#137a41]"
                              : "bg-[#fff7e6] text-[#b54708]"
                        )}
                      >
                        {!service.isActive ? t("stopped") : t(`visibility.${service.visibility}`)}
                      </span>
                    </td>
                    <td className={TD}>
                      {canManage ? (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={t("edit", { name: service.name })}
                            onClick={() => {
                              const { id, ...rest } = service
                              setEditing({ id, draft: rest })
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(ICON_BUTTON, "text-[#b42318]")}
                            aria-label={t("remove", { name: service.name })}
                            onClick={() => setRemoving(service)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
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
        footer={
          <>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !draft?.name.trim()}
              onClick={() => void save()}
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
              <label className={FIELD_LABEL} htmlFor="service-name">
                {t("form.name")}
              </label>
              <AppInput
                id="service-name"
                className={FIELD}
                maxLength={120}
                placeholder={t("form.namePlaceholder")}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="service-duration">
                {t("form.duration")}
              </label>
              <AppInput
                id="service-duration"
                type="number"
                inputMode="numeric"
                min={5}
                step={5}
                className={FIELD}
                value={draft.durationMinutes}
                onChange={(event) => set("durationMinutes", whole(event.target.value, 0))}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="service-price">
                {t("form.price")}
              </label>
              <AppInput
                id="service-price"
                type="number"
                inputMode="decimal"
                min={0}
                className={FIELD}
                value={draft.price}
                onChange={(event) => set("price", Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="service-buffer">
                {t("form.buffer")}
              </label>
              <AppInput
                id="service-buffer"
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                className={FIELD}
                value={draft.bufferMinutes}
                onChange={(event) => set("bufferMinutes", whole(event.target.value, 0))}
              />
              <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("form.bufferHint")}</p>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="service-capacity">
                {t("form.capacity")}
              </label>
              <AppInput
                id="service-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                className={FIELD}
                value={draft.capacity}
                onChange={(event) => set("capacity", whole(event.target.value, 1))}
              />
              <p className={cn("mt-1 text-[12px] leading-5", MUTED)}>{t("form.capacityHint")}</p>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="service-category">
                {t("form.category")}
              </label>
              <AppInput
                id="service-category"
                className={FIELD}
                maxLength={60}
                value={draft.category ?? ""}
                onChange={(event) => set("category", event.target.value || null)}
              />
            </div>
            <div>
              <span className={FIELD_LABEL}>{t("form.color")}</span>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    aria-pressed={draft.color === color}
                    onClick={() => set("color", color)}
                    className={cn(
                      "size-9 rounded-full ring-offset-2 transition",
                      draft.color === color && "ring-2 ring-[#0b1738]"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={FIELD_LABEL} htmlFor="service-description">
                {t("form.description")}
              </label>
              <textarea
                id="service-description"
                rows={2}
                maxLength={600}
                className={TEXTAREA}
                value={draft.description ?? ""}
                onChange={(event) => set("description", event.target.value || null)}
              />
            </div>
            <div className="sm:col-span-2">
              <span className={FIELD_LABEL}>{t("form.image")}</span>
              <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("form.imageHint")}</p>
              <ImageField
                className="max-w-[360px]"
                label={t("form.image")}
                value={draft.imageUrl}
                onChange={(next) => set("imageUrl", next)}
              />
            </div>
            <div className="sm:col-span-2">
              <span className={FIELD_LABEL}>{t("form.options")}</span>
              <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("form.optionsHint")}</p>
              <div className="space-y-2">
                {draft.options.map((option, index) =>
                  row(
                    option.id ?? `new-${index}`,
                    {
                      value: option.name,
                      label: t("form.optionName"),
                      onChange: (name) => changeOption(index, { name }),
                    },
                    [
                      {
                        value: option.durationMinutes,
                        label: t("form.minutesShort"),
                        step: 5,
                        onChange: (value) =>
                          changeOption(index, { durationMinutes: whole(value, 0) }),
                      },
                      {
                        value: option.price,
                        label: t("form.priceShort"),
                        onChange: (value) => changeOption(index, { price: amount(value) }),
                      },
                    ],
                    () =>
                      set(
                        "options",
                        draft.options.filter((_, position) => position !== index)
                      )
                  )
                )}
              </div>
              <button
                type="button"
                className="mt-2 text-[12.5px] font-semibold text-[#6d28d9]"
                onClick={() =>
                  set("options", [
                    ...draft.options,
                    { name: "", durationMinutes: draft.durationMinutes, price: draft.price },
                  ])
                }
              >
                {t("form.addOption")}
              </button>
            </div>

            <div className="sm:col-span-2">
              <span className={FIELD_LABEL}>{t("form.addons")}</span>
              <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("form.addonsHint")}</p>
              <div className="space-y-2">
                {draft.addons.map((addon, index) =>
                  row(
                    addon.id ?? `new-${index}`,
                    {
                      value: addon.name,
                      label: t("form.addonName"),
                      onChange: (name) => changeAddon(index, { name }),
                    },
                    [
                      {
                        value: addon.price,
                        label: t("form.priceShort"),
                        onChange: (value) => changeAddon(index, { price: amount(value) }),
                      },
                      {
                        value: addon.extraMinutes,
                        label: t("form.extraShort"),
                        step: 5,
                        onChange: (value) => changeAddon(index, { extraMinutes: whole(value, 0) }),
                      },
                    ],
                    () =>
                      set(
                        "addons",
                        draft.addons.filter((_, position) => position !== index)
                      )
                  )
                )}
              </div>
              <button
                type="button"
                className="mt-2 text-[12.5px] font-semibold text-[#6d28d9]"
                onClick={() =>
                  set("addons", [...draft.addons, { name: "", price: 0, extraMinutes: 0 }])
                }
              >
                {t("form.addAddon")}
              </button>
            </div>

            {(resources.data ?? []).length > 0 ? (
              <div className="sm:col-span-2">
                <span className={FIELD_LABEL}>{t("form.resources")}</span>
                <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("form.resourcesHint")}</p>
                <div className="flex flex-wrap gap-2">
                  {(resources.data ?? []).map((resource) => {
                    const on = draft.resourceIds.includes(resource.id)
                    return (
                      <button
                        key={resource.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set(
                            "resourceIds",
                            on
                              ? draft.resourceIds.filter((id) => id !== resource.id)
                              : [...draft.resourceIds, resource.id]
                          )
                        }
                        className={cn(
                          "h-10 rounded-full border px-4 text-[13px] font-semibold transition",
                          on
                            ? "border-[#6d28d9] bg-[#f5f3ff] text-[#6d28d9]"
                            : "border-[#e1e7f0] bg-white text-[#3b4a66] hover:border-[#6d28d9]/40"
                        )}
                      >
                        {resource.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {others.length > 0 ? (
              <div className="sm:col-span-2">
                <span className={FIELD_LABEL}>{t("form.bundle")}</span>
                <p className={cn("mb-2 text-[12px] leading-5", MUTED)}>{t("form.bundleHint")}</p>
                <div className="flex flex-wrap gap-2">
                  {others.map((service) => {
                    const on = draft.bundleServiceIds.includes(service.id)
                    return (
                      <button
                        key={service.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set(
                            "bundleServiceIds",
                            on
                              ? draft.bundleServiceIds.filter((id) => id !== service.id)
                              : [...draft.bundleServiceIds, service.id]
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
                {draft.bundleServiceIds.length > 1 ? (
                  <button
                    type="button"
                    className="mt-2 text-[12.5px] font-semibold text-[#6d28d9]"
                    onClick={() => {
                      const parts = others.filter((service) =>
                        draft.bundleServiceIds.includes(service.id)
                      )
                      set(
                        "durationMinutes",
                        parts.reduce((total, service) => total + service.durationMinutes, 0)
                      )
                      set(
                        "price",
                        parts.reduce((total, service) => total + service.price, 0)
                      )
                    }}
                  >
                    {t("form.bundleSum")}
                  </button>
                ) : null}
              </div>
            ) : null}

            <label className="flex items-start gap-3 sm:col-span-2">
              <AppSwitch
                checked={draft.visibility === "published"}
                onCheckedChange={(on) => set("visibility", on ? "published" : "internal")}
                aria-label={t("form.online")}
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-[#0b1738]">
                  {t("form.online")}
                </span>
                <span className={cn("block text-[12.5px] leading-5", MUTED)}>
                  {t("form.onlineHint")}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 sm:col-span-2">
              <AppSwitch
                checked={draft.isActive}
                onCheckedChange={(on) => set("isActive", on)}
                aria-label={t("form.active")}
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-[#0b1738]">
                  {t("form.active")}
                </span>
                <span className={cn("block text-[12.5px] leading-5", MUTED)}>
                  {t("form.activeHint")}
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={importing}
        onOpenChange={(next) => {
          if (!busy) setImporting(next)
        }}
        title={t("import.title")}
        description={t("import.hint")}
        contentClassName="max-w-[560px]"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy}
              onClick={() => setImporting(false)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || chosen.length === 0}
              onClick={() => void bringIn()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PackagePlus className="size-4" />
              )}
              {t("import.confirm", { count: chosen.length })}
            </button>
          </div>
        }
      >
        <AppInput
          className="mb-3"
          maxLength={80}
          placeholder={t("import.search")}
          aria-label={t("import.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {shown.length === 0 ? (
          <p className={cn("py-6 text-center text-[13px]", MUTED)}>{t("import.none")}</p>
        ) : null}
        <ul className="flex max-h-[46vh] min-h-0 flex-col gap-2 overflow-y-auto">
          {shown.map((product) => {
            const picked = chosen.includes(product.id)
            return (
              <li key={product.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5",
                    picked ? "border-[#c4b5fd] bg-[#f5f3ff]" : "border-[#e1e7f0] bg-white"
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[#6d28d9]"
                    checked={picked}
                    onChange={() =>
                      setChosen((current) =>
                        picked
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id]
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{product.name}</span>
                    <span className={cn("block text-[12px]", MUTED)}>
                      {[
                        product.category,
                        product.isService ? format.duration(product.durationMinutes) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-black text-[#6d28d9]">
                    {format.money(product.price)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </AppDialog>

      <AppConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null)
        }}
        title={removing ? t("removeTitle", { name: removing.name }) : ""}
        description={t("removeHint")}
        confirmLabel={t("confirmRemove")}
        cancelLabel={t("cancel")}
        confirmTone="destructive"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </BookingPage>
  )
}
