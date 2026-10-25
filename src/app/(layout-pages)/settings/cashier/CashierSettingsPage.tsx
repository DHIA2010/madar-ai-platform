"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ChevronRight,
  CreditCard,
  FileText,
  Monitor,
  Printer,
  ScanBarcode,
  ShoppingCart,
  StickyNote,
  WifiOff,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"

import { AppInput, AppSearchableSelect, AppSwitch } from "@/components/app"
import { Button } from "@/components/ui/button"

import { FormattedNoteEditor } from "@/features/pos/components/FormattedNoteEditor"

import {
  posDevicesService,
  type PosDevice,
} from "@/features/pos/services/pos-device-settings.service"
import {
  posSettingsService,
  type PosSettings,
  type PosSettingsUpdateInput,
} from "@/features/pos/services/pos-settings.service"
import { pairAndTestDevice } from "@/features/pos/services/pos-hardware"

function stripUpdatedAt(settings: PosSettings): PosSettingsUpdateInput {
  const rest: Partial<PosSettings> = { ...settings }
  delete rest.updatedAt
  return rest as PosSettingsUpdateInput
}

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"

interface ToggleRowProps {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ title, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className={cn("text-[13px] font-semibold", HEADING)}>{title}</div>
        <div className={cn("mt-0.5 text-[11px]", MUTED)}>{description}</div>
      </div>
      <AppSwitch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="text-[#5b6b85]">{icon}</span>
      <h2 className={cn("text-[15px] font-bold", HEADING)}>{title}</h2>
    </div>
  )
}

export function CashierSettingsPage() {
  const t = useTranslations("settings.cashier")
  const [settings, setSettings] = useState<PosSettingsUpdateInput | null>(null)
  const [printers, setPrinters] = useState<PosDevice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingPrint, setIsTestingPrint] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    Promise.all([posSettingsService.get(), posDevicesService.list()])
      .then(([loadedSettings, devices]) => {
        if (cancelled) return
        setSettings(stripUpdatedAt(loadedSettings))
        setPrinters(devices.filter((device) => device.deviceType === "receipt_printer"))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : t("loadError"))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [t])

  const patch = (partial: Partial<PosSettingsUpdateInput>) => {
    setSettings((current) => (current ? { ...current, ...partial } : current))
  }

  const onSave = async () => {
    if (!settings || isSaving) return
    setIsSaving(true)
    try {
      const result = await posSettingsService.update(settings)
      setSettings(stripUpdatedAt(result))
      toast.success(t("toasts.saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  const onTestPrint = async () => {
    setIsTestingPrint(true)
    try {
      const result = await pairAndTestDevice()
      if (result.ok) {
        toast.success(t("print.toasts.success"))
      } else {
        toast.error(t(`print.toasts.${result.code}`))
      }
    } finally {
      setIsTestingPrint(false)
    }
  }

  if (isLoading || !settings) {
    return (
      <div className={cn(PANEL, "px-6 py-16 text-center")}>
        <p className={cn("text-[15px] font-semibold", HEADING)}>{loadError ?? t("loading")}</p>
      </div>
    )
  }

  const printerOptions = [
    { value: "", label: t("print.noDefaultPrinter") },
    ...printers.map((printer) => ({ value: printer.id, label: printer.name })),
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>{t("title")}</h1>
        <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        {/* Sale settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader
            icon={<ShoppingCart className="size-4" />}
            title={t("sale.sectionTitle")}
          />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title={t("sale.allowBelowCostSale.title")}
              description={t("sale.allowBelowCostSale.description")}
              checked={settings.allowBelowCostSale}
              onChange={(checked) => patch({ allowBelowCostSale: checked })}
            />
            <ToggleRow
              title={t("sale.allowOutOfStockSale.title")}
              description={t("sale.allowOutOfStockSale.description")}
              checked={settings.allowOutOfStockSale}
              onChange={(checked) => patch({ allowOutOfStockSale: checked })}
            />
            <ToggleRow
              title={t("sale.confirmSale.title")}
              description={t("sale.confirmSale.description")}
              checked={settings.confirmSale}
              onChange={(checked) => patch({ confirmSale: checked })}
            />
            <ToggleRow
              title={t("sale.autoOpenCashDrawer.title")}
              description={t("sale.autoOpenCashDrawer.description")}
              checked={settings.autoOpenCashDrawer}
              onChange={(checked) => patch({ autoOpenCashDrawer: checked })}
            />
            <ToggleRow
              title={t("sale.allowManualPriceEdit.title")}
              description={t("sale.allowManualPriceEdit.description")}
              checked={settings.allowManualPriceEdit}
              onChange={(checked) => patch({ allowManualPriceEdit: checked })}
            />
            <ToggleRow
              title={t("sale.applyDiscounts.title")}
              description={t("sale.applyDiscounts.description")}
              checked={settings.applyDiscounts}
              onChange={(checked) => patch({ applyDiscounts: checked })}
            />
          </div>

          {/* A full management screen (list + add/edit + per-line formatting), not a toggle, so
              it drills into its own page (/settings/notes) rather than living inline here --
              placed right where an admin configuring sale-time behavior is already looking. */}
          <Link
            href={ROUTES.settingsNotes}
            className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-[#e1e7f0] bg-[#f7f9fd] px-3.5 py-3 transition-colors hover:bg-[#eef4ff]"
          >
            <span className="flex items-start gap-2.5">
              <StickyNote className="mt-0.5 size-4 shrink-0 text-[#5b6b85]" />
              <span>
                <span className={cn("block text-[13px] font-semibold", HEADING)}>
                  {t("sale.manageSavedNotes.title")}
                </span>
                <span className={cn("mt-0.5 block text-[11px]", MUTED)}>
                  {t("sale.manageSavedNotes.description")}
                </span>
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#b6c2d4] rtl:rotate-180" />
          </Link>
        </div>

        {/* Print settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<Printer className="size-4" />} title={t("print.sectionTitle")} />
          <div className="space-y-3.5">
            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                {t("print.defaultPrinterLabel")}
              </div>
              <AppSearchableSelect
                value={settings.defaultPrinterDeviceId ?? ""}
                options={printerOptions}
                onChange={(value) => patch({ defaultPrinterDeviceId: value || null })}
                triggerClassName="h-10 w-full rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
              />
            </div>

            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                {t("print.paperWidthLabel")}
              </div>
              <div className="flex gap-2">
                {(["80mm", "58mm"] as const).map((width) => (
                  <button
                    key={width}
                    type="button"
                    onClick={() => patch({ paperWidth: width })}
                    className={cn(
                      "flex-1 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                      settings.paperWidth === width
                        ? "border-[#2878ff] bg-[#2878ff]/10 text-[#2878ff]"
                        : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fd]"
                    )}
                  >
                    {width}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              title={t("print.autoPrintInvoice.title")}
              description={t("print.autoPrintInvoice.description")}
              checked={settings.autoPrintInvoice}
              onChange={(checked) => patch({ autoPrintInvoice: checked })}
            />
            <ToggleRow
              title={t("print.printKitchenCopy.title")}
              description={t("print.printKitchenCopy.description")}
              checked={settings.printKitchenCopy}
              onChange={(checked) => patch({ printKitchenCopy: checked })}
            />

            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                {t("print.copiesCountLabel")}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => patch({ copiesCount: Math.max(1, settings.copiesCount - 1) })}
                  className="flex size-9 items-center justify-center rounded-[10px] border border-[#e1e7f0] bg-white text-[15px] font-bold text-[#5b6b85] hover:bg-[#f7f9fd]"
                >
                  −
                </button>
                <AppInput
                  value={settings.copiesCount}
                  readOnly
                  className="h-9 w-16 rounded-[10px] border-[#e1e7f0] text-center text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => patch({ copiesCount: Math.min(5, settings.copiesCount + 1) })}
                  className="flex size-9 items-center justify-center rounded-[10px] border border-[#e1e7f0] bg-white text-[15px] font-bold text-[#5b6b85] hover:bg-[#f7f9fd]"
                >
                  +
                </button>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => void onTestPrint()}
              disabled={isTestingPrint}
              className="h-10 w-full rounded-[10px] border-[#e1e7f0] text-[12.5px] font-semibold text-[#5b6b85]"
            >
              {isTestingPrint ? t("print.testingPrint") : t("print.testPrint")}
            </Button>
          </div>
        </div>

        {/* Receipt content */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<FileText className="size-4" />} title={t("receipt.sectionTitle")} />
          <div className="space-y-3.5">
            <ToggleRow
              title={t("receipt.showTitle.title")}
              description={t("receipt.showTitle.description")}
              checked={settings.showReceiptTitle}
              onChange={(checked) => patch({ showReceiptTitle: checked })}
            />
            {settings.showReceiptTitle && (
              <div className="space-y-3.5 rounded-[10px] bg-[#f7f9fd] p-3">
                <div>
                  <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                    {t("receipt.titleLabel")}
                  </div>
                  <FormattedNoteEditor
                    value={settings.receiptTitleLines ?? []}
                    onChange={(lines) => patch({ receiptTitleLines: lines })}
                  />
                </div>
                <div>
                  <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                    {t("receipt.descriptionLabel")}
                  </div>
                  <FormattedNoteEditor
                    value={settings.receiptDescriptionLines ?? []}
                    onChange={(lines) => patch({ receiptDescriptionLines: lines })}
                  />
                </div>
              </div>
            )}

            <ToggleRow
              title={t("receipt.showOrderNumber.title")}
              description={t("receipt.showOrderNumber.description")}
              checked={settings.showOrderNumber}
              onChange={(checked) => patch({ showOrderNumber: checked })}
            />
            {settings.showOrderNumber && (
              <div className="space-y-2.5 rounded-[10px] bg-[#f7f9fd] p-3">
                <div>
                  <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                    {t("receipt.orderNumberResetLabel")}
                  </div>
                  <div className="flex gap-2">
                    {(["daily", "max_value"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          patch({
                            orderNumberResetMode: mode,
                            orderNumberMaxValue:
                              mode === "daily" ? null : settings.orderNumberMaxValue,
                          })
                        }
                        className={cn(
                          "flex-1 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                          settings.orderNumberResetMode === mode
                            ? "border-[#2878ff] bg-[#2878ff]/10 text-[#2878ff]"
                            : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:bg-[#f7f9fd]"
                        )}
                      >
                        {mode === "daily" ? t("receipt.resetDaily") : t("receipt.resetMaxValue")}
                      </button>
                    ))}
                  </div>
                </div>
                {settings.orderNumberResetMode === "max_value" && (
                  <div>
                    <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                      {t("receipt.orderNumberMaxValueLabel")}
                    </div>
                    <AppInput
                      type="number"
                      min={1}
                      max={999999}
                      value={settings.orderNumberMaxValue ?? ""}
                      onChange={(event) =>
                        patch({
                          orderNumberMaxValue: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      className="h-10 w-full rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Payment settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader
            icon={<CreditCard className="size-4" />}
            title={t("payment.sectionTitle")}
          />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title={t("payment.showQuickPaymentScreen.title")}
              description={t("payment.showQuickPaymentScreen.description")}
              checked={settings.showQuickPaymentScreen}
              onChange={(checked) => patch({ showQuickPaymentScreen: checked })}
            />
            <ToggleRow
              title={t("payment.allowSplitPayment.title")}
              description={t("payment.allowSplitPayment.description")}
              checked={settings.allowSplitPayment}
              onChange={(checked) => patch({ allowSplitPayment: checked })}
            />
            <ToggleRow
              title={t("payment.rememberLastPaymentMethod.title")}
              description={t("payment.rememberLastPaymentMethod.description")}
              checked={settings.rememberLastPaymentMethod}
              onChange={(checked) => patch({ rememberLastPaymentMethod: checked })}
            />
            <ToggleRow
              title={t("payment.requirePaymentMethodSelection.title")}
              description={t("payment.requirePaymentMethodSelection.description")}
              checked={settings.requirePaymentMethodSelection}
              onChange={(checked) => patch({ requirePaymentMethodSelection: checked })}
            />
          </div>
        </div>

        {/* Interface settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader
            icon={<Monitor className="size-4" />}
            title={t("interface.sectionTitle")}
          />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title={t("interface.showProductImages.title")}
              description={t("interface.showProductImages.description")}
              checked={settings.showProductImages}
              onChange={(checked) => patch({ showProductImages: checked })}
            />
            <ToggleRow
              title={t("interface.useCompactMode.title")}
              description={t("interface.useCompactMode.description")}
              checked={settings.useCompactMode}
              onChange={(checked) => patch({ useCompactMode: checked })}
            />
            <ToggleRow
              title={t("interface.showCategoryPanel.title")}
              description={t("interface.showCategoryPanel.description")}
              checked={settings.showCategoryPanel}
              onChange={(checked) => patch({ showCategoryPanel: checked })}
            />
            <ToggleRow
              title={t("interface.showGridView.title")}
              description={t("interface.showGridView.description")}
              checked={settings.showGridView}
              onChange={(checked) => patch({ showGridView: checked })}
            />
            <ToggleRow
              title={t("interface.showListView.title")}
              description={t("interface.showListView.description")}
              checked={settings.showListView}
              onChange={(checked) => patch({ showListView: checked })}
            />
          </div>
        </div>

        {/* Scanner settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader
            icon={<ScanBarcode className="size-4" />}
            title={t("scanner.sectionTitle")}
          />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title={t("scanner.enableBarcodeScanner.title")}
              description={t("scanner.enableBarcodeScanner.description")}
              checked={settings.enableBarcodeScanner}
              onChange={(checked) => patch({ enableBarcodeScanner: checked })}
            />
            <ToggleRow
              title={t("scanner.playScanSound.title")}
              description={t("scanner.playScanSound.description")}
              checked={settings.playScanSound}
              onChange={(checked) => patch({ playScanSound: checked })}
            />
          </div>
        </div>

        {/* Offline mode */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<WifiOff className="size-4" />} title={t("offline.sectionTitle")} />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title={t("offline.offlineModeEnabled.title")}
              description={t("offline.offlineModeEnabled.description")}
              checked={settings.offlineModeEnabled}
              onChange={(checked) => patch({ offlineModeEnabled: checked })}
            />
          </div>
        </div>
      </div>

      {/* Sticky so it's always reachable without scrolling to the very bottom -- this page keeps
          growing taller as sections get added (e.g. offline mode above), and the save button is
          the one thing on the page a cashier manager always needs. -mx-[22px] cancels the
          settings layout's own px-[22px] (see settings/layout.tsx) so the bar bleeds edge to
          edge within the content pane rather than floating with gaps on each side. */}
      <div className="sticky bottom-0 -mx-[22px] flex items-center gap-2.5 border-t border-[#e8edf3] bg-white px-[22px] py-3">
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={isSaving}
          className="h-10 rounded-[10px] bg-[#2878ff] px-6 text-[13px] font-bold text-white hover:bg-[#1f66e0]"
        >
          {isSaving ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  )
}
