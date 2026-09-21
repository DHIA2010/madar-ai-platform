"use client"

import { useEffect, useState } from "react"
import { CreditCard, Monitor, Printer, ScanBarcode, ShoppingCart } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { AppInput, AppSearchableSelect, AppSwitch } from "@/components/app"
import { Button } from "@/components/ui/button"

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
        setLoadError(error instanceof Error ? error.message : "تعذر تحميل إعدادات الكاشير.")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const patch = (partial: Partial<PosSettingsUpdateInput>) => {
    setSettings((current) => (current ? { ...current, ...partial } : current))
  }

  const onSave = async () => {
    if (!settings || isSaving) return
    setIsSaving(true)
    try {
      const result = await posSettingsService.update(settings)
      setSettings(stripUpdatedAt(result))
      toast.success("تم حفظ إعدادات الكاشير بنجاح.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ إعدادات الكاشير.")
    } finally {
      setIsSaving(false)
    }
  }

  const onTestPrint = async () => {
    setIsTestingPrint(true)
    try {
      const result = await pairAndTestDevice()
      if (result.ok) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } finally {
      setIsTestingPrint(false)
    }
  }

  if (isLoading || !settings) {
    return (
      <div className={cn(PANEL, "px-6 py-16 text-center")}>
        <p className={cn("text-[15px] font-semibold", HEADING)}>{loadError ?? "جارٍ التحميل..."}</p>
      </div>
    )
  }

  const printerOptions = [
    { value: "", label: "بدون طابعة افتراضية" },
    ...printers.map((printer) => ({ value: printer.id, label: printer.name })),
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className={cn("text-[22px] font-extrabold leading-tight", HEADING)}>إعدادات الكاشير</h1>
        <p className={cn("mt-1 text-[13px]", MUTED)}>
          إدارة إعدادات نقطة البيع بما يناسب طبيعة منشأتك
        </p>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        {/* Sale settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<ShoppingCart className="size-4" />} title="إعدادات البيع" />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title="السماح بالبيع بأقل من التكلفة"
              description="السماح بإتمام البيع إذا كان سعر البيع أقل من تكلفة المنتج"
              checked={settings.allowBelowCostSale}
              onChange={(checked) => patch({ allowBelowCostSale: checked })}
            />
            <ToggleRow
              title="السماح بالبيع عند نفاد المخزون"
              description="السماح بإتمام البيع حتى لو كانت كمية المنتج في المخزون صفرًا"
              checked={settings.allowOutOfStockSale}
              onChange={(checked) => patch({ allowOutOfStockSale: checked })}
            />
            <ToggleRow
              title="تأكيد عملية البيع"
              description="إظهار رسالة تأكيد قبل إتمام عملية البيع"
              checked={settings.confirmSale}
              onChange={(checked) => patch({ confirmSale: checked })}
            />
            <ToggleRow
              title="فتح درج النقد تلقائياً"
              description="فتح درج النقد مباشرة بعد إتمام الدفع (يتطلب جهازًا مقترنًا عبر متصفح Chrome)"
              checked={settings.autoOpenCashDrawer}
              onChange={(checked) => patch({ autoOpenCashDrawer: checked })}
            />
            <ToggleRow
              title="السماح بتعديل السعر يدوياً"
              description="السماح للكاشير بتعديل سعر المنتج أثناء البيع"
              checked={settings.allowManualPriceEdit}
              onChange={(checked) => patch({ allowManualPriceEdit: checked })}
            />
            <ToggleRow
              title="تطبيق الخصومات"
              description="السماح بتطبيق الخصومات على المبيعات"
              checked={settings.applyDiscounts}
              onChange={(checked) => patch({ applyDiscounts: checked })}
            />
          </div>
        </div>

        {/* Print settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<Printer className="size-4" />} title="إعدادات الطباعة" />
          <div className="space-y-3.5">
            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>
                الطابعة الافتراضية
              </div>
              <AppSearchableSelect
                value={settings.defaultPrinterDeviceId ?? ""}
                options={printerOptions}
                onChange={(value) => patch({ defaultPrinterDeviceId: value || null })}
                triggerClassName="h-10 w-full rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
              />
            </div>

            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>حجم الورق</div>
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
              title="طباعة الفاتورة تلقائياً"
              description="طباعة الفاتورة بعد إتمام عملية البيع"
              checked={settings.autoPrintInvoice}
              onChange={(checked) => patch({ autoPrintInvoice: checked })}
            />
            <ToggleRow
              title="طباعة نسخة للمطبخ"
              description="إضافة نسخة للمطبخ (للمطاعم والمقاهي)"
              checked={settings.printKitchenCopy}
              onChange={(checked) => patch({ printKitchenCopy: checked })}
            />

            <div>
              <div className={cn("mb-1.5 text-[12px] font-semibold", MUTED)}>عدد النسخ</div>
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
              {isTestingPrint ? "جارٍ الاختبار..." : "اختبار الطباعة"}
            </Button>
          </div>
        </div>

        {/* Payment settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<CreditCard className="size-4" />} title="إعدادات الدفع" />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title="الدفع السريع"
              description="عند فتح شاشة الدفع، تُعبَّأ أول وسيلة دفع مفعّلة بكامل المبلغ تلقائيًا"
              checked={settings.showQuickPaymentScreen}
              onChange={(checked) => patch({ showQuickPaymentScreen: checked })}
            />
            <ToggleRow
              title="السماح بأكثر من وسيلة دفع"
              description="إمكانية تقسيم المبلغ على أكثر من وسيلة دفع"
              checked={settings.allowSplitPayment}
              onChange={(checked) => patch({ allowSplitPayment: checked })}
            />
            <ToggleRow
              title="الاحتفاظ بآخر وسيلة دفع"
              description="تذكر آخر وسيلة دفع مستخدمة"
              checked={settings.rememberLastPaymentMethod}
              onChange={(checked) => patch({ rememberLastPaymentMethod: checked })}
            />
            <ToggleRow
              title="إلزام اختيار وسيلة دفع"
              description="يجب اختيار وسيلة دفع لاتمام البيع"
              checked={settings.requirePaymentMethodSelection}
              onChange={(checked) => patch({ requirePaymentMethodSelection: checked })}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        {/* Interface settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<Monitor className="size-4" />} title="إعدادات الواجهة" />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title="عرض صور المنتجات"
              description="إظهار صور المنتجات في شاشة الكاشير"
              checked={settings.showProductImages}
              onChange={(checked) => patch({ showProductImages: checked })}
            />
            <ToggleRow
              title="استخدام الوضع المبسط"
              description="شبكة منتجات أكثر كثافة (بطاقات أصغر) لعرض عدد أكبر دون تمرير"
              checked={settings.useCompactMode}
              onChange={(checked) => patch({ useCompactMode: checked })}
            />
            <ToggleRow
              title="إظهار لوحة المجموعات"
              description="إظهار تصنيفات المنتجات في الشاشة الرئيسية"
              checked={settings.showCategoryPanel}
              onChange={(checked) => patch({ showCategoryPanel: checked })}
            />
            <ToggleRow
              title="زر عرض الشبكة"
              description="إظهار زر التبديل إلى عرض شبكة المنتجات بجانب مربع البحث"
              checked={settings.showGridView}
              onChange={(checked) => patch({ showGridView: checked })}
            />
            <ToggleRow
              title="زر عرض القائمة"
              description="إظهار زر التبديل إلى عرض قائمة عناصر السلة بجانب مربع البحث"
              checked={settings.showListView}
              onChange={(checked) => patch({ showListView: checked })}
            />
          </div>
        </div>

        {/* Scanner settings */}
        <div className={cn(PANEL, "px-5 py-4")}>
          <SectionHeader icon={<ScanBarcode className="size-4" />} title="إعدادات الماسح الضوئي" />
          <div className="divide-y divide-[#eef1f6]">
            <ToggleRow
              title="تفعيل قارئ الباركود"
              description="استخدام قارئ الباركود في الكاشير"
              checked={settings.enableBarcodeScanner}
              onChange={(checked) => patch({ enableBarcodeScanner: checked })}
            />
            <ToggleRow
              title="تشغيل صوت المسح"
              description="إصدار صوت عند قراءة الباركود"
              checked={settings.playScanSound}
              onChange={(checked) => patch({ playScanSound: checked })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={isSaving}
          className="h-10 rounded-[10px] bg-[#2878ff] px-6 text-[13px] font-bold text-white hover:bg-[#1f66e0]"
        >
          {isSaving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </div>
    </div>
  )
}
