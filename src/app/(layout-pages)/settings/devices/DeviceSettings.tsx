"use client"

// إعدادات الأجهزة -- the hardware a branch's tills talk to.
//
// Redesigned against the Figma Make source (live-visitors file, DevicesSettingsSection /
// GenericDeviceSubView). That source also ships six separate full-page sub-screens per device
// type, each with its own mocked device registry, fake branch filter, and a "اختبار الاتصال" test
// button that always reports success after a canned delay -- a browser cannot actually open a COM
// port, so that flow is not reproduced here. What's real is kept: one filterable table over the
// branch's actual device registry, and a settings panel per type wired to the real
// pos_device_settings record. Selecting a tile filters that same table instead of navigating to a
// separate mocked screen.
//
// Three layers: a tile per device kind (plus "جميع الأجهزة"), the full registry of units
// underneath filtered by whichever tile/type/status/search is active, and the settings for
// whichever kind is selected.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Monitor,
  MoreVertical,
  PlayCircle,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  Scale as ScaleIcon,
  Search,
  Settings2,
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
  BAUD_RATES,
  posDeviceSettingsService,
  posDevicesService,
  type CardReaderAuthType,
  type CardReaderConnectionMethod,
  type DeviceConnection,
  type DeviceType,
  type DisplayBrightness,
  type DisplayLanguage,
  type DisplayTextDirection,
  type DisplayTimeout,
  type DrawerOpenMethod,
  type PosDevice,
  type PosDeviceSettings,
  type PosDeviceSettingsView,
  type PrintDensity,
  type PrintDirection,
  type PrinterCharset,
  type ScannerCharset,
  type ScannerInputMode,
  type ScannerLineEnding,
  type TrailingDigitMeaning,
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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

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

// The short, bare noun each type's inline settings/test cards use ("إعدادات الميزان",
// "اختبار الميزان") -- shorter than DEVICE_META's definite form, which carries a qualifier
// ("الميزان الإلكتروني") that belongs on the page header, not repeated on every card inside it.
const SHORT_LABEL: Record<DeviceType, string> = {
  scale: "الميزان",
  receipt_printer: "الطابعة",
  barcode_scanner: "الماسح",
  cash_drawer: "الدرج",
  customer_display: "الشاشة",
  card_reader: "القارئ",
}

function quickTipsFor(type: DeviceType): string[] {
  return [
    "اختر نوع الاتصال والمنفذ.",
    `تأكد من توصيل ${SHORT_LABEL[type]} بشكل صحيح.`,
    "اضبط الإعدادات حسب الحاجة.",
    "اضغط على اختبار الاتصال للتأكد من عمل الجهاز.",
  ]
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

const PRINT_DIRECTION_LABEL: Record<PrintDirection, string> = {
  vertical: "عمودي",
  horizontal: "أفقي",
}

const PRINT_DENSITY_LABEL: Record<PrintDensity, string> = {
  light: "خفيفة",
  normal: "عادية",
  dark: "داكنة",
}

const PRINTER_CHARSET_LABEL: Record<PrinterCharset, string> = {
  utf8: "UTF-8",
  cp1256: "CP1256",
  iso88596: "ISO-8859-6",
}

const SCANNER_INPUT_MODE_LABEL: Record<ScannerInputMode, string> = {
  keyboard_wedge: "إدخال لوحة المفاتيح (Keyboard Wedge)",
  hid_device: "HID Device",
  serial_com: "Serial COM",
  virtual_com: "Virtual COM",
}

const SCANNER_CHARSET_LABEL: Record<ScannerCharset, string> = {
  utf8: "UTF-8",
  cp1256: "CP1256",
  ascii: "ASCII",
  iso88591: "ISO-8859-1",
}

const SCANNER_LINE_ENDING_LABEL: Record<ScannerLineEnding, string> = {
  cr: "Enter (CR)",
  tab: "Tab",
  none: "بدون",
  crlf: "CR+LF",
}

const DRAWER_OPEN_METHOD_LABEL: Record<DrawerOpenMethod, string> = {
  printer_signal: "إشارة من الطابعة (ESC/POS)",
  direct_com: "منفذ COM مباشر",
  gpio: "GPIO",
}

const DISPLAY_BRIGHTNESS_LABEL: Record<DisplayBrightness, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  auto: "تلقائي",
}

const DISPLAY_TIMEOUT_LABEL: Record<DisplayTimeout, string> = {
  "10s": "10 ثوانٍ",
  "30s": "30 ثانية",
  "1m": "دقيقة",
  "2m": "دقيقتان",
  "5m": "5 دقائق",
  never: "لا يوقف",
}

const DISPLAY_LANGUAGE_LABEL: Record<DisplayLanguage, string> = {
  ar: "العربية",
  en: "الإنجليزية",
  bilingual: "ثنائي اللغة",
}

const DISPLAY_DIRECTION_LABEL: Record<DisplayTextDirection, string> = {
  normal: "عادي (يمين لليسار)",
  reversed: "مقلوب (يسار لليمين)",
  vertical: "عمودي",
}

const CARD_READER_METHOD_LABEL: Record<CardReaderConnectionMethod, string> = {
  com: "منفذ تسلسلي (COM)",
  usb: "USB",
  api: "API",
}

const CARD_READER_AUTH_LABEL: Record<CardReaderAuthType, string> = {
  bearer: "Bearer Token",
  api_key: "API Key",
  oauth2: "OAuth 2.0",
  basic: "Basic Auth",
}

// The port fields are closed dropdowns in the Figma source, not free text -- a fixed list of the
// COM/USB names a real till actually offers, not an arbitrary string.
const SCALE_PORT_OPTIONS = ["COM1", "COM2", "COM3", "COM4", "COM5", "USB0", "USB1"]
const PRINTER_PORT_OPTIONS = ["COM1", "COM2", "COM3", "COM4", "USB0", "USB1"]
const CASH_DRAWER_PORT_OPTIONS = ["COM1", "COM2", "COM3", "COM4", "USB0"]
const DISPLAY_PORT_OPTIONS = ["COM1", "COM2", "COM3", "COM4", "USB", "AUTO"]

function portOptions(list: string[], current: string | null) {
  const options = list.map((value) => ({ value, label: value }))
  // A previously-saved value the fixed list doesn't carry (an old free-text entry, or a port a
  // list revision dropped) still needs a place to render, or the select would silently jump to
  // whatever option happens to be first.
  return current && !list.includes(current)
    ? [{ value: current, label: current }, ...options]
    : options
}

const FALLBACK: PosDeviceSettings = {
  scale: {
    enabled: false,
    name: null,
    connection: "serial",
    port: null,
    baudRate: 9600,
    defaultWeightUnit: "kg",
    trailingDigits: "weight",
    indicatorStart: 1,
    decimals: 3,
    blockUnstableWeight: true,
    autoZero: true,
  },
  receiptPrinter: {
    enabled: true,
    name: null,
    model: null,
    connection: "usb",
    port: null,
    baudRate: 9600,
    networkAddress: null,
    paperWidth: "80mm",
    printDirection: "vertical",
    printDensity: "normal",
    charset: "utf8",
    copies: 1,
    autoCut: true,
    printLogo: false,
    extraCopy: false,
    footerText: null,
  },
  barcodeScanner: {
    enabled: true,
    name: null,
    connection: "usb",
    inputMode: "keyboard_wedge",
    charset: "utf8",
    lineEnding: "cr",
    prefix: null,
    suffix: null,
    inputDelayMs: 0,
    allowRepeatScans: false,
    beepOnScan: true,
    uppercaseOutput: false,
    hideControlChars: true,
  },
  cashDrawer: {
    enabled: true,
    name: null,
    connection: "printer",
    port: null,
    openTimeMs: 500,
    openMethod: "printer_signal",
    openTrigger: "on_sale",
    openOnCancel: false,
  },
  customerDisplay: {
    enabled: false,
    name: null,
    connection: "usb",
    port: null,
    brightness: "medium",
    screenTimeout: "30s",
    language: "ar",
    textDirection: "normal",
    welcomeMessage: null,
    showStoreLogo: true,
    showProductName: true,
    showPrice: true,
    showQuantity: true,
    showTotal: true,
    showPromoMessages: false,
  },
  cardReader: {
    enabled: false,
    name: null,
    provider: null,
    terminalId: null,
    connectionMethod: "api",
    port: null,
    apiUrl: null,
    authType: "bearer",
    apiKey: null,
    requestTimeoutSeconds: 30,
    sendDigitalReceipt: true,
    autoCompleteAfterSuccess: true,
    sandboxMode: false,
  },
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
  const [settings, setSettings] = useState<PosDeviceSettings>(FALLBACK)
  const [meta, setMeta] = useState<PosDeviceSettingsView | null>(null)
  const [selectedType, setSelectedType] = useState<DeviceFilter>("all")
  // Whether the type-specific "settings" screen (نوع الاتصال/المنفذ/... , plus test+tips cards) is
  // showing in place of the connected-devices table -- an in-page view swap, not a route, so the
  // tiles above stay visible throughout, matching the Figma reference.
  const [isAdding, setIsAdding] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all")
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<PosDevice | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [list, view] = await Promise.all([
        posDevicesService.list(),
        posDeviceSettingsService.get(),
      ])
      setDevices(list)
      setSettings(view.settings)
      setMeta(view)
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

  // Switching type (tile or dropdown) always drops back to the table view -- staying on the
  // settings screen for the type you just left would show the wrong type's fields.
  function selectType(next: DeviceFilter) {
    setSelectedType(next)
    setIsAdding(false)
  }

  function patch<K extends keyof PosDeviceSettings>(
    group: K,
    changes: Partial<PosDeviceSettings[K]>
  ) {
    setSettings((current) => ({ ...current, [group]: { ...current[group], ...changes } }))
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const view = await posDeviceSettingsService.save(settings)
      setSettings(view.settings)
      setMeta(view)
      toast.success("تم حفظ إعدادات الأجهزة.")
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? "لا تملك صلاحية تعديل الإعدادات." : "تعذر حفظ الإعدادات.", {
        description: status === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية pos:manage." : undefined,
      })
    } finally {
      setSaving(false)
    }
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

      {isAdding && selectedType !== "all" ? (
        <TypeSettingsView
          selectedType={selectedType}
          settings={settings}
          patch={patch}
          onBack={() => setIsAdding(false)}
        />
      ) : (
        <section className={cn(PANEL, "p-5")}>
          {/* RTL: the heading is written first so it lands right, the action left. Both the copy
            and the add button's destination follow the selected tile -- "الموازين الإلكترونية
            المتصلة" / "إضافة ميزان" switches this same screen to that type's settings, matching
            the Figma source's per-type sub-view. */}
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
                onClick={() => setIsAdding(true)}
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
                            className={cn(
                              "px-3 py-3.5 text-right text-[12.5px] font-bold",
                              HEADING
                            )}
                          >
                            {device.name}
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
      )}

      {/* Only shown while the settings screen itself is on-screen -- there is nothing to save
          from the plain table/tiles view. RTL: the primary action is written first so it sits at
          the right of the bar. */}
      {isAdding && selectedType !== "all" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e8edf3] bg-white/95 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3">
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2563eb] px-6 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              disabled={saving}
              onClick={() => void saveSettings()}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[10px] border-[#e8edf3] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
              disabled={saving}
              onClick={() => setIsAdding(false)}
            >
              إلغاء
            </Button>

            {meta && !meta.configured ? (
              <p className={cn("text-[11px]", MUTED)}>
                لم يتم حفظ الإعدادات بعد — القيم المعروضة هي الافتراضية.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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

// The screen "إضافة {نوع}" / a tile's own settings link opens -- in place of the connected-devices
// table, tiles still visible above. Two columns: the real settings form (SettingsPanel, wired to
// posDeviceSettingsService) on the right, a test card and a quick-tips card on the left.
//
// The Figma reference's own version of this screen fakes the test button: it flips to "✓ الاتصال
// ناجح" after a canned 1.8s delay regardless of anything actually being plugged in. That is not
// reproduced -- a browser cannot open a COM port, so the button stays visible but honestly
// disabled with that reason, the same pattern already used on the add-device page.
function TypeSettingsView({
  selectedType,
  settings,
  patch,
  onBack,
}: {
  selectedType: DeviceType
  settings: PosDeviceSettings
  patch: <K extends keyof PosDeviceSettings>(
    group: K,
    changes: Partial<PosDeviceSettings[K]>
  ) => void
  onBack: () => void
}) {
  const meta = DEVICE_META[selectedType]

  return (
    <div className="flex flex-col gap-5">
      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.settings} className="transition-colors hover:text-[#2563eb]">
          الإعدادات
        </Link>
        <ChevronLeft className="size-3.5 text-[#c7d3e3]" />
        <Link href={ROUTES.settingsDevices} className="transition-colors hover:text-[#2563eb]">
          إعدادات الأجهزة
        </Link>
        <ChevronLeft className="size-3.5 text-[#c7d3e3]" />
        <span className={cn("font-semibold", HEADING)}>{meta.plural}</span>
      </nav>

      {/* RTL: the copy is written first so the icon lands on its left. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>
            إعدادات {meta.definite}
          </h1>
          <p className={cn("mt-1 text-[13px]", MUTED)}>
            تكوين إعدادات {meta.definite} المستخدم في المتجر.
          </p>
        </div>
        <span
          className={cn(
            "flex size-[52px] shrink-0 items-center justify-center rounded-2xl",
            BLUE_TINT
          )}
        >
          <meta.icon className="size-[24px]" />
        </span>
      </div>

      {/* Its own row, not sharing the header -- a standalone pill rather than a corner action.
          RTL: the chevron is written first so it lands at the row's start (the right), reading
          "‹ back". */}
      <div>
        <Button
          variant="outline"
          className="h-10 gap-1.5 rounded-[10px] border-[#e8edf3] px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c7d9ff] hover:text-[#0d1b3e]"
          onClick={onBack}
        >
          <ChevronRight className="size-4" />
          العودة إلى الأجهزة
        </Button>
      </div>

      {/* RTL: the form is written first so it takes the right, the guidance column the left. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <SettingsPanel selectedType={selectedType} settings={settings} patch={patch} />

        <aside className="flex flex-col gap-5">
          <section className={cn(PANEL, "p-5")}>
            {/* RTL: the title is written first so the icon lands on its left. */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={cn("text-[15px] font-bold", HEADING)}>
                اختبار {SHORT_LABEL[selectedType]}
              </h2>
              <PlayCircle className="size-[22px] text-[#2563eb]" />
            </div>
            <p className={cn("text-[12px] leading-6", MUTED)}>
              تأكد من عمل {SHORT_LABEL[selectedType]} بشكل صحيح قبل الحفظ.
            </p>

            {/* Reading a serial port is something only software running on the till can do -- a
                browser cannot reach COM3. The control stays visible with the reason rather than
                pretending to test and always reporting success. */}
            <Button
              variant="outline"
              disabled
              title="اختبار الاتصال يتطلب تطبيق نقطة البيع على جهاز الكاشير"
              className="mt-4 h-11 w-full cursor-not-allowed gap-2 rounded-[12px] border-[#c7d9ff] bg-[#f7faff] text-[13px] font-semibold text-[#2563eb] opacity-70"
            >
              <PlayCircle className="size-4" />
              اختبار الاتصال
            </Button>
            <p className="mt-2 text-center text-[10.5px] text-[#98a2b3]">
              متاح من تطبيق الكاشير على الجهاز نفسه
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={cn("text-[15px] font-bold", HEADING)}>تعليمات سريعة</h2>
              <Lightbulb className="size-[22px] text-[#e08b00]" />
            </div>
            <ol className="flex flex-col gap-3">
              {quickTipsFor(selectedType).map((tip, index) => (
                // RTL: the number is written first so it sits to the right of its step.
                <li key={tip} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
                      BLUE_TINT
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className={cn("text-[12px] leading-6", MUTED)}>{tip}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  )
}

function SettingsPanel({
  selectedType,
  settings,
  patch,
}: {
  selectedType: DeviceType
  settings: PosDeviceSettings
  patch: <K extends keyof PosDeviceSettings>(
    group: K,
    changes: Partial<PosDeviceSettings[K]>
  ) => void
}) {
  const meta = DEVICE_META[selectedType]

  return (
    <section className={cn(PANEL, "p-5")}>
      {/* RTL: the copy is written first so the icon lands on its left. A plain settings gear here,
          not the device-type icon -- that one already marks the page header just above; repeating
          it on the card inside would say the same thing twice. */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className={cn("text-[16px] font-bold", HEADING)}>
            إعدادات {SHORT_LABEL[selectedType]}
          </h2>
          <p className={cn("mt-1 text-[11.5px]", MUTED)}>
            قم بإعدادات الاتصال والقياس لـ{meta.definite}.
          </p>
        </div>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            BLUE_TINT
          )}
        >
          <Settings2 className="size-[17px]" />
        </span>
      </div>

      {selectedType === "scale" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم الميزان">
              <Input
                value={settings.scale.name ?? ""}
                aria-label="اسم الميزان"
                placeholder="الميزان الرئيسي"
                className={FIELD_CLASS}
                onChange={(event) => patch("scale", { name: event.target.value || null })}
              />
            </Field>

            <Field label="نوع الاتصال" required>
              <SettingsSelect
                value={settings.scale.connection}
                ariaLabel="نوع اتصال الميزان"
                options={Object.entries(CONNECTION_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => patch("scale", { connection: value as DeviceConnection })}
              />
            </Field>

            <Field label="المنفذ" required>
              <SettingsSelect
                value={settings.scale.port ?? ""}
                ariaLabel="منفذ الميزان"
                options={portOptions(SCALE_PORT_OPTIONS, settings.scale.port)}
                onChange={(value) => patch("scale", { port: value || null })}
              />
            </Field>

            <Field label="سرعة الاتصال (Baud Rate)">
              <SettingsSelect
                value={String(settings.scale.baudRate)}
                ariaLabel="سرعة الاتصال"
                options={BAUD_RATES.map((rate) => ({ value: String(rate), label: String(rate) }))}
                onChange={(value) => patch("scale", { baudRate: Number(value) })}
              />
            </Field>

            <Field label="وحدة الوزن الافتراضية" required>
              <SettingsSelect
                value={settings.scale.defaultWeightUnit}
                ariaLabel="وحدة الوزن"
                options={[
                  { value: "kg", label: "كيلوجرام (كجم)" },
                  { value: "g", label: "جرام" },
                ]}
                onChange={(value) => patch("scale", { defaultWeightUnit: value as "kg" | "g" })}
              />
            </Field>

            <Field label="بداية مؤشر الميزان">
              <SettingsSelect
                value={String(settings.scale.indicatorStart)}
                ariaLabel="بداية مؤشر الميزان"
                options={[1, 99, 100, 255].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
                onChange={(value) => patch("scale", { indicatorStart: Number(value) })}
              />
            </Field>

            <Field label="الجزء العشري" required>
              <SettingsSelect
                value={String(settings.scale.decimals)}
                ariaLabel="الجزء العشري"
                options={[0, 1, 2, 3, 4].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
                onChange={(value) => patch("scale", { decimals: Number(value) })}
              />
            </Field>
          </div>

          {/* What the scale's trailing digits mean once printed on a price-embedded barcode --
              the same real distinction DeviceScaleSettings already asks per physical unit, now
              exposed as the branch-wide default. */}
          <div className="mt-5 border-t border-[#f1f4f9] pt-5">
            <div className="mb-2 flex items-center justify-start gap-1 text-[12.5px] font-semibold">
              <span className={HEADING}>الأرقام الأخيرة تمثل</span>
              <span className="text-[#e11d48]">*</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RadioOptionRow
                id="trailing-price"
                label="السعر"
                selected={settings.scale.trailingDigits === "price"}
                onSelect={() => patch("scale", { trailingDigits: "price" as TrailingDigitMeaning })}
              />
              <RadioOptionRow
                id="trailing-weight"
                label="الوزن"
                selected={settings.scale.trailingDigits === "weight"}
                onSelect={() =>
                  patch("scale", { trailingDigits: "weight" as TrailingDigitMeaning })
                }
              />
            </div>
          </div>

          {/* RTL: written first so this pair lands on the right of the row. */}
          <div className="mt-5 grid gap-4 border-t border-[#f1f4f9] pt-5 sm:grid-cols-2">
            <ToggleRow
              id="block-unstable"
              label="منع الإضافة إلى الكاشير"
              hint="منع إضافة المنتج إذا كان الوزن غير مستقر"
              checked={settings.scale.blockUnstableWeight}
              onChange={(blockUnstableWeight) => patch("scale", { blockUnstableWeight })}
            />
            <ToggleRow
              id="auto-zero"
              label="تصفير الوزن تلقائياً"
              hint="إعادة تثبيت الميزان إلى الصفر قبل قراءة الوزن"
              checked={settings.scale.autoZero}
              onChange={(autoZero) => patch("scale", { autoZero })}
            />
          </div>
        </>
      ) : null}

      {selectedType === "receipt_printer" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم الطابعة">
              <Input
                value={settings.receiptPrinter.name ?? ""}
                aria-label="اسم الطابعة"
                placeholder="طابعة الكاشير الرئيسية"
                className={FIELD_CLASS}
                onChange={(event) => patch("receiptPrinter", { name: event.target.value || null })}
              />
            </Field>

            <Field label="نوع الاتصال" required>
              <SettingsSelect
                value={settings.receiptPrinter.connection}
                ariaLabel="نوع اتصال الطابعة"
                options={[
                  { value: "serial", label: "منفذ تسلسلي" },
                  { value: "usb", label: "USB" },
                  { value: "network", label: "شبكة" },
                  { value: "bluetooth", label: "بلوتوث" },
                ]}
                onChange={(value) =>
                  patch("receiptPrinter", {
                    connection: value as PosDeviceSettings["receiptPrinter"]["connection"],
                  })
                }
              />
            </Field>

            <Field label="المنفذ" required>
              <SettingsSelect
                value={settings.receiptPrinter.port ?? ""}
                ariaLabel="منفذ الطابعة"
                options={portOptions(PRINTER_PORT_OPTIONS, settings.receiptPrinter.port)}
                onChange={(value) => patch("receiptPrinter", { port: value || null })}
              />
            </Field>

            <Field label="نموذج الطابعة">
              <Input
                value={settings.receiptPrinter.model ?? ""}
                aria-label="نموذج الطابعة"
                placeholder="Epson TM-T20"
                className={FIELD_CLASS}
                onChange={(event) => patch("receiptPrinter", { model: event.target.value || null })}
              />
            </Field>

            <Field label="سرعة الاتصال (Baud Rate)" required>
              <SettingsSelect
                value={String(settings.receiptPrinter.baudRate)}
                ariaLabel="سرعة اتصال الطابعة"
                options={BAUD_RATES.map((rate) => ({ value: String(rate), label: String(rate) }))}
                onChange={(value) => patch("receiptPrinter", { baudRate: Number(value) })}
              />
            </Field>

            <Field label="اتجاه الطباعة">
              <SettingsSelect
                value={settings.receiptPrinter.printDirection}
                ariaLabel="اتجاه الطباعة"
                options={Object.entries(PRINT_DIRECTION_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("receiptPrinter", { printDirection: value as PrintDirection })
                }
              />
            </Field>

            <Field label="حجم الورق" required>
              <SettingsSelect
                value={settings.receiptPrinter.paperWidth}
                ariaLabel="حجم ورق الطابعة"
                options={[
                  { value: "58mm", label: "58 مم" },
                  { value: "80mm", label: "80 مم" },
                ]}
                onChange={(value) =>
                  patch("receiptPrinter", { paperWidth: value as "58mm" | "80mm" })
                }
              />
            </Field>

            <Field label="كثافة الطباعة">
              <SettingsSelect
                value={settings.receiptPrinter.printDensity}
                ariaLabel="كثافة الطباعة"
                options={Object.entries(PRINT_DENSITY_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("receiptPrinter", { printDensity: value as PrintDensity })
                }
              />
            </Field>

            <Field label="مجموعة الأحرف">
              <SettingsSelect
                value={settings.receiptPrinter.charset}
                ariaLabel="مجموعة أحرف الطابعة"
                options={Object.entries(PRINTER_CHARSET_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => patch("receiptPrinter", { charset: value as PrinterCharset })}
              />
            </Field>

            <Field label="عنوان الشبكة">
              <Input
                value={settings.receiptPrinter.networkAddress ?? ""}
                aria-label="عنوان شبكة الطابعة"
                placeholder="192.168.1.100"
                disabled={settings.receiptPrinter.connection !== "network"}
                className={cn(FIELD_CLASS, "[direction:ltr] disabled:opacity-50")}
                onChange={(event) =>
                  patch("receiptPrinter", { networkAddress: event.target.value || null })
                }
              />
            </Field>

            <Field label="عدد النسخ">
              <Input
                type="number"
                min={1}
                max={5}
                value={settings.receiptPrinter.copies}
                aria-label="عدد النسخ"
                className={FIELD_CLASS}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  patch("receiptPrinter", {
                    copies: Number.isFinite(next) ? Math.min(5, Math.max(1, next)) : 1,
                  })
                }}
              />
            </Field>

            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="نص أسفل الإيصال">
                <Input
                  value={settings.receiptPrinter.footerText ?? ""}
                  aria-label="نص أسفل الإيصال"
                  placeholder="شكراً لزيارتكم"
                  className={FIELD_CLASS}
                  onChange={(event) =>
                    patch("receiptPrinter", { footerText: event.target.value || null })
                  }
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-[#f1f4f9] pt-5 sm:grid-cols-2">
            <ToggleRow
              id="auto-receipt"
              label="طباعة الإيصال تلقائياً"
              hint="إرسال الفاتورة للطباعة مباشرة بعد إتمام العملية"
              checked={settings.receiptPrinter.enabled}
              onChange={(enabled) => patch("receiptPrinter", { enabled })}
            />
            <ToggleRow
              id="auto-cut"
              label="قص الورق تلقائياً"
              hint="إرسال أمر قص الورق بعد الطباعة"
              checked={settings.receiptPrinter.autoCut}
              onChange={(autoCut) => patch("receiptPrinter", { autoCut })}
            />
            <ToggleRow
              id="print-logo"
              label="طباعة الشعار"
              hint="طباعة شعار المتجر في رأس الفاتورة"
              checked={settings.receiptPrinter.printLogo}
              onChange={(printLogo) => patch("receiptPrinter", { printLogo })}
            />
            <ToggleRow
              id="extra-copy"
              label="طباعة نسخة إضافية"
              hint="طباعة نسخة ثانية من الفاتورة"
              checked={settings.receiptPrinter.extraCopy}
              onChange={(extraCopy) => patch("receiptPrinter", { extraCopy })}
            />
          </div>
        </>
      ) : null}

      {selectedType === "barcode_scanner" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم الماسح">
              <Input
                value={settings.barcodeScanner.name ?? ""}
                aria-label="اسم الماسح"
                placeholder="ماسح الكاشير الرئيسي"
                className={FIELD_CLASS}
                onChange={(event) => patch("barcodeScanner", { name: event.target.value || null })}
              />
            </Field>

            <Field label="نوع الاتصال" required>
              <SettingsSelect
                value={settings.barcodeScanner.connection}
                ariaLabel="نوع اتصال الماسح"
                options={[
                  { value: "usb", label: "USB" },
                  { value: "bluetooth", label: "بلوتوث" },
                  { value: "serial", label: "COM Port" },
                  { value: "hid", label: "HID" },
                ]}
                onChange={(value) =>
                  patch("barcodeScanner", {
                    connection: value as PosDeviceSettings["barcodeScanner"]["connection"],
                  })
                }
              />
            </Field>

            <Field label="نمط الإدخال" required>
              <SettingsSelect
                value={settings.barcodeScanner.inputMode}
                ariaLabel="نمط إدخال الماسح"
                options={Object.entries(SCANNER_INPUT_MODE_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("barcodeScanner", { inputMode: value as ScannerInputMode })
                }
              />
            </Field>

            <Field label="ترميز الأحرف">
              <SettingsSelect
                value={settings.barcodeScanner.charset}
                ariaLabel="ترميز أحرف الماسح"
                options={Object.entries(SCANNER_CHARSET_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => patch("barcodeScanner", { charset: value as ScannerCharset })}
              />
            </Field>

            <Field label="نهاية السطر">
              <SettingsSelect
                value={settings.barcodeScanner.lineEnding}
                ariaLabel="نهاية سطر الماسح"
                options={Object.entries(SCANNER_LINE_ENDING_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("barcodeScanner", { lineEnding: value as ScannerLineEnding })
                }
              />
            </Field>

            <Field label="تأخير الإدخال (اختياري)">
              <Input
                type="number"
                min={0}
                max={5000}
                value={settings.barcodeScanner.inputDelayMs}
                aria-label="تأخير إدخال الماسح"
                className={FIELD_CLASS}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  patch("barcodeScanner", {
                    inputDelayMs: Number.isFinite(next) ? Math.min(5000, Math.max(0, next)) : 0,
                  })
                }}
              />
            </Field>

            <Field label="إضافة بادئة (اختياري)">
              <Input
                value={settings.barcodeScanner.prefix ?? ""}
                aria-label="بادئة الرمز"
                placeholder="مثال: SCN-"
                className={FIELD_CLASS}
                onChange={(event) =>
                  patch("barcodeScanner", { prefix: event.target.value || null })
                }
              />
            </Field>

            <Field label="إضافة لاحقة (اختياري)">
              <Input
                value={settings.barcodeScanner.suffix ?? ""}
                aria-label="لاحقة الرمز"
                placeholder="مثال: -END"
                className={FIELD_CLASS}
                onChange={(event) =>
                  patch("barcodeScanner", { suffix: event.target.value || null })
                }
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 border-t border-[#f1f4f9] pt-5 sm:grid-cols-2">
            <ToggleRow
              id="scanner-enabled"
              label="تفعيل الماسح الضوئي"
              hint="السماح باستخدام الماسح الضوئي في النظام"
              checked={settings.barcodeScanner.enabled}
              onChange={(enabled) => patch("barcodeScanner", { enabled })}
            />
            <ToggleRow
              id="beep-on-scan"
              label="تشغيل صوت التأكيد"
              hint="إصدار صوت عند قراءة الباركود بنجاح"
              checked={settings.barcodeScanner.beepOnScan}
              onChange={(beepOnScan) => patch("barcodeScanner", { beepOnScan })}
            />
            <ToggleRow
              id="allow-repeat-scans"
              label="السماح بقراءة الباركود المتكرر"
              hint="السماح بقراءة نفس الباركود أكثر من مرة دون تأخير"
              checked={settings.barcodeScanner.allowRepeatScans}
              onChange={(allowRepeatScans) => patch("barcodeScanner", { allowRepeatScans })}
            />
            <ToggleRow
              id="uppercase-output"
              label="تحويل الأحرف إلى كبيرة"
              hint="تحويل جميع الأحرف المقروءة إلى أحرف كبيرة"
              checked={settings.barcodeScanner.uppercaseOutput}
              onChange={(uppercaseOutput) => patch("barcodeScanner", { uppercaseOutput })}
            />
            <ToggleRow
              id="hide-control-chars"
              label="إخفاء رموز التحكم"
              hint="إزالة الأحرف غير المرئية من البيانات المقروءة"
              checked={settings.barcodeScanner.hideControlChars}
              onChange={(hideControlChars) => patch("barcodeScanner", { hideControlChars })}
            />
          </div>
        </>
      ) : null}

      {selectedType === "cash_drawer" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم الدرج">
              <Input
                value={settings.cashDrawer.name ?? ""}
                aria-label="اسم درج النقود"
                placeholder="درج الكاشير الرئيسي"
                className={FIELD_CLASS}
                onChange={(event) => patch("cashDrawer", { name: event.target.value || null })}
              />
            </Field>

            <Field label="المنفذ" required>
              <SettingsSelect
                value={settings.cashDrawer.port ?? ""}
                ariaLabel="منفذ درج النقود"
                options={portOptions(CASH_DRAWER_PORT_OPTIONS, settings.cashDrawer.port)}
                onChange={(value) => patch("cashDrawer", { port: value || null })}
              />
            </Field>

            <Field label="نوع الاتصال" required>
              <SettingsSelect
                value={settings.cashDrawer.connection}
                ariaLabel="نوع اتصال درج النقود"
                options={[
                  { value: "serial", label: "منفذ تسلسلي (COM)" },
                  { value: "usb", label: "USB" },
                  { value: "printer", label: "عبر الطابعة (RJ11)" },
                ]}
                onChange={(value) =>
                  patch("cashDrawer", {
                    connection: value as PosDeviceSettings["cashDrawer"]["connection"],
                  })
                }
              />
            </Field>

            <Field label="زمن الفتح (بالملي ثانية)" required>
              <SettingsSelect
                value={String(settings.cashDrawer.openTimeMs)}
                ariaLabel="زمن فتح درج النقود"
                options={[200, 300, 500, 700, 1000].map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
                onChange={(value) => patch("cashDrawer", { openTimeMs: Number(value) })}
              />
            </Field>

            <Field label="طريقة الفتح" required>
              <SettingsSelect
                value={settings.cashDrawer.openMethod}
                ariaLabel="طريقة فتح درج النقود"
                options={Object.entries(DRAWER_OPEN_METHOD_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) => patch("cashDrawer", { openMethod: value as DrawerOpenMethod })}
              />
            </Field>

            <Field label="وقت الفتح التلقائي">
              <SettingsSelect
                value={settings.cashDrawer.openTrigger}
                ariaLabel="وقت فتح الدرج"
                options={[
                  { value: "on_sale", label: "عند كل عملية بيع" },
                  { value: "manual", label: "يدوياً فقط" },
                ]}
                onChange={(value) =>
                  patch("cashDrawer", { openTrigger: value as "on_sale" | "manual" })
                }
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 border-t border-[#f1f4f9] pt-5 sm:grid-cols-2">
            <ToggleRow
              id="drawer-enabled"
              label="فتح درج النقود تلقائياً"
              hint="فتح درج النقود تلقائياً بعد إتمام عملية البيع"
              checked={settings.cashDrawer.enabled}
              onChange={(enabled) => patch("cashDrawer", { enabled })}
            />
            <ToggleRow
              id="open-on-cancel"
              label="فتح درج النقود عند الإلغاء"
              hint="فتح درج النقود عند إلغاء الفاتورة"
              checked={settings.cashDrawer.openOnCancel}
              onChange={(openOnCancel) => patch("cashDrawer", { openOnCancel })}
            />
          </div>
        </>
      ) : null}

      {/* New: the settings record already carries a customerDisplay group (see FALLBACK), but no
          screen has ever rendered it -- there was no tile for this type either. */}
      {selectedType === "customer_display" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم الشاشة">
              <Input
                value={settings.customerDisplay.name ?? ""}
                aria-label="اسم شاشة العميل"
                placeholder="شاشة الكاشير الرئيسية"
                className={FIELD_CLASS}
                onChange={(event) => patch("customerDisplay", { name: event.target.value || null })}
              />
            </Field>

            <Field label="نوع الاتصال" required>
              <SettingsSelect
                value={settings.customerDisplay.connection}
                ariaLabel="نوع اتصال شاشة العميل"
                options={Object.entries(CONNECTION_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("customerDisplay", { connection: value as DeviceConnection })
                }
              />
            </Field>

            <Field label="المنفذ" required>
              <SettingsSelect
                value={settings.customerDisplay.port ?? ""}
                ariaLabel="منفذ شاشة العميل"
                options={portOptions(DISPLAY_PORT_OPTIONS, settings.customerDisplay.port)}
                onChange={(value) => patch("customerDisplay", { port: value || null })}
              />
            </Field>

            <Field label="السطوع" required>
              <SettingsSelect
                value={settings.customerDisplay.brightness}
                ariaLabel="سطوع شاشة العميل"
                options={Object.entries(DISPLAY_BRIGHTNESS_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("customerDisplay", { brightness: value as DisplayBrightness })
                }
              />
            </Field>

            <Field label="ساعات إيقاف العرض" required>
              <SettingsSelect
                value={settings.customerDisplay.screenTimeout}
                ariaLabel="مهلة إيقاف شاشة العميل"
                options={Object.entries(DISPLAY_TIMEOUT_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("customerDisplay", { screenTimeout: value as DisplayTimeout })
                }
              />
            </Field>

            <Field label="لغة العرض" required>
              <SettingsSelect
                value={settings.customerDisplay.language}
                ariaLabel="لغة شاشة العميل"
                options={Object.entries(DISPLAY_LANGUAGE_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("customerDisplay", { language: value as DisplayLanguage })
                }
              />
            </Field>

            <Field label="اتجاه العرض" required>
              <SettingsSelect
                value={settings.customerDisplay.textDirection}
                ariaLabel="اتجاه شاشة العميل"
                options={Object.entries(DISPLAY_DIRECTION_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("customerDisplay", { textDirection: value as DisplayTextDirection })
                }
              />
            </Field>

            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="النص المخصص في شاشة العميل">
                <Input
                  value={settings.customerDisplay.welcomeMessage ?? ""}
                  aria-label="النص المخصص في شاشة العميل"
                  placeholder="مرحباً بكم في مدار"
                  maxLength={100}
                  className={FIELD_CLASS}
                  onChange={(event) =>
                    patch("customerDisplay", { welcomeMessage: event.target.value || null })
                  }
                />
              </Field>
            </div>
          </div>

          <div className="mt-5 border-t border-[#f1f4f9] pt-5">
            <p className={cn("mb-3 text-[12px] font-semibold", HEADING)}>خيارات العرض</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ToggleRow
                id="customer-display-enabled"
                label="تفعيل شاشة العميل"
                hint="عرض تفاصيل الفاتورة على شاشة العميل أثناء البيع"
                checked={settings.customerDisplay.enabled}
                onChange={(enabled) => patch("customerDisplay", { enabled })}
              />
              <ToggleRow
                id="show-store-logo"
                label="عرض شعار المتجر"
                hint="إظهار شعار المتجر في أعلى الشاشة"
                checked={settings.customerDisplay.showStoreLogo}
                onChange={(showStoreLogo) => patch("customerDisplay", { showStoreLogo })}
              />
              <ToggleRow
                id="show-product-name"
                label="عرض اسم المنتج"
                hint="إظهار أسماء المنتجات المُضافة"
                checked={settings.customerDisplay.showProductName}
                onChange={(showProductName) => patch("customerDisplay", { showProductName })}
              />
              <ToggleRow
                id="show-price"
                label="عرض سعر المنتج"
                hint="إظهار سعر كل منتج"
                checked={settings.customerDisplay.showPrice}
                onChange={(showPrice) => patch("customerDisplay", { showPrice })}
              />
              <ToggleRow
                id="show-quantity"
                label="عرض الكمية"
                hint="إظهار كمية كل منتج"
                checked={settings.customerDisplay.showQuantity}
                onChange={(showQuantity) => patch("customerDisplay", { showQuantity })}
              />
              <ToggleRow
                id="show-total"
                label="عرض إجمالي الفاتورة"
                hint="إظهار المبلغ الإجمالي للفاتورة"
                checked={settings.customerDisplay.showTotal}
                onChange={(showTotal) => patch("customerDisplay", { showTotal })}
              />
              <ToggleRow
                id="show-promo"
                label="عرض الرسائل الترويجية"
                hint="عرض رسائل مخصصة أسفل الفاتورة"
                checked={settings.customerDisplay.showPromoMessages}
                onChange={(showPromoMessages) => patch("customerDisplay", { showPromoMessages })}
              />
            </div>
          </div>
        </>
      ) : null}

      {/* New: same gap as customer_display -- the data model already has a cardReader group. Only
          connection/behaviour fields are reproduced here, not the Figma source's device-identity
          fields (manufacturer/name/model) -- those belong to the named-unit registry
          (pos_devices), the same distinction already settled for the scale type. */}
      {selectedType === "card_reader" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="اسم القارئ">
              <Input
                value={settings.cardReader.name ?? ""}
                aria-label="اسم قارئ البطاقات"
                placeholder="قارئ الكاشير الرئيسي"
                className={FIELD_CLASS}
                onChange={(event) => patch("cardReader", { name: event.target.value || null })}
              />
            </Field>

            <Field label="طريقة الاتصال">
              <SettingsSelect
                value={settings.cardReader.connectionMethod}
                ariaLabel="طريقة اتصال قارئ البطاقات"
                options={Object.entries(CARD_READER_METHOD_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={(value) =>
                  patch("cardReader", { connectionMethod: value as CardReaderConnectionMethod })
                }
              />
            </Field>

            <Field label="مزود الخدمة" required>
              <Input
                value={settings.cardReader.provider ?? ""}
                aria-label="مزود خدمة قارئ البطاقات"
                placeholder="مثال: مدى، Geidea"
                className={FIELD_CLASS}
                onChange={(event) => patch("cardReader", { provider: event.target.value || null })}
              />
            </Field>

            <Field label="رقم الجهاز (Terminal ID)">
              <Input
                value={settings.cardReader.terminalId ?? ""}
                aria-label="رقم الجهاز"
                placeholder="00000000"
                className={cn(FIELD_CLASS, "[direction:ltr]")}
                onChange={(event) =>
                  patch("cardReader", { terminalId: event.target.value || null })
                }
              />
            </Field>
          </div>

          {settings.cardReader.connectionMethod === "api" ? (
            <div className="mt-5 rounded-xl border border-[#e0eaf8] bg-[#f8faff] p-4">
              <p className={cn("mb-3 text-[13px] font-bold", HEADING)}>إعدادات اتصال API</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="نوع المصادقة" required>
                  <SettingsSelect
                    value={settings.cardReader.authType}
                    ariaLabel="نوع مصادقة قارئ البطاقات"
                    options={Object.entries(CARD_READER_AUTH_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(value) =>
                      patch("cardReader", { authType: value as CardReaderAuthType })
                    }
                  />
                </Field>

                <Field label="رابط الـ API" required>
                  <Input
                    value={settings.cardReader.apiUrl ?? ""}
                    aria-label="رابط API قارئ البطاقات"
                    placeholder="https://api.example.com/v2"
                    className={cn(FIELD_CLASS, "[direction:ltr]")}
                    onChange={(event) =>
                      patch("cardReader", { apiUrl: event.target.value || null })
                    }
                  />
                </Field>

                <Field label="مفتاح API" required>
                  <Input
                    type="password"
                    value={settings.cardReader.apiKey ?? ""}
                    aria-label="مفتاح API لقارئ البطاقات"
                    placeholder="sk_live_xxxxxxxxxxx"
                    className={cn(FIELD_CLASS, "[direction:ltr]")}
                    onChange={(event) =>
                      patch("cardReader", { apiKey: event.target.value || null })
                    }
                  />
                </Field>

                <Field label="مهلة الطلب (ثانية)" required>
                  <Input
                    type="number"
                    min={5}
                    max={120}
                    value={settings.cardReader.requestTimeoutSeconds}
                    aria-label="مهلة طلب قارئ البطاقات"
                    className={cn(FIELD_CLASS, "[direction:ltr]")}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      patch("cardReader", {
                        requestTimeoutSeconds: Number.isFinite(next)
                          ? Math.min(120, Math.max(5, next))
                          : 30,
                      })
                    }}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 border-t border-[#f1f4f9] pt-5 sm:grid-cols-2">
            <ToggleRow
              id="card-reader-enabled"
              label="تفعيل قارئ البطاقات"
              hint="السماح بالدفع عبر قارئ البطاقات في نقطة البيع"
              checked={settings.cardReader.enabled}
              onChange={(enabled) => patch("cardReader", { enabled })}
            />
            <ToggleRow
              id="send-digital-receipt"
              label="إرسال إيصال إلكتروني"
              hint="إرسال نسخة من الإيصال عبر البريد أو SMS"
              checked={settings.cardReader.sendDigitalReceipt}
              onChange={(sendDigitalReceipt) => patch("cardReader", { sendDigitalReceipt })}
            />
            <ToggleRow
              id="auto-complete"
              label="إتمام العملية تلقائياً"
              hint="إغلاق شاشة الإيصال تلقائياً بعد نجاح العملية"
              checked={settings.cardReader.autoCompleteAfterSuccess}
              onChange={(autoCompleteAfterSuccess) =>
                patch("cardReader", { autoCompleteAfterSuccess })
              }
            />
            <ToggleRow
              id="sandbox-mode"
              label="وضع الاختبار (Sandbox)"
              hint="استخدام بيئة الاختبار للتجربة"
              checked={settings.cardReader.sandboxMode}
              onChange={(sandboxMode) => patch("cardReader", { sandboxMode })}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}

// The Figma source colors a field's label blue and appends "*" for anything the till cannot run
// without (connection, port, unit...) and leaves it muted/plain for what has a working default
// (baud rate, footer text...). Reproduced literally rather than styling every label the same,
// since that distinction is the only cue the form gives for what actually blocks saving.
function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <Label
        className={cn(
          "mb-1.5 block text-[12px] font-semibold",
          required ? "text-[#2563eb]" : MUTED
        )}
      >
        {label}
        {required ? " *" : null}
      </Label>
      {children}
    </div>
  )
}

// A native select rather than the page's own combobox: these lists are short, fixed, and the
// browser's control already handles RTL and keyboard behaviour here.
// The app's own styled select (Radix, already used for the table's type/status filters above)
// rather than a bare <select> -- a bare select opens the OS's own unstyled system dropdown list,
// which reads as a totally different, unbranded product next to every other control on this page.
function SettingsSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
  ariaLabel: string
}) {
  return (
    <AppSelect value={value} onValueChange={onChange}>
      <AppSelectTrigger aria-label={ariaLabel} className={cn(FIELD_CLASS, "w-full")}>
        <AppSelectValue />
      </AppSelectTrigger>
      <AppSelectContent>
        {options.map((option) => (
          <AppSelectItem key={option.value} value={option.value}>
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelect>
  )
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  // RTL: the copy is written first so the switch sits on the left, as in the reference.
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label htmlFor={id} className={cn("cursor-pointer text-[12.5px] font-semibold", HEADING)}>
          {label}
        </Label>
        <p className={cn("mt-0.5 text-[10.5px]", MUTED)}>{hint}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="h-6 w-11 shrink-0 data-[state=checked]:bg-[#2563eb] [&>span]:size-5"
      />
    </div>
  )
}

// A two-way segmented choice (as opposed to ToggleRow's on/off) -- selecting one clears the
// other, matching the Figma source's mutually-exclusive "الأرقام الأخيرة تمثل" control.
function RadioOptionRow({
  id,
  label,
  selected,
  onSelect,
}: {
  id: string
  label: string
  selected: boolean
  onSelect: () => void
}) {
  // RTL: the label is written first so the radio mark sits on the left, matching ToggleRow.
  return (
    <button
      type="button"
      id={id}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex h-11 items-center justify-between gap-3 rounded-[10px] border px-4 text-[13px] font-semibold transition-colors",
        selected
          ? "border-[#2563eb] bg-[#eff6ff] text-[#0d1b3e]"
          : "border-[#e8edf3] bg-white text-[#0d1b3e] hover:border-[#c7d9ff]"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-[#2563eb]" : "border-[#c7d3e3]"
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-[#2563eb]" /> : null}
      </span>
    </button>
  )
}
