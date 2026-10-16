"use client"

// إعدادات الأجهزة -- the hardware a branch's tills talk to.
//
// Redesigned against the Figma Make source (live-visitors file, DevicesSettingsSection /
// GenericDeviceSubView). That source also ships six separate full-page sub-screens per device
// type, each with its own mocked device registry, fake branch filter, and a "اختبار الاتصال" test
// button that always reports success after a canned delay -- a browser cannot actually open a COM
// port, so that flow is not reproduced here. What's real is kept: one filterable table over the
// branch's actual device registry (pos_devices). Selecting a tile filters that same table; "+
// إضافة {نوع}" opens the real add-device page (DeviceForm.tsx), which is the only place settings
// are actually stored per device -- there used to also be a second, disconnected branch-wide
// pos_device_settings screen here, but nothing ever read it (not even a new device's own
// defaults), so it was removed rather than left to imply a config layer that did nothing.
//
// Two layers: a tile per device kind (plus "جميع الأجهزة"), and the full registry of units
// underneath filtered by whichever tile/type/status/search is active.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
  LayoutGrid,
  Loader2,
  Monitor,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  Scale as ScaleIcon,
  Search,
  Trash2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"
import {
  posDevicesService,
  type DeviceConnection,
  type DevicePrinterSettings,
  type DeviceType,
  type PosDevice,
  type PrinterRole,
} from "@/features/pos/services/pos-device-settings.service"

import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

// The Figma source's own tokens, so this page finally matches the rest of the redesigned settings
// section (general settings, payments) rather than the app's older #2878ff.
const PANEL =
  "rounded-2xl border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const HEADING = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"
const FIELD_CLASS =
  "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px] text-[#0d1b3e] placeholder:text-[#8098b4]"
const BLUE_TINT = "bg-[#eff6ff] text-[#2563eb]"

type DeviceFilter = DeviceType | "all"

type DevicesTranslator = ReturnType<typeof useTranslations<"settings.devices">>

const DEVICE_ICON: Record<DeviceType, LucideIcon> = {
  scale: ScaleIcon,
  receipt_printer: Printer,
  barcode_scanner: ScanLine,
  cash_drawer: Inbox,
  customer_display: Monitor,
  card_reader: CreditCard,
}

function deviceLabel(type: DeviceType, t: DevicesTranslator): string {
  return t(`types.${type}.label` as "types.scale.label")
}
function devicePlural(type: DeviceType, t: DevicesTranslator): string {
  return t(`types.${type}.plural` as "types.scale.plural")
}
function deviceAddLabel(type: DeviceType, t: DevicesTranslator): string {
  return t(`types.${type}.addLabel` as "types.scale.addLabel")
}
function printerRoleLabel(role: PrinterRole, t: DevicesTranslator): string {
  return t(`printerRoles.${role}` as "printerRoles.receipt")
}
function connectionLabel(connection: DeviceConnection, t: DevicesTranslator): string {
  return t(`connections.${connection}` as "connections.usb")
}

// Figma's own card order: all devices, then scale / printer / scanner / cash drawer / display /
// card reader.
const TILE_ORDER: DeviceType[] = [
  "scale",
  "receipt_printer",
  "barcode_scanner",
  "cash_drawer",
  "customer_display",
  "card_reader",
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

// "5 minutes ago" from a timestamp. Anything older than a day reads as a date, since the exact
// minute stops mattering.
function lastSeenLabel(value: string | null, t: DevicesTranslator, locale: Locale): string {
  if (!value) return t("lastSeen.never")

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return t("lastSeen.now")
  if (minutes < 60) return relative.format(-minutes, "minute")

  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, "hour")

  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "long",
  }).format(new Date(value))
}

export default function DeviceSettings() {
  const t = useTranslations("settings.devices")
  const tNav = useTranslations("settings.nav")
  const locale = useLocale() as Locale
  const router = useRouter()
  const [devices, setDevices] = useState<PosDevice[]>([])
  const [selectedType, setSelectedType] = useState<DeviceFilter>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all")
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<PosDevice | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setDevices(await posDevicesService.list())
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      setLoadError(status === 403 ? t("loadErrors.forbidden") : t("loadErrors.generic"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const byType = new Map<DeviceType, { total: number; online: number }>()
    for (const device of devices) {
      const entry = byType.get(device.deviceType) ?? { total: 0, online: 0 }
      entry.total += 1
      if (device.online) entry.online += 1
      byType.set(device.deviceType, entry)
    }
    return byType
  }, [devices])

  // The "all devices" tile first (Figma's own order and default selection), one tile per real
  // device kind after it -- all six, including customer displays and card readers, which used to
  // have no tile or settings panel of their own even though the backend already models both.
  const tiles = useMemo(
    () => [
      {
        key: "all" as const,
        label: t("allDevicesTile.label"),
        sub: t("allDevicesTile.sub"),
        icon: LayoutGrid,
        count: devices.length,
      },
      ...TILE_ORDER.map((type) => {
        const plural = devicePlural(type, t)
        const entry = counts.get(type) ?? { total: 0, online: 0 }
        return {
          key: type,
          label: plural,
          sub: t("tileSub", { plural }),
          icon: DEVICE_ICON[type],
          count: entry.total,
        }
      }),
    ],
    [devices.length, counts, t]
  )

  const filteredDevices = useMemo(() => {
    const query = search.trim()
    return devices.filter((device) => {
      const matchesType = selectedType === "all" || device.deviceType === selectedType
      const matchesStatus =
        statusFilter === "all" ? true : statusFilter === "online" ? device.online : !device.online
      const matchesQuery =
        !query ||
        device.name.includes(query) ||
        (device.model ?? "").includes(query) ||
        (device.port ?? "").includes(query)
      return matchesType && matchesStatus && matchesQuery
    })
  }, [devices, selectedType, statusFilter, search])

  const pageCount = Math.max(1, Math.ceil(filteredDevices.length / pageSize))
  const clampedPage = Math.min(page, pageCount)
  const pagedDevices = filteredDevices.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)

  // Real pagination over the already-fetched registry, not a decorative pager: it starts to
  // matter the moment a branch registers more devices than one page holds.
  useEffect(() => {
    setPage(1)
  }, [selectedType, statusFilter, search, pageSize])

  function selectType(next: DeviceFilter) {
    setSelectedType(next)
  }

  const deleteDevice = async () => {
    if (!pendingDelete) return

    setBusyId(pendingDelete.id)
    try {
      await posDevicesService.remove(pendingDelete.id)
      toast.success(t("toasts.deleted"), { description: pendingDelete.name })
      setPendingDelete(null)
      setDevices(await posDevicesService.list())
    } catch {
      toast.error(t("toasts.deleteFailed"))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div
        dir={localeDirection(locale)}
        className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}
      >
        <Loader2 className="size-4 animate-spin" />
        {t("loading")}
      </div>
    )
  }

  if (loadError) {
    return (
      <div
        dir={localeDirection(locale)}
        className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}
      >
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          {t("retry")}
        </Button>
      </div>
    )
  }

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5 pb-24">
      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.settings} className="transition-colors hover:text-[#2563eb]">
          {tNav("heading")}
        </Link>
        <ChevronRight className="size-3.5 rtl:rotate-180 text-[#c7d3e3]" />
        <span className={cn("font-semibold", HEADING)}>{t("breadcrumbCurrent")}</span>
      </nav>

      {/* RTL: the copy is written first so the icon tile lands on the left. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
        </div>
        <span
          className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", BLUE_TINT)}
        >
          <Monitor className="size-[22px]" />
        </span>
      </div>

      {/* RTL: the first tile is written first so it lands rightmost, where the row starts, just
          as in the Figma source. A horizontal scroller, not a wrapping grid -- with seven tiles
          this reads closer to Figma's own row than a grid that leaves an orphaned last row. */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {tiles.map((tile) => {
          const selected = tile.key === selectedType

          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={selected}
              aria-label={tile.label}
              onClick={() => selectType(tile.key)}
              className={cn(
                "flex min-w-[152px] flex-1 flex-col items-start gap-1.5 rounded-2xl border bg-white p-4 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/35",
                selected
                  ? "border-[#2563eb] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                  : "border-[#e8edf3] hover:border-[#c7d9ff]"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <tile.icon
                  className={cn("size-[22px]", selected ? "text-[#2563eb]" : "text-[#8098b4]")}
                />
                {selected ? <span className="size-1.5 rounded-full bg-[#2563eb]" /> : null}
              </div>
              <p className={cn("text-[11.5px] font-semibold", selected ? "text-[#2563eb]" : MUTED)}>
                {tile.label}
              </p>
              <p
                className={cn(
                  "text-[26px] font-extrabold leading-none",
                  selected ? "text-[#2563eb]" : HEADING
                )}
              >
                {tile.count}
              </p>
              <p className={cn("text-[10.5px] leading-tight", selected ? "text-[#2563eb]" : MUTED)}>
                {tile.sub} ‹
              </p>
            </button>
          )
        })}
      </div>

      <section className={cn(PANEL, "p-5")}>
        {/* RTL: the heading is written first so it lands right, the action left. Both the copy
            and the add button's destination follow the selected tile -- "الموازين الإلكترونية
            المتصلة" / "إضافة ميزان" opens the add-device page (DeviceForm.tsx) pre-filled with
            that type. */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={cn("text-[16px] font-bold", HEADING)}>
              {selectedType === "all"
                ? t("section.allHeading")
                : t("section.typeHeading", { plural: devicePlural(selectedType, t) })}
            </h2>
            <p className={cn("mt-1 text-[11.5px]", MUTED)}>
              {selectedType === "all"
                ? t("section.allSubtitle")
                : t("section.typeSubtitle", { plural: devicePlural(selectedType, t) })}
            </p>
          </div>
          {selectedType === "all" ? null : (
            <Button
              className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => router.push(`${ROUTES.settingsDeviceNew}?type=${selectedType}`)}
            >
              <Plus className="size-4" />
              {deviceAddLabel(selectedType, t)}
            </Button>
          )}
        </div>

        {/* Filter bar: search always shows; the type dropdown only in the "all" tab, where it
            does the same job as the tiles above and has to stay in sync with them -- inside a
            single-type tab the tiles already say which type this is, so a second selector saying
            the same thing would be redundant chrome, not a real filter. */}
        <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[#8098b4]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                selectedType === "all"
                  ? t("search.allPlaceholder")
                  : t("search.typePlaceholder", { label: deviceLabel(selectedType, t) })
              }
              className={cn(FIELD_CLASS, "ps-9")}
            />
          </div>
          {selectedType === "all" ? (
            <div className="sm:w-[170px]">
              <AppSelect
                value={selectedType}
                onValueChange={(value) => selectType(value as DeviceFilter)}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="all">{t("filters.allTypes")}</AppSelectItem>
                  {TILE_ORDER.map((type) => (
                    <AppSelectItem key={type} value={type}>
                      {deviceLabel(type, t)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          ) : null}
          <div className="sm:w-[150px]">
            <AppSelect
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                <AppSelectItem value="all">{t("filters.allStatuses")}</AppSelectItem>
                <AppSelectItem value="online">{t("filters.online")}</AppSelectItem>
                <AppSelectItem value="offline">{t("filters.offline")}</AppSelectItem>
              </AppSelectContent>
            </AppSelect>
          </div>
        </div>

        {devices.length === 0 ? (
          <div
            className={cn(
              "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
              MUTED
            )}
          >
            {t("empty.noDevicesYet")}
          </div>
        ) : filteredDevices.length === 0 ? (
          <div
            className={cn(
              "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
              MUTED
            )}
          >
            {selectedType === "all"
              ? t("empty.allNoMatch")
              : t("empty.typeNoMatch", { plural: devicePlural(selectedType, t) })}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-center">
                <thead>
                  <tr>
                    {[
                      { key: "name", label: t("table.name"), align: "text-right" },
                      // Redundant once a single type is selected -- every row is already that
                      // type, and the tiles above say so.
                      ...(selectedType === "all"
                        ? [{ key: "type", label: t("table.type"), align: "text-center" }]
                        : []),
                      { key: "model", label: t("table.model"), align: "text-center" },
                      { key: "port", label: t("table.port"), align: "text-center" },
                      { key: "status", label: t("table.status"), align: "text-center" },
                      { key: "seen", label: t("table.lastSeen"), align: "text-center" },
                      { key: "actions", label: t("table.actions"), align: "text-center" },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "border-b border-[#eef2f8] bg-[#f4f7fc] px-3 py-3 text-[11px] font-semibold",
                          MUTED,
                          column.align
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedDevices.map((device, index) => {
                    const TypeIcon = DEVICE_ICON[device.deviceType]

                    return (
                      <tr
                        key={device.id}
                        className={cn(
                          "border-b border-[#f4f7fb] last:border-b-0",
                          index % 2 === 0 ? "bg-white" : "bg-[#fafbfd]"
                        )}
                      >
                        <td
                          className={cn("px-3 py-3.5 text-right text-[12.5px] font-bold", HEADING)}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {device.name}
                            {device.deviceType === "receipt_printer"
                              ? (() => {
                                  const role = (device.settings as Partial<DevicePrinterSettings>)
                                    .role
                                  return role ? (
                                    <span className="rounded-md bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#2563eb]">
                                      {printerRoleLabel(role, t)}
                                    </span>
                                  ) : null
                                })()
                              : null}
                          </span>
                        </td>

                        {/* RTL: the icon is written first so it sits to the right of the label. */}
                        {selectedType === "all" ? (
                          <td className="px-3 py-3.5">
                            <span
                              className={cn(
                                "flex items-center justify-center gap-1.5 text-[12px]",
                                MUTED
                              )}
                            >
                              <TypeIcon className="size-4" />
                              {deviceLabel(device.deviceType, t)}
                            </span>
                          </td>
                        ) : null}

                        <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                          {device.model || "—"}
                        </td>
                        <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                          {device.port || connectionLabel(device.connection, t)}
                        </td>

                        <td className="px-3 py-3.5">
                          <StatusDot online={device.online} />
                        </td>

                        <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                          {lastSeenLabel(device.lastSeenAt, t, locale)}
                        </td>

                        <td className="px-3 py-3.5">
                          <DeviceRowActions
                            busy={busyId === device.id}
                            onEdit={() =>
                              router.push(
                                `${ROUTES.settingsDeviceNew}?id=${encodeURIComponent(device.id)}`
                              )
                            }
                            onDelete={() => setPendingDelete(device)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* RTL: the page-size control is written first so it lands right, the pager left --
                every row/count control in this file follows the same order. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f8] pt-3">
              <div className="flex items-center gap-2.5">
                <div className="w-[76px]">
                  <AppSelect
                    value={String(pageSize)}
                    onValueChange={(value) => setPageSize(Number(value))}
                  >
                    <AppSelectTrigger className="h-9 w-full rounded-[8px] border-[#e8edf3] text-[12px]">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <AppSelectItem key={size} value={String(size)}>
                          {size}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                </div>
                <span className={cn("text-[12px]", MUTED)}>
                  {t("pagination.showingRange", {
                    from: (clampedPage - 1) * pageSize + 1,
                    to: Math.min(clampedPage * pageSize, filteredDevices.length),
                    total: filteredDevices.length,
                  })}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label={t("pagination.previousAriaLabel")}
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5 rtl:rotate-180" />
                </button>
                <span className="flex size-7 items-center justify-center rounded-[7px] bg-[#2563eb] text-[12.5px] font-bold text-white">
                  {clampedPage}
                </span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  aria-label={t("pagination.nextAriaLabel")}
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[26rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              {t("deleteDialog.title")}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              {t.rich("deleteDialog.description", {
                name: pendingDelete?.name ?? "",
                b: (chunks) => <span className={cn("font-bold", HEADING)}>{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              className="bg-[#dc2626] text-white hover:bg-[#b91c1c]"
              disabled={busyId !== null}
              onClick={() => void deleteDevice()}
            >
              {t("deleteDialog.confirm")}
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t("deleteDialog.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusDot({ online }: { online: boolean }) {
  const t = useTranslations("settings.devices")
  return (
    <span className="flex items-center justify-center gap-1.5">
      <span className={cn("size-2 rounded-full", online ? "bg-[#10b981]" : "bg-[#c7d3e3]")} />
      <span
        className={cn("text-[11.5px] font-semibold", online ? "text-[#10b981]" : "text-[#8098b4]")}
      >
        {online ? t("filters.online") : t("filters.offline")}
      </span>
    </span>
  )
}

function DeviceRowActions({
  busy,
  onEdit,
  onDelete,
}: {
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useTranslations("settings.devices")
  const locale = useLocale() as Locale
  // Radix releases its pointer-events lock as the menu closes; opening a dialog in the same tick
  // mounts it under that lock and freezes the page. preventDefault must not be used here -- on
  // onSelect it suppresses the close itself.
  const afterClose = (action: () => void) => () => setTimeout(action, 0)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("rowActions.ariaLabel")}
          disabled={busy}
          className="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-lg text-[#8098b4] transition-colors hover:bg-[#f2f5fa] hover:text-[#0d1b3e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "w-44 rounded-[12px]",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
      >
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onEdit)}
        >
          <Pencil className="size-4" />
          {t("rowActions.edit")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px] text-[#dc2626] focus:text-[#dc2626]"
          onSelect={afterClose(onDelete)}
        >
          <Trash2 className="size-4" />
          {t("rowActions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
