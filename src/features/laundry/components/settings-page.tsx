"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { laundryService, type LaundrySettings } from "../services/laundry.service"
import {
  errorText,
  FIELD,
  LABEL,
  LaundryPage,
  Loading,
  MUTED,
  PANEL,
  PRIMARY,
  SwitchRow,
  useLaundryAccess,
  useTx,
} from "./shell"

export function LaundrySettingsPage() {
  const { tx, ar } = useTx()
  const { canManage } = useLaundryAccess()
  const [settings, setSettings] = useState<LaundrySettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void laundryService.settings().then(setSettings)
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      setSettings(await laundryService.saveSettings(settings))
      toast.success(tx("حُفظت الإعدادات.", "Settings saved."))
    } catch (error) {
      toast.error(errorText(error, ar))
    } finally {
      setSaving(false)
    }
  }

  const number = (key: keyof LaundrySettings, label: string, hint?: string) => (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        type="number"
        min={0}
        className={FIELD}
        disabled={!canManage}
        value={String(settings?.[key] ?? "")}
        onChange={(event) =>
          setSettings((current) =>
            current ? { ...current, [key]: Number(event.target.value) } : current
          )
        }
      />
      {hint ? <span className={cn("mt-1 block text-[11.5px]", MUTED)}>{hint}</span> : null}
    </label>
  )
  const toggle = (key: "pricesIncludeTax" | "autoReadyMessage", label: string, hint: string) => (
    <SwitchRow
      checked={Boolean(settings?.[key])}
      disabled={!canManage}
      label={label}
      hint={hint}
      onChange={(checked) =>
        setSettings((current) => (current ? { ...current, [key]: checked } : current))
      }
    />
  )

  return (
    <LaundryPage title={tx("إعدادات المغسلة", "Laundry settings")}>
      {!settings ? (
        <Loading />
      ) : (
        <section className={cn(PANEL, "flex max-w-3xl flex-col gap-4 p-5")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {number("turnaroundHours", tx("مدة الجاهزية (ساعات)", "Turnaround (hours)"))}
            {number(
              "urgentTurnaroundHours",
              tx("مدة الجاهزية للمستعجل (ساعات)", "Urgent turnaround (hours)")
            )}
            {number("urgentSurchargePercent", tx("رسوم الاستعجال (%)", "Urgent charge (%)"))}
            {number("deliveryFee", tx("رسوم التوصيل (ر.س)", "Delivery fee (SAR)"))}
            {number(
              "unclaimedDays",
              tx("يُعد الطلب غير مستلم بعد (أيام)", "Unclaimed after (days)"),
              tx("بعد هذه المدة يظهر في «لم تُستلم».", "After this it shows under Unclaimed.")
            )}
          </div>
          {toggle(
            "pricesIncludeTax",
            tx("الأسعار شاملة الضريبة", "Prices include VAT"),
            tx(
              "كما تعرضها للعميل. الفاتورة تفصل الضريبة تلقائيًا.",
              "As you show them. The invoice breaks VAT out."
            )
          )}
          {toggle(
            "autoReadyMessage",
            tx("أرسل رسالة الجاهزية تلقائيًا", "Send the ready message automatically"),
            tx(
              "عند تحويل الطلب إلى «جاهز» تصل العميل رسالة واتساب (بعد موافقة ميتا على القالب). وإلا تُرسل بضغطة من صفحة الطلب.",
              "When an order turns Ready the customer gets a WhatsApp message (once Meta approves the template). Otherwise send it with a tap."
            )
          )}
          {canManage ? (
            <button
              type="button"
              className={cn(PRIMARY, "self-start")}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {tx("حفظ", "Save")}
            </button>
          ) : null}
        </section>
      )}
    </LaundryPage>
  )
}
