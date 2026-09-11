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
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
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

// `label` names the kind in a table cell/filter option; `definite` is the same name with the
// article, which is how the settings panel heading reads it ("إعدادات الميزان الإلكتروني").
const DEVICE_META: Record<
  DeviceType,
  { label: string; definite: string; plural: string; icon: LucideIcon }
> = {
  scale: {
    label: "ميزان إلكتروني",
    definite: "الميزان الإلكتروني",
    plural: "الموازين الإلكترونية",
    icon: ScaleIcon,
  },
  receipt_printer: {
    label: "طابعة فواتير",
    definite: "طابعة الفواتير",
    plural: "طابعات الفواتير",
    icon: Printer,
  },
  barcode_scanner: {
    label: "ماسح باركود",
    definite: "ماسح الباركود",
    plural: "ماسحات الباركود",
    icon: ScanLine,
  },
  cash_drawer: {
    label: "درج نقود",
    definite: "درج النقود",
    plural: "أدراج النقود",
    icon: Inbox,
  },
  customer_display: {
    label: "شاشة عميل",
    definite: "شاشة العميل",
    plural: "شاشات العملاء",
    icon: Monitor,
  },
  card_reader: {
    label: "قارئ بطاقات",
    definite: "قارئ البطاقات",
    plural: "قارئات البطاقات",
    icon: CreditCard,
  },
}

// A restaurant routes the same sale to more than one printer -- a receipt with prices, a kitchen
// ticket without them. This badge is only a label so an admin can tell which printer is which at
// a glance; nothing in the platform dispatches a print job to a role yet.
const PRINTER_ROLE_BADGE: Record<PrinterRole, string> = {
  receipt: "إيصالات",
  kitchen: "مطبخ",
  bar: "بار",
}

// The noun each type's "إضافة" button reads naturally with -- shorter than DEVICE_META's plural/
// definite forms, matching the Figma source's own per-type button copy ("إضافة ميزان", not
// "إضافة الموازين الإلكترونية").
const ADD_LABEL: Record<DeviceType, string> = {
  scale: "إضافة ميزان",
  receipt_printer: "إضافة طابعة",
  barcode_scanner: "إضافة ماسح باركود",
  cash_drawer: "إضافة درج نقود",
  customer_display: "إضافة شاشة عميل",
  card_reader: "إضافة قارئ بطاقات",
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

const CONNECTION_LABEL: Record<DeviceConnection, string> = {
  usb: "USB",
  network: "شبكة",
  bluetooth: "بلوتوث",
  serial: "منفذ تسلسلي",
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const RELATIVE = new Intl.RelativeTimeFormat("ar", { numeric: "auto" })

// "منذ 5 دقائق" from a timestamp. Anything older than a day reads as a date, since the exact
// minute stops mattering.
function lastSeenLabel(value: string | null): string {
  if (!value) return "—"

  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return "الآن"
  if (minutes < 60) return RELATIVE.format(-minutes, "minute")

  const hours = Math.round(minutes / 60)
  if (hours < 24) return RELATIVE.format(-hours, "hour")

  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    day: "numeric",
    month: "long",
  }).format(new Date(value))
}

export default function DeviceSettings() {
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
      setLoadError(
        status === 403
          ? "لا تملك صلاحية عرض إعدادات الأجهزة."
          : "تعذر تحميل إعدادات الأجهزة. حاول مرة أخرى."
      )
    } finally {
      setLoading(false)
    }
  }, [])

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

  // The "جميع الأجهزة" tile first (Figma's own order and default selection), one tile per real
  // device kind after it -- all six, including customer displays and card readers, which used to
  // have no tile or settings panel of their own even though the backend already models both.
  const tiles = useMemo(
    () => [
      {
        key: "all" as const,
        label: "جميع الأجهزة",
        sub: "عرض جميع الأجهزة المتصلة",
        icon: LayoutGrid,
        count: devices.length,
      },
      ...TILE_ORDER.map((type) => {
        const typeMeta = DEVICE_META[type]
        const entry = counts.get(type) ?? { total: 0, online: 0 }
        return {
          key: type,
          label: typeMeta.plural,
          sub: `إعدادات ${typeMeta.plural}`,
          icon: typeMeta.icon,
          count: entry.total,
        }
      }),
    ],
    [devices.length, counts]
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
      toast.success("تم حذف الجهاز.", { description: pendingDelete.name })
      setPendingDelete(null)
      setDevices(await posDevicesService.list())
    } catch {
      toast.error("تعذر حذف الجهاز.")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل إعدادات الأجهزة...
      </div>
    )
  }

  if (loadError) {
    return (
      <div dir="rtl" className={cn(PANEL, "flex flex-col items-start gap-3 p-6")}>
        <p className={cn("text-[13px]", HEADING)}>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          <RotateCcw className="size-4" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-24">
      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.settings} className="transition-colors hover:text-[#2563eb]">
          الإعدادات
        </Link>
        <ChevronLeft className="size-3.5 text-[#c7d3e3]" />
        <span className={cn("font-semibold", HEADING)}>إعدادات الأجهزة</span>
      </nav>

      {/* RTL: the copy is written first so the icon tile lands on the left. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
            إعدادات الأجهزة
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            إدارة وإعداد جميع الأجهزة المتصلة بنظام مدار مثل الموازين، طابعات الفواتير، ماسحات
            الباركود وغيرها.
          </p>
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
                ? "الأجهزة المتصلة"
                : `${DEVICE_META[selectedType].plural} المتصلة`}
            </h2>
            <p className={cn("mt-1 text-[11.5px]", MUTED)}>
              {selectedType === "all"
                ? "قائمة بجميع الأجهزة وإعداداتها وحالة الاتصال."
                : `قائمة بجميع ${DEVICE_META[selectedType].plural} وإعداداتها وحالة الاتصال.`}
            </p>
          </div>
          {selectedType === "all" ? null : (
            <Button
              className="h-10 gap-2 rounded-[10px] bg-[#2563eb] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => router.push(`${ROUTES.settingsDeviceNew}?type=${selectedType}`)}
            >
              <Plus className="size-4" />
              {ADD_LABEL[selectedType]}
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
                  ? "البحث عن جهاز، موديل أو منفذ اتصال..."
                  : `البحث عن ${DEVICE_META[selectedType].label} بالاسم أو الموديل أو المنفذ...`
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
                  <AppSelectItem value="all">جميع الأنواع</AppSelectItem>
                  {TILE_ORDER.map((type) => (
                    <AppSelectItem key={type} value={type}>
                      {DEVICE_META[type].label}
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
                <AppSelectItem value="all">جميع الحالات</AppSelectItem>
                <AppSelectItem value="online">متصل</AppSelectItem>
                <AppSelectItem value="offline">غير متصل</AppSelectItem>
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
            لا توجد أجهزة مسجلة بعد.
          </div>
        ) : filteredDevices.length === 0 ? (
          <div
            className={cn(
              "rounded-[12px] border border-dashed border-[#e8edf3] px-4 py-10 text-center text-[12.5px]",
              MUTED
            )}
          >
            {selectedType === "all"
              ? "لا توجد أجهزة مطابقة لهذا البحث أو التصفية."
              : `لا توجد ${DEVICE_META[selectedType].plural} مطابقة لهذا البحث أو التصفية.`}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-center">
                <thead>
                  <tr>
                    {[
                      { key: "name", label: "اسم الجهاز", align: "text-right" },
                      // Redundant once a single type is selected -- every row is already that
                      // type, and the tiles above say so.
                      ...(selectedType === "all"
                        ? [{ key: "type", label: "النوع", align: "text-center" }]
                        : []),
                      { key: "model", label: "الموديل", align: "text-center" },
                      { key: "port", label: "منفذ الاتصال", align: "text-center" },
                      { key: "status", label: "الحالة", align: "text-center" },
                      { key: "seen", label: "آخر اتصال", align: "text-center" },
                      { key: "actions", label: "الإجراءات", align: "text-center" },
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
                    const typeMeta = DEVICE_META[device.deviceType]

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
                                      {PRINTER_ROLE_BADGE[role]}
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
                              <typeMeta.icon className="size-4" />
                              {typeMeta.label}
                            </span>
                          </td>
                        ) : null}

                        <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                          {device.model || "—"}
                        </td>
                        <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                          {device.port || CONNECTION_LABEL[device.connection]}
                        </td>

                        <td className="px-3 py-3.5">
                          <StatusDot online={device.online} />
                        </td>

                        <td className={cn("px-3 py-3.5 text-[12px]", MUTED)}>
                          {lastSeenLabel(device.lastSeenAt)}
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
                  عرض {(clampedPage - 1) * pageSize + 1} -{" "}
                  {Math.min(clampedPage * pageSize, filteredDevices.length)} من{" "}
                  {filteredDevices.length} أجهزة
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={clampedPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label="الصفحة السابقة"
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="size-3.5" />
                </button>
                <span className="flex size-7 items-center justify-center rounded-[7px] bg-[#2563eb] text-[12.5px] font-bold text-white">
                  {clampedPage}
                </span>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  aria-label="الصفحة التالية"
                  className="flex size-7 items-center justify-center rounded-[7px] border border-[#e8edf3] bg-white text-[#8098b4] transition-colors hover:border-[#c7d9ff] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5" />
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
        <DialogContent className="sm:max-w-[26rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
              حذف الجهاز؟
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-6", MUTED)}>
              سيتم حذف <span className={cn("font-bold", HEADING)}>{pendingDelete?.name}</span> من
              قائمة الأجهزة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              className="bg-[#dc2626] text-white hover:bg-[#b91c1c]"
              disabled={busyId !== null}
              onClick={() => void deleteDevice()}
            >
              حذف
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="flex items-center justify-center gap-1.5">
      <span className={cn("size-2 rounded-full", online ? "bg-[#10b981]" : "bg-[#c7d3e3]")} />
      <span
        className={cn("text-[11.5px] font-semibold", online ? "text-[#10b981]" : "text-[#8098b4]")}
      >
        {online ? "متصل" : "غير متصل"}
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
  // Radix releases its pointer-events lock as the menu closes; opening a dialog in the same tick
  // mounts it under that lock and freezes the page. preventDefault must not be used here -- on
  // onSelect it suppresses the close itself.
  const afterClose = (action: () => void) => () => setTimeout(action, 0)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="إجراءات الجهاز"
          disabled={busy}
          className="mx-auto flex size-8 cursor-pointer items-center justify-center rounded-lg text-[#8098b4] transition-colors hover:bg-[#f2f5fa] hover:text-[#0d1b3e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-[12px] [direction:rtl]">
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px]"
          onSelect={afterClose(onEdit)}
        >
          <Pencil className="size-4" />
          تعديل الجهاز
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12.5px] text-[#dc2626] focus:text-[#dc2626]"
          onSelect={afterClose(onDelete)}
        >
          <Trash2 className="size-4" />
          حذف الجهاز
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
