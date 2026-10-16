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
  ArrowLeft,
  Cable,
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
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { AppError } from "@/lib/errors/app-error"
import { localeDirection, type Locale } from "@/i18n/locales"
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

type DeviceFormTranslator = ReturnType<typeof useTranslations<"settings.deviceForm">>
type DevicesTranslator = ReturnType<typeof useTranslations<"settings.devices">>

const DEVICE_ICON: Record<DeviceType, LucideIcon> = {
  scale: ScaleIcon,
  receipt_printer: Printer,
  barcode_scanner: ScanLine,
  cash_drawer: Inbox,
  customer_display: Monitor,
  card_reader: CreditCard,
}

const DEVICE_TYPE_VALUES = new Set<DeviceType>([
  "scale",
  "receipt_printer",
  "barcode_scanner",
  "cash_drawer",
  "customer_display",
  "card_reader",
])

function isDeviceType(value: string | null): value is DeviceType {
  return value !== null && DEVICE_TYPE_VALUES.has(value as DeviceType)
}

const DEVICE_CONNECTION_VALUES: DeviceConnection[] = ["usb", "network", "bluetooth", "serial"]
const PAPER_WIDTH_VALUES: PaperWidth[] = ["58mm", "80mm"]
const PRINT_DIRECTION_VALUES: PrintDirection[] = ["vertical", "horizontal"]
const PRINT_DENSITY_VALUES: PrintDensity[] = ["light", "normal", "dark"]
const PRINTER_CHARSET_VALUES: PrinterCharset[] = ["utf8", "cp1256", "iso88596"]

function deviceTypeLabel(type: DeviceType, t: DevicesTranslator): string {
  return t(`types.${type}.label` as "types.scale.label")
}
function deviceTypePlural(type: DeviceType, t: DevicesTranslator): string {
  return t(`types.${type}.plural` as "types.scale.plural")
}
function connectionLabel(connection: DeviceConnection, t: DevicesTranslator): string {
  return t(`connections.${connection}` as "connections.usb")
}

function printerRoleLabel(role: PrinterRole, t: DeviceFormTranslator): string {
  return t(`printer.roles.${role}` as "printer.roles.receipt")
}
function paperWidthLabel(width: PaperWidth, t: DeviceFormTranslator): string {
  return t(`printer.paperWidths.${width}` as "printer.paperWidths.58mm")
}
function printDirectionLabel(direction: PrintDirection, t: DeviceFormTranslator): string {
  return t(`printer.directions.${direction}` as "printer.directions.vertical")
}
function printDensityLabel(density: PrintDensity, t: DeviceFormTranslator): string {
  return t(`printer.densities.${density}` as "printer.densities.light")
}
function printerCharsetLabel(charset: PrinterCharset, t: DeviceFormTranslator): string {
  return t(`printer.charsets.${charset}` as "printer.charsets.utf8")
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
  const t = useTranslations("settings.deviceForm")
  const tDevices = useTranslations("settings.devices")
  const tNav = useTranslations("settings.nav")
  const locale = useLocale() as Locale
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
      toast.error(t("toasts.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [editingId, t])

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
    name: device.name.trim() ? null : t("validation.nameRequired"),
    model: device.model?.trim() ? null : t("validation.modelRequired"),
    port: device.port?.trim() ? null : t("validation.portRequired"),
    baudRate: !needsBaudRate || device.baudRate !== null ? null : t("validation.baudRateRequired"),
  }
  const isValid = Object.values(errors).every((error) => error === null)

  const save = async () => {
    setShowErrors(true)
    if (!isValid) {
      toast.error(t("validation.completeRequiredFields"))
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
        toast.success(t("toasts.updated"))
      } else {
        await posDevicesService.create(payload)
        toast.success(t("toasts.created"))
      }
      router.push(ROUTES.settingsDevices)
    } catch (error) {
      const status = error instanceof AppError ? error.status : undefined
      toast.error(status === 403 ? t("toasts.forbidden") : t("toasts.saveFailed"), {
        description: status === 403 ? t("toasts.forbiddenDescription") : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  // The edit title when editing; the type-specific title ("إضافة ميزان إلكتروني") when a tile's
  // own add button sent a type; the generic one otherwise (the "الأجهزة" tab's plain "إضافة
  // جهاز").
  const pageTitle = isEditing
    ? t("editTitle")
    : requestedType
      ? t("addTypeTitle", { type: deviceTypeLabel(requestedType, tDevices) })
      : t("addGenericTitle")

  // The breadcrumb's last segment names the SECTION you're in (matching the Figma reference and
  // the tiles page), not the action already stated by the H1 just below it -- once a type is
  // known (editing an existing device, or arriving from a type-specific "إضافة {نوع}" button),
  // repeating the same words in both places is redundant.
  const knownType = isEditing ? device.deviceType : requestedType
  const breadcrumbTail = knownType ? deviceTypePlural(knownType, tDevices) : pageTitle

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

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-5 pb-24">
      <nav className={cn("flex items-center gap-1.5 text-[11.5px]", MUTED)}>
        <Link href={ROUTES.settings} className="transition-colors hover:text-[#2878ff]">
          {tNav("heading")}
        </Link>
        <ChevronRight className="size-3.5 text-[#b6c2d4] rtl:rotate-180" />
        <Link href={ROUTES.settingsDevices} className="transition-colors hover:text-[#2878ff]">
          {tDevices("breadcrumbCurrent")}
        </Link>
        <ChevronRight className="size-3.5 text-[#b6c2d4] rtl:rotate-180" />
        <span className={cn("font-semibold", HEADING)}>{breadcrumbTail}</span>
      </nav>

      {/* RTL: the copy is written first so the icon tile lands on its left, as in the reference. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={cn("text-[24px] font-bold leading-tight", HEADING)}>{pageTitle}</h1>
          <p className={cn("mt-1 text-[12.5px]", MUTED)}>{t("subtitle")}</p>
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
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {t("backToDevices")}
        </Button>
      </div>

      {/* RTL: the form is written first so it takes the right, the guidance column the left. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <section className={cn(PANEL, "p-5")}>
            <h2 className={cn("mb-4 text-[16px] font-bold", HEADING)}>
              {t("basicInfo.sectionTitle")}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("basicInfo.deviceTypeLabel")} required>
                <IconSelect
                  value={device.deviceType}
                  ariaLabel={t("basicInfo.deviceTypeLabel")}
                  icon={DEVICE_ICON[device.deviceType]}
                  options={Array.from(DEVICE_TYPE_VALUES).map((value) => ({
                    value,
                    label: deviceTypeLabel(value, tDevices),
                  }))}
                  onChange={(value) => {
                    const deviceType = value as DeviceType
                    patch({ deviceType, settings: defaultSettingsFor(deviceType) })
                  }}
                />
              </Field>

              <Field
                label={t("basicInfo.nameLabel")}
                required
                error={showErrors ? errors.name : null}
              >
                <Input
                  value={device.name}
                  aria-label={t("basicInfo.nameLabel")}
                  placeholder={t("basicInfo.namePlaceholder")}
                  className={FIELD_CLASS}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </Field>

              <Field
                label={t("basicInfo.modelLabel")}
                required
                error={showErrors ? errors.model : null}
              >
                <Input
                  value={device.model ?? ""}
                  aria-label={t("basicInfo.modelLabel")}
                  placeholder={t("basicInfo.modelPlaceholder")}
                  className={FIELD_CLASS}
                  onChange={(event) => patch({ model: event.target.value || null })}
                />
              </Field>

              <Field label={t("basicInfo.descriptionLabel")}>
                <Input
                  value={device.description ?? ""}
                  aria-label={t("basicInfo.descriptionLabel")}
                  placeholder={t("basicInfo.descriptionPlaceholder")}
                  className={FIELD_CLASS}
                  onChange={(event) => patch({ description: event.target.value || null })}
                />
              </Field>

              <Field
                label={t("basicInfo.portLabel")}
                required
                error={showErrors ? errors.port : null}
              >
                <IconInput
                  value={device.port ?? ""}
                  ariaLabel={t("basicInfo.portLabel")}
                  placeholder={t("basicInfo.portPlaceholder")}
                  icon={Cable}
                  onChange={(value) => patch({ port: value || null })}
                />
              </Field>

              <Field label={t("basicInfo.connectionTypeLabel")} required>
                <IconSelect
                  value={device.connection}
                  ariaLabel={t("basicInfo.connectionTypeLabel")}
                  icon={Usb}
                  options={DEVICE_CONNECTION_VALUES.map((value) => ({
                    value,
                    label: connectionLabel(value, tDevices),
                  }))}
                  onChange={(value) => patch({ connection: value as DeviceConnection })}
                />
              </Field>

              {/* Only a serial device negotiates a speed; USB and network do not. */}
              {needsBaudRate ? (
                <Field
                  label={t("basicInfo.baudRateLabel")}
                  required
                  error={showErrors ? errors.baudRate : null}
                >
                  <PlainSelect
                    value={String(device.baudRate ?? 9600)}
                    ariaLabel={t("basicInfo.baudRateAriaLabel")}
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
                <h2 className={cn("text-[16px] font-bold", HEADING)}>{t("scale.sectionTitle")}</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("scale.defaultWeightUnitLabel")} required>
                  <PlainSelect
                    value={scaleSettings.defaultWeightUnit ?? "kg"}
                    ariaLabel={t("scale.defaultWeightUnitLabel")}
                    options={[
                      { value: "kg", label: t("scale.kg") },
                      { value: "g", label: t("scale.g") },
                    ]}
                    onChange={(value) => patchSettings({ defaultWeightUnit: value as "kg" | "g" })}
                  />
                </Field>

                {/* Reading these as a price when they are a weight charges the wrong amount, so
                    both options are on screen rather than hidden in a list. */}
                <Field label={t("scale.trailingDigitsLabel")} required>
                  <RadioPair
                    value={scaleSettings.trailingDigits ?? "weight"}
                    ariaLabel={t("scale.trailingDigitsLabel")}
                    options={[
                      { value: "price", label: t("scale.price") },
                      { value: "weight", label: t("scale.weight") },
                    ]}
                    onChange={(value) =>
                      patchSettings({ trailingDigits: value as TrailingDigitMeaning })
                    }
                  />
                </Field>

                <Field label={t("scale.indicatorStartLabel")}>
                  <Input
                    type="number"
                    min={1}
                    max={255}
                    value={scaleSettings.indicatorStart ?? 1}
                    aria-label={t("scale.indicatorStartLabel")}
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

                <Field label={t("scale.decimalsLabel")} required>
                  <PlainSelect
                    value={String(scaleSettings.decimals ?? 3)}
                    ariaLabel={t("scale.decimalsLabel")}
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
                  label={t("scale.autoZeroLabel")}
                  hint={t("scale.autoZeroHint")}
                  checked={scaleSettings.autoZero ?? true}
                  onChange={(autoZero) => patchSettings({ autoZero })}
                />
                <ToggleRow
                  id="block-unstable"
                  label={t("scale.blockUnstableLabel")}
                  hint={t("scale.blockUnstableHint")}
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
                <h2 className={cn("text-[16px] font-bold", HEADING)}>
                  {t("printer.sectionTitle")}
                </h2>
              </div>

              {/* A restaurant sends the same sale to more than one printer -- a receipt with
                  prices, a kitchen ticket without them. This role only labels what this printer
                  is for; nothing in the platform dispatches a print job to it yet. */}
              <Field label={t("printer.roleLabel")} required>
                <PlainSelect
                  value={printerSettings.role ?? "receipt"}
                  ariaLabel={t("printer.roleLabel")}
                  options={PRINTER_ROLES.map((role) => ({
                    value: role,
                    label: printerRoleLabel(role, t),
                  }))}
                  onChange={(value) => patchSettings({ role: value as PrinterRole })}
                />
              </Field>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={t("printer.paperWidthLabel")} required>
                  <PlainSelect
                    value={printerSettings.paperWidth ?? "80mm"}
                    ariaLabel={t("printer.paperWidthLabel")}
                    options={PAPER_WIDTH_VALUES.map((value) => ({
                      value,
                      label: paperWidthLabel(value, t),
                    }))}
                    onChange={(value) => patchSettings({ paperWidth: value as PaperWidth })}
                  />
                </Field>

                <Field label={t("printer.printDirectionLabel")} required>
                  <PlainSelect
                    value={printerSettings.printDirection ?? "vertical"}
                    ariaLabel={t("printer.printDirectionLabel")}
                    options={PRINT_DIRECTION_VALUES.map((value) => ({
                      value,
                      label: printDirectionLabel(value, t),
                    }))}
                    onChange={(value) => patchSettings({ printDirection: value as PrintDirection })}
                  />
                </Field>

                <Field label={t("printer.printDensityLabel")} required>
                  <PlainSelect
                    value={printerSettings.printDensity ?? "normal"}
                    ariaLabel={t("printer.printDensityLabel")}
                    options={PRINT_DENSITY_VALUES.map((value) => ({
                      value,
                      label: printDensityLabel(value, t),
                    }))}
                    onChange={(value) => patchSettings({ printDensity: value as PrintDensity })}
                  />
                </Field>

                <Field label={t("printer.charsetLabel")} required>
                  <PlainSelect
                    value={printerSettings.charset ?? "utf8"}
                    ariaLabel={t("printer.charsetLabel")}
                    options={PRINTER_CHARSET_VALUES.map((value) => ({
                      value,
                      label: printerCharsetLabel(value, t),
                    }))}
                    onChange={(value) => patchSettings({ charset: value as PrinterCharset })}
                  />
                </Field>

                {/* Only meaningful for a network printer -- kept when switching away so flipping
                    back does not lose an address that was already typed. */}
                {device.connection === "network" ? (
                  <Field label={t("printer.networkAddressLabel")}>
                    <IconInput
                      value={printerSettings.networkAddress ?? ""}
                      ariaLabel={t("printer.networkAddressLabel")}
                      placeholder="192.168.1.50"
                      icon={Cable}
                      onChange={(value) => patchSettings({ networkAddress: value || null })}
                    />
                  </Field>
                ) : null}

                <Field label={t("printer.footerTextLabel")}>
                  <Input
                    value={printerSettings.footerText ?? ""}
                    aria-label={t("printer.footerTextLabel")}
                    placeholder={t("printer.footerTextPlaceholder")}
                    className={FIELD_CLASS}
                    onChange={(event) => patchSettings({ footerText: event.target.value || null })}
                  />
                </Field>
              </div>

              <div className="mt-5 grid gap-4 border-t border-[#F1F4F9] pt-5 sm:grid-cols-2">
                <ToggleRow
                  id="auto-cut"
                  label={t("printer.autoCutLabel")}
                  hint={t("printer.autoCutHint")}
                  checked={printerSettings.autoCut ?? true}
                  onChange={(autoCut) => patchSettings({ autoCut })}
                />
                <ToggleRow
                  id="print-logo"
                  label={t("printer.printLogoLabel")}
                  hint={t("printer.printLogoHint")}
                  checked={printerSettings.printLogo ?? false}
                  onChange={(printLogo) => patchSettings({ printLogo })}
                />
                <ToggleRow
                  id="extra-copy"
                  label={t("printer.extraCopyLabel")}
                  hint={t("printer.extraCopyHint")}
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
              <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("testDevice.title")}</h2>
              <PlayCircle className="size-[22px] text-[#2878ff]" />
            </div>

            <p className={cn("text-[12px] leading-6", MUTED)}>{t("testDevice.description")}</p>

            {/* Reading a serial port is something only software running on the till can do -- a
                browser cannot reach COM3. The control stays visible with the reason rather than
                pretending to test and always reporting success. */}
            <Button
              variant="outline"
              disabled
              title={t("testDevice.buttonTitle")}
              className="mt-4 h-11 w-full cursor-not-allowed gap-2 rounded-[12px] border-[#c4d5f0] bg-[#f7faff] text-[13px] font-semibold text-[#2878ff] opacity-70"
            >
              <PlayCircle className="size-4" />
              {t("testDevice.buttonLabel")}
            </Button>
            <p className="mt-2 text-center text-[10.5px] text-[#98A2B3]">
              {t("testDevice.availabilityNote")}
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className={cn("text-[15px] font-bold", HEADING)}>{t("quickSteps.title")}</h2>
              <Lightbulb className="size-[22px] text-[#e08b00]" />
            </div>

            <ol className="flex flex-col gap-3">
              {(t.raw("quickSteps.steps") as string[]).map((step, index) => (
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
            {saving ? t("saving") : t("save")}
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-[12px] border-[#E8EBF0] px-5 text-[13px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
            disabled={saving}
            onClick={() => router.push(ROUTES.settingsDevices)}
          >
            {t("cancel")}
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
