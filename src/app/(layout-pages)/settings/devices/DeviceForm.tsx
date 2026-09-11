"use client"

// إضافة جهاز جديد -- a full page rather than the dialog this used to be.
//
// A device is not two fields: it carries identity, wiring, and behaviour that differs per unit
// (this scale reads three decimals, the bulk one reads one). That does not fit a modal, and a
// modal cannot carry the wiring instructions beside the form where they are actually needed.
//
// The same page edits an existing device via ?id=, so the seven-field layout is maintained once.

import { useCallback, useEffect, useState } from "react"
import {
  Cable,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Inbox,
  Lightbulb,
  Loader2,
  Monitor,
  MonitorCog,
  PlayCircle,
  Printer,
  Save,
  ScanLine,
  Scale as ScaleIcon,
  Settings2,
  Usb,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"
import {
  BAUD_RATES,
  DEFAULT_DEVICE_PRINTER_SETTINGS,
  DEFAULT_DEVICE_SCALE_SETTINGS,
  PRINTER_ROLES,
  posDevicesService,
  type DeviceConnection,
  type DevicePrinterSettings,
  type DeviceScaleSettings,
  type DeviceType,
  type PosDeviceInput,
  type PaperWidth,
  type PosDeviceSettingsInput,
  type PrintDensity,
  type PrintDirection,
  type PrinterCharset,
  type PrinterRole,
  type TrailingDigitMeaning,
} from "@/features/pos/services/pos-device-settings.service"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const PANEL = "rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_2px_10px_rgba(16,42,92,0.04)]"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#667085]"
const FIELD_CLASS =
  "h-11 rounded-[12px] border-[#E8EBF0] bg-white text-[13px] text-[#0b1738] placeholder:text-[#98A2B3]"
const BLUE_TINT = "bg-[#eef4ff] text-[#2878ff]"

const DEVICE_LABEL: Record<DeviceType, { label: string; icon: LucideIcon }> = {
  scale: { label: "ميزان إلكتروني", icon: ScaleIcon },
  receipt_printer: { label: "طابعة فواتير", icon: Printer },
  barcode_scanner: { label: "ماسح باركود", icon: ScanLine },
  cash_drawer: { label: "درج نقود", icon: Inbox },
  customer_display: { label: "شاشة عميل", icon: Monitor },
  card_reader: { label: "قارئ بطاقات", icon: CreditCard },
}

const CONNECTION_LABEL: Record<DeviceConnection, string> = {
  usb: "USB",
  network: "شبكة",
  bluetooth: "بلوتوث",
  serial: "منفذ تسلسلي",
}

// For the breadcrumb's last segment only: the plural section name ("الموازين الإلكترونية"), not
// the singular DEVICE_LABEL used for the type picker -- matches the plural used on the tiles/list
// page (DeviceSettings.tsx's DEVICE_META), so the two screens read as the same place.
const DEVICE_SECTION_LABEL: Record<DeviceType, string> = {
  scale: "الموازين الإلكترونية",
  receipt_printer: "طابعات الفواتير",
  barcode_scanner: "ماسحات الباركود",
  cash_drawer: "أدراج النقود",
  customer_display: "شاشات العملاء",
  card_reader: "قارئات البطاقات",
}

const STEPS = [
  "اختر نوع الجهاز والموديل.",
  "تأكد من توصيل الجهاز بالمنفذ الصحيح.",
  "اضغط على اختبار الاتصال للتأكد من عمل الجهاز.",
  "احفظ الإعدادات.",
]

const DEVICE_TYPE_VALUES = new Set<string>(Object.keys(DEVICE_LABEL))

function isDeviceType(value: string | null): value is DeviceType {
  return value !== null && DEVICE_TYPE_VALUES.has(value)
}

const PRINTER_ROLE_LABEL: Record<PrinterRole, string> = {
  receipt: "إيصالات العملاء",
  kitchen: "شاشة المطبخ",
  bar: "البار",
}

const PAPER_WIDTH_LABEL: Record<PaperWidth, string> = {
  "58mm": "58 مم",
  "80mm": "80 مم",
}

const PRINT_DIRECTION_LABEL: Record<PrintDirection, string> = {
  vertical: "عمودي",
  horizontal: "أفقي",
}

const PRINT_DENSITY_LABEL: Record<PrintDensity, string> = {
  light: "فاتحة",
  normal: "عادية",
  dark: "داكنة",
}

const PRINTER_CHARSET_LABEL: Record<PrinterCharset, string> = {
  utf8: "UTF-8",
  cp1256: "CP1256 (عربي)",
  iso88596: "ISO-8859-6 (عربي)",
}

// Scale and receipt_printer are the only kinds with a per-unit shape; every other kind stores an
// empty object -- same split the backend's settingsFor() draws.
function defaultSettingsFor(deviceType: DeviceType): PosDeviceSettingsInput {
  if (deviceType === "scale") return DEFAULT_DEVICE_SCALE_SETTINGS
  if (deviceType === "receipt_printer") return DEFAULT_DEVICE_PRINTER_SETTINGS
  return {}
}

function buildEmpty(deviceType: DeviceType): PosDeviceInput {
  return {
    name: "",
    deviceType,
    model: null,
    description: null,
    connection: "usb",
    port: null,
    baudRate: 9600,
    enabled: true,
    settings: defaultSettingsFor(deviceType),
  }
}

export default function DeviceForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editingId = searchParams.get("id")
  const isEditing = editingId !== null
  // Set only when a type-specific "إضافة {نوع}" button sent us here (see the الموازين/etc. tiles
  // in DeviceSettings.tsx) -- it pre-selects the type but the field stays editable, in case
  // someone changes their mind before saving.
  const requestedTypeParam = searchParams.get("type")
  const requestedType = isDeviceType(requestedTypeParam) ? requestedTypeParam : null

  const [device, setDevice] = useState<PosDeviceInput>(() => buildEmpty(requestedType ?? "scale"))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const load = useCallback(async () => {
    if (!editingId) return
    setLoading(true)
    try {
      const found = await posDevicesService.get(editingId)
      setDevice({
        name: found.name,
        deviceType: found.deviceType,
        model: found.model,
        description: found.description,
        connection: found.connection,
        port: found.port,
        baudRate: found.baudRate,
        enabled: found.enabled,
        settings: { ...defaultSettingsFor(found.deviceType), ...found.settings },
      })
    } catch {
      toast.error("تعذر تحميل الجهاز.")
    } finally {
      setLoading(false)
    }
  }, [editingId])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (changes: Partial<PosDeviceInput>) =>
    setDevice((current) => ({ ...current, ...changes }))

  const patchSettings = (changes: Partial<DeviceScaleSettings> | Partial<DevicePrinterSettings>) =>
    setDevice((current) => ({ ...current, settings: { ...current.settings, ...changes } }))

  const isScale = device.deviceType === "scale"
  const isPrinter = device.deviceType === "receipt_printer"
  const printerSettings = device.settings as Partial<DevicePrinterSettings>
  const scaleSettings = device.settings as Partial<DeviceScaleSettings>
  // A serial device needs a speed; a USB one negotiates its own, so asking would be noise.
  const needsBaudRate = device.connection === "serial"

  const errors = {
    name: device.name.trim() ? null : "اسم الجهاز مطلوب",
    model: device.model?.trim() ? null : "الموديل مطلوب",
    port: device.port?.trim() ? null : "المنفذ مطلوب",
    baudRate: !needsBaudRate || device.baudRate !== null ? null : "السرعة مطلوبة",
  }
  const isValid = Object.values(errors).every((error) => error === null)

  const save = async () => {
    setShowErrors(true)
    if (!isValid) {
      toast.error("أكمل الحقول المطلوبة قبل الحفظ.")
      return
    }

    setSaving(true)
    try {
      const payload: PosDeviceInput = {
        ...device,
        // Only a scale has these, and only a serial device has a speed -- sending them anyway
        // would store settings the device cannot act on.
        baudRate: needsBaudRate ? device.baudRate : null,
        settings: isScale || isPrinter ? device.settings : {},
      }

      if (editingId) {
        await posDevicesService.update(editingId, payload)
        toast.success("تم حفظ الجهاز.")
      } else {
        await posDevicesService.create(payload)
        toast.success("تمت إضافة الجهاز.")
      }
      router.push(ROUTES.settingsDevices)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? "لا تملك صلاحية إدارة الأجهزة." : "تعذر حفظ الجهاز.", {
        description: status === 403 ? "تواصل مع مالك الحساب لمنحك صلاحية pos:manage." : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  // "تعديل الجهاز" when editing; the type-specific title ("إضافة ميزان إلكتروني") when a tile's
  // own add button sent a type; the generic one otherwise (the "الأجهزة" tab's plain "إضافة
  // جهاز").
  const pageTitle = isEditing
    ? "تعديل الجهاز"
    : requestedType
      ? `إضافة ${DEVICE_LABEL[requestedType].label}`
      : "إضافة جهاز جديد"

  // The breadcrumb's last segment names the SECTION you're in (matching the Figma reference and
  // the tiles page), not the action already stated by the H1 just below it -- once a type is
  // known (editing an existing device, or arriving from a type-specific "إضافة {نوع}" button),
  // repeating the same words in both places is redundant.
  const knownType = isEditing ? device.deviceType : requestedType
  const breadcrumbTail = knownType ? DEVICE_SECTION_LABEL[knownType] : pageTitle

  if (loading) {
    return (
      <div dir="rtl" className={cn("flex items-center gap-2 p-8 text-[13px]", MUTED)}>
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل الجهاز...
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex flex-col gap-5 pb-24">
      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.settings} className="transition-colors hover:text-[#2878ff]">
          الإعدادات
        </Link>
        <ChevronLeft className="size-3.5 text-[#b6c2d4]" />
        <Link href={ROUTES.settingsDevices} className="transition-colors hover:text-[#2878ff]">
          إعدادات الأجهزة
        </Link>
        <ChevronLeft className="size-3.5 text-[#b6c2d4]" />
        <span className={cn("font-semibold", HEADING)}>{breadcrumbTail}</span>
      </nav>

      {/* RTL: the copy is written first so the icon tile lands on its left, as in the reference. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[24px] font-bold leading-tight", HEADING)}>{pageTitle}</h1>
          <p className={cn("mt-1 text-[12.5px]", MUTED)}>
            قم بإعداد جهاز جديد وربطه بالمنفذ المناسب ليعمل مع نظام مدار.
          </p>
        </div>
        <span
          className={cn(
            "flex size-[52px] shrink-0 items-center justify-center rounded-2xl",
            BLUE_TINT
          )}
        >
          <MonitorCog className="size-[24px]" />
        </span>
      </div>

      {/* Its own row below the header, not sharing it with the title -- matching the reference,
          where this is a standalone pill rather than a corner action. RTL: the chevron is written
          first so it lands at the row's start (the right), reading "‹ back". */}
      <div>
        <Button
          variant="outline"
          className="h-10 gap-1.5 rounded-[10px] border-[#E8EBF0] px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
          onClick={() => router.push(ROUTES.settingsDevices)}
        >
          <ChevronRight className="size-4" />
          العودة إلى الأجهزة
        </Button>
      </div>

      {/* RTL: the form is written first so it takes the right, the guidance column the left. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("mb-4 text-[16px] font-bold", HEADING)}>معلومات الجهاز الأساسية</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نوع الجهاز" required>
                <IconSelect
                  value={device.deviceType}
                  ariaLabel="نوع الجهاز"
                  icon={DEVICE_LABEL[device.deviceType].icon}
                  options={Object.entries(DEVICE_LABEL).map(([value, entry]) => ({
                    value,
                    label: entry.label,
                  }))}
                  onChange={(value) => {
                    const deviceType = value as DeviceType
                    patch({ deviceType, settings: defaultSettingsFor(deviceType) })
                  }}
                />
              </Field>

              <Field label="اسم الجهاز" required error={showErrors ? errors.name : null}>
                <Input
                  value={device.name}
                  aria-label="اسم الجهاز"
                  placeholder="ميزان قسم الخضار"
                  className={FIELD_CLASS}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </Field>

              <Field label="الموديل" required error={showErrors ? errors.model : null}>
                <Input
                  value={device.model ?? ""}
                  aria-label="الموديل"
                  placeholder="CAS SW-1"
                  className={FIELD_CLASS}
                  onChange={(event) => patch({ model: event.target.value || null })}
                />
              </Field>

              <Field label="وصف اختياري">
                <Input
                  value={device.description ?? ""}
                  aria-label="وصف اختياري"
                  placeholder="الميزان المستخدم في قسم الخضار والفواكه"
                  className={FIELD_CLASS}
                  onChange={(event) => patch({ description: event.target.value || null })}
                />
              </Field>

              <Field label="المنفذ" required error={showErrors ? errors.port : null}>
                <IconInput
                  value={device.port ?? ""}
                  ariaLabel="المنفذ"
                  placeholder="COM3"
                  icon={Cable}
                  onChange={(value) => patch({ port: value || null })}
                />
              </Field>

              <Field label="نوع الاتصال" required>
                <IconSelect
                  value={device.connection}
                  ariaLabel="نوع الاتصال"
                  icon={Usb}
                  options={Object.entries(CONNECTION_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  onChange={(value) => patch({ connection: value as DeviceConnection })}
                />
              </Field>

              {/* Only a serial device negotiates a speed; USB and network do not. */}
              {needsBaudRate ? (
                <Field
                  label="السرعة (Baud Rate)"
                  required
                  error={showErrors ? errors.baudRate : null}
                >
                  <PlainSelect
                    value={String(device.baudRate ?? 9600)}
                    ariaLabel="السرعة"
                    options={BAUD_RATES.map((rate) => ({
                      value: String(rate),
                      label: String(rate),
                    }))}
                    onChange={(value) => patch({ baudRate: Number(value) })}
                  />
                </Field>
              ) : null}
            </div>
          </section>

          {isScale ? (
            <section className={cn(PANEL, "p-5")}>
              {/* RTL: the icon is written first so it sits to the right of the title. */}
              <div className="mb-4 flex items-center gap-2">
                <Settings2 className="size-[18px] text-[#2878ff]" />
                <h2 className={cn("text-[16px] font-bold", HEADING)}>إعدادات الميزان</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="وحدة الوزن الافتراضية" required>
                  <PlainSelect
                    value={scaleSettings.defaultWeightUnit ?? "kg"}
                    ariaLabel="وحدة الوزن الافتراضية"
                    options={[
                      { value: "kg", label: "كيلوجرام (كجم)" },
                      { value: "g", label: "جرام" },
                    ]}
                    onChange={(value) => patchSettings({ defaultWeightUnit: value as "kg" | "g" })}
                  />
                </Field>

                {/* Reading these as a price when they are a weight charges the wrong amount, so
                    both options are on screen rather than hidden in a list. */}
                <Field label="الأرقام الأخيرة تمثل" required>
                  <RadioPair
                    value={scaleSettings.trailingDigits ?? "weight"}
                    ariaLabel="الأرقام الأخيرة تمثل"
                    options={[
                      { value: "price", label: "السعر" },
                      { value: "weight", label: "الوزن" },
                    ]}
                    onChange={(value) =>
                      patchSettings({ trailingDigits: value as TrailingDigitMeaning })
                    }
                  />
                </Field>

                <Field label="بداية مؤشر الميزان">
                  <Input
                    type="number"
                    min={1}
                    max={255}
                    value={scaleSettings.indicatorStart ?? 1}
                    aria-label="بداية مؤشر الميزان"
                    className={FIELD_CLASS}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      patchSettings({
                        indicatorStart: Number.isFinite(next)
                          ? Math.min(255, Math.max(1, next))
                          : 1,
                      })
                    }}
                  />
                </Field>

                <Field label="الجزء العشري" required>
                  <PlainSelect
                    value={String(scaleSettings.decimals ?? 3)}
                    ariaLabel="الجزء العشري"
                    options={[0, 1, 2, 3, 4].map((value) => ({
                      value: String(value),
                      label: String(value),
                    }))}
                    onChange={(value) => patchSettings({ decimals: Number(value) })}
                  />
                </Field>
              </div>

              <div className="mt-5 grid gap-4 border-t border-[#F1F4F9] pt-5 sm:grid-cols-2">
                <ToggleRow
                  id="auto-zero"
                  label="تصفير الوزن تلقائيا"
                  hint="إعادة تثبيت الميزان إلى الصفر قبل قراءة الوزن."
                  checked={scaleSettings.autoZero ?? true}
                  onChange={(autoZero) => patchSettings({ autoZero })}
                />
                <ToggleRow
                  id="block-unstable"
                  label="منع الإضافة إلى الكاشير"
                  hint="منع إضافة المنتج إذا كان الوزن غير مستقر."
                  checked={scaleSettings.blockUnstableWeight ?? false}
                  onChange={(blockUnstableWeight) => patchSettings({ blockUnstableWeight })}
                />
              </div>
            </section>
          ) : null}

          {isPrinter ? (
            <section className={cn(PANEL, "p-5")}>
              {/* RTL: the icon is written first so it sits to the right of the title. */}
              <div className="mb-4 flex items-center gap-2">
                <Printer className="size-[18px] text-[#2878ff]" />
                <h2 className={cn("text-[16px] font-bold", HEADING)}>إعدادات الطابعة</h2>
              </div>

              {/* A restaurant sends the same sale to more than one printer -- a receipt with
                  prices, a kitchen ticket without them. This role only labels what this printer
                  is for; nothing in the platform dispatches a print job to it yet. */}
              <Field label="دور الطابعة" required>
                <PlainSelect
                  value={printerSettings.role ?? "receipt"}
                  ariaLabel="دور الطابعة"
                  options={PRINTER_ROLES.map((role) => ({
                    value: role,
                    label: PRINTER_ROLE_LABEL[role],
                  }))}
                  onChange={(value) => patchSettings({ role: value as PrinterRole })}
                />
              </Field>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="عرض الورق" required>
                  <PlainSelect
                    value={printerSettings.paperWidth ?? "80mm"}
                    ariaLabel="عرض الورق"
                    options={Object.entries(PAPER_WIDTH_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(value) => patchSettings({ paperWidth: value as PaperWidth })}
                  />
                </Field>

                <Field label="اتجاه الطباعة" required>
                  <PlainSelect
                    value={printerSettings.printDirection ?? "vertical"}
                    ariaLabel="اتجاه الطباعة"
                    options={Object.entries(PRINT_DIRECTION_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(value) => patchSettings({ printDirection: value as PrintDirection })}
                  />
                </Field>

                <Field label="كثافة الطباعة" required>
                  <PlainSelect
                    value={printerSettings.printDensity ?? "normal"}
                    ariaLabel="كثافة الطباعة"
                    options={Object.entries(PRINT_DENSITY_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(value) => patchSettings({ printDensity: value as PrintDensity })}
                  />
                </Field>

                <Field label="ترميز الأحرف" required>
                  <PlainSelect
                    value={printerSettings.charset ?? "utf8"}
                    ariaLabel="ترميز الأحرف"
                    options={Object.entries(PRINTER_CHARSET_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={(value) => patchSettings({ charset: value as PrinterCharset })}
                  />
                </Field>

                {/* Only meaningful for a network printer -- kept when switching away so flipping
                    back does not lose an address that was already typed. */}
                {device.connection === "network" ? (
                  <Field label="عنوان الشبكة (IP)">
                    <IconInput
                      value={printerSettings.networkAddress ?? ""}
                      ariaLabel="عنوان الشبكة"
                      placeholder="192.168.1.50"
                      icon={Cable}
                      onChange={(value) => patchSettings({ networkAddress: value || null })}
                    />
                  </Field>
                ) : null}

                <Field label="نص أسفل الإيصال">
                  <Input
                    value={printerSettings.footerText ?? ""}
                    aria-label="نص أسفل الإيصال"
                    placeholder="شكرا لزيارتكم"
                    className={FIELD_CLASS}
                    onChange={(event) => patchSettings({ footerText: event.target.value || null })}
                  />
                </Field>
              </div>

              <div className="mt-5 grid gap-4 border-t border-[#F1F4F9] pt-5 sm:grid-cols-2">
                <ToggleRow
                  id="auto-cut"
                  label="قص الورق تلقائيا"
                  hint="قص الإيصال تلقائيا بعد انتهاء الطباعة."
                  checked={printerSettings.autoCut ?? true}
                  onChange={(autoCut) => patchSettings({ autoCut })}
                />
                <ToggleRow
                  id="print-logo"
                  label="طباعة شعار المتجر"
                  hint="إضافة شعار المتجر أعلى الإيصال."
                  checked={printerSettings.printLogo ?? false}
                  onChange={(printLogo) => patchSettings({ printLogo })}
                />
                <ToggleRow
                  id="extra-copy"
                  label="طباعة نسخة إضافية"
                  hint="طباعة نسخة ثانية من كل إيصال."
                  checked={printerSettings.extraCopy ?? false}
                  onChange={(extraCopy) => patchSettings({ extraCopy })}
                />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          <section className={cn(PANEL, "p-5")}>
            {/* RTL: the title is written first so the icon lands on its left, as in the design. */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={cn("text-[15px] font-bold", HEADING)}>اختبار الجهاز</h2>
              <PlayCircle className="size-[22px] text-[#2878ff]" />
            </div>

            <p className={cn("text-[12px] leading-6", MUTED)}>
              بعد حفظ الجهاز يمكنك اختبار الاتصال للتأكد من أن الجهاز يعمل بشكل صحيح.
            </p>

            {/* Reading a serial port is something only software running on the till can do -- a
                browser cannot reach COM3. The control stays visible with the reason rather than
                pretending to test and always reporting success. */}
            <Button
              variant="outline"
              disabled
              title="اختبار الاتصال يتطلب تطبيق نقطة البيع على جهاز الكاشير"
              className="mt-4 h-11 w-full cursor-not-allowed gap-2 rounded-[12px] border-[#c4d5f0] bg-[#f7faff] text-[13px] font-semibold text-[#2878ff] opacity-70"
            >
              <PlayCircle className="size-4" />
              اختبار الاتصال
            </Button>
            <p className="mt-2 text-center text-[10.5px] text-[#98A2B3]">
              متاح من تطبيق الكاشير على الجهاز نفسه
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={cn("text-[15px] font-bold", HEADING)}>تعليمات سريعة</h2>
              <Lightbulb className="size-[22px] text-[#e08b00]" />
            </div>

            <ol className="flex flex-col gap-3">
              {STEPS.map((step, index) => (
                // RTL: the number is written first so it sits to the right of its step.
                <li key={step} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
                      BLUE_TINT
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className={cn("text-[12px] leading-6", MUTED)}>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {/* RTL: the primary action is written first so it sits at the right of the pair. */}
      <div className="sticky bottom-0 z-30 -mx-[22px] border-t border-[#E8EBF0] bg-white/95 px-6 py-3 backdrop-blur">
        {/* was `fixed inset-x-0`: that draws over the app sidebar's own help card since it
            positions against the whole viewport rather than this settings column. `sticky`
            stays pinned to the bottom without leaving this column's real width; the negative
            margin cancels the settings layout's own px-[22px] so the bar still reaches this
            column's edges. */}
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2.5">
          <Button
            className="h-11 gap-2 rounded-[12px] bg-[#2878ff] px-6 text-[13px] font-semibold text-white hover:bg-[#1f66e0]"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ الجهاز"}
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[12px] border-[#E8EBF0] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
            disabled={saving}
            onClick={() => router.push(ROUTES.settingsDevices)}
          >
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className={cn("mb-1.5 block text-[12px] font-semibold", HEADING)}>
        {label}
        {required ? <span className="text-[#e0484d]"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="mt-1.5 text-[10.5px] text-[#e0484d]">{error}</p> : null}
    </div>
  )
}

function PlainSelect({
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
    <select
      value={value}
      aria-label={ariaLabel}
      className={cn(FIELD_CLASS, "w-full cursor-pointer px-3")}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

// The mark sits at the inline-start and is pointer-transparent, so the whole field still opens
// the list rather than the icon swallowing the click.
function IconSelect({
  value,
  options,
  onChange,
  ariaLabel,
  icon: Icon,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (next: string) => void
  ariaLabel: string
  icon: LucideIcon
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-[#98A2B3]">
        <Icon className="size-4" />
      </span>
      <select
        value={value}
        aria-label={ariaLabel}
        className={cn(FIELD_CLASS, "w-full cursor-pointer ps-10 pe-3")}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function IconInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  icon: Icon,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  placeholder?: string
  icon: LucideIcon
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-[#98A2B3]">
        <Icon className="size-4" />
      </span>
      <Input
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn(FIELD_CLASS, "ps-10")}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

// Two mutually exclusive choices shown side by side rather than in a list: both have to be
// readable at once, since picking the wrong one misprices every weighed item.
function RadioPair({
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
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2.5">
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-between gap-2 rounded-[12px] border px-3 text-[12.5px] font-semibold transition-colors",
              selected
                ? "border-[#2878ff] bg-[#eef4ff] text-[#2878ff]"
                : "border-[#E8EBF0] bg-white text-[#667085] hover:border-[#c4d5f0]"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-[#2878ff]" : "border-[#C4CDD9]"
              )}
            >
              {selected ? <span className="size-2 rounded-full bg-[#2878ff]" /> : null}
            </span>
          </button>
        )
      })}
    </div>
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
  // RTL: the copy is written first so the switch sits on the left, as in the design.
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label htmlFor={id} className={cn("cursor-pointer text-[12.5px] font-bold", HEADING)}>
          {label}
        </Label>
        <p className={cn("mt-0.5 text-[10.5px]", MUTED)}>{hint}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="h-6 w-11 shrink-0 data-[state=checked]:bg-[#2878ff] [&>span]:size-5"
      />
    </div>
  )
}
