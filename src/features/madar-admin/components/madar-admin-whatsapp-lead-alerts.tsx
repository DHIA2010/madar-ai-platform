"use client"

// Madar Admin -> settings -> WhatsApp: the numbers of Madar's own team that get a WhatsApp alert
// when a new lead arrives (a "talk to sales" request or a new account). The alert goes out with
// the "madar_new_lead" template, so it only works once Meta has approved it (templates above).

import { useState } from "react"
import { toast } from "sonner"

import { AppButton, AppInput } from "@/components/app"

import { platformAdminService } from "../services"
import type { AdminWhatsAppConfig } from "../types/platform-admin.types"

const MAX_NUMBERS = 5

export function MadarAdminWhatsAppLeadAlerts({
  phones,
  onSaved,
}: {
  phones: string[]
  onSaved: (config: AdminWhatsAppConfig) => void
}) {
  const [value, setValue] = useState(phones.join("، "))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const reason = (error: unknown) => {
    const { code, message } = (error ?? {}) as { code?: string; message?: string }
    return code?.startsWith("WHATSAPP_") || code?.startsWith("LEAD_ALERT_") ? message : undefined
  }

  async function save() {
    const numbers = value
      .split(/[,،;\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (numbers.length > MAX_NUMBERS) {
      toast.error(`يمكن إضافة ${MAX_NUMBERS} أرقام كحد أقصى.`)
      return
    }
    setSaving(true)
    try {
      const saved = await platformAdminService.updateWhatsAppConfig({ leadAlertPhones: numbers })
      setValue(saved.leadAlertPhones.join("، "))
      onSaved(saved)
      toast.success(
        saved.leadAlertPhones.length > 0 ? "تم حفظ أرقام التنبيه." : "تم إيقاف تنبيهات العملاء."
      )
    } catch (error) {
      toast.error("تعذر حفظ الأرقام.", { description: reason(error) })
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      const result = await platformAdminService.sendWhatsAppLeadAlertTest()
      if (result.failed > 0) {
        toast.error(`تعذر الإرسال إلى ${result.failed} رقم. تأكد من الأرقام.`)
      } else {
        toast.success("تم إرسال تنبيه تجريبي على واتساب.")
      }
    } catch (error) {
      toast.error("تعذر إرسال التنبيه التجريبي.", { description: reason(error) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <p className="text-sm font-semibold text-foreground">تنبيهات العملاء المحتملين</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        تصل رسالة واتساب إلى هذه الأرقام عند كل طلب تواصل مع المبيعات وكل حساب جديد. تعمل بعد اعتماد
        قالب &quot;تنبيه عميل محتمل جديد&quot; من Meta.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="min-w-[220px] flex-1">
          <AppInput
            dir="ltr"
            inputMode="tel"
            placeholder="05XXXXXXXX"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <AppButton className="h-10 rounded-[10px] px-5" loading={saving} onClick={save}>
          حفظ الأرقام
        </AppButton>
        <AppButton
          variant="outline"
          className="h-10 rounded-[10px]"
          loading={testing}
          disabled={phones.length === 0}
          onClick={sendTest}
        >
          إرسال تنبيه تجريبي
        </AppButton>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        حتى {MAX_NUMBERS} أرقام، افصل بينها بفاصلة. اتركه فارغاً لإيقاف التنبيهات.
      </p>
    </div>
  )
}
