"use client"

// Madar Admin -> settings -> WhatsApp: the numbers of Madar's own team that get a WhatsApp alert
// when a new lead arrives (a "talk to sales" request or a new account). A sales request goes out
// with the "madar_new_lead" template and a new account with "madar_account_alert", so each only
// works once Meta has approved it (templates above).
//
// Meta filed both templates under marketing and holds some of those messages back. A number that
// wrote to Madar's number in the last 24 hours gets its alerts as direct messages instead, which
// Meta always delivers -- the list under the field shows where each number stands.

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { AppButton, AppInput } from "@/components/app"

import { platformAdminService } from "../services"
import type {
  AdminWhatsAppConfig,
  AdminWhatsAppLeadAlertStatus,
} from "../types/platform-admin.types"

const MAX_NUMBERS = 5

const riyadhTime = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: "Asia/Riyadh",
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
})

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
  const [status, setStatus] = useState<AdminWhatsAppLeadAlertStatus["numbers"]>([])

  const loadStatus = useCallback(() => {
    platformAdminService
      .getWhatsAppLeadAlertStatus()
      .then((result) => setStatus(result.numbers))
      .catch(() => setStatus([]))
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

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
      loadStatus()
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
      } else if (result.direct < result.sent) {
        toast.success("تم إرسال تنبيهين تجريبيين عبر قوالب Meta.", {
          description:
            "قد تحجب Meta بعضها. ردّ بأي رسالة على محادثة مدار في واتساب لتصلك التنبيهات دائماً.",
        })
      } else {
        toast.success("تم إرسال تنبيهين تجريبيين على واتساب: عميل محتمل وحساب جديد.")
      }
      loadStatus()
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
        تصل رسالة واتساب إلى هذه الأرقام عند كل طلب تواصل مع المبيعات وكل حساب جديد.
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
      {status.length > 0 ? (
        <div className="mt-3 rounded-lg bg-muted/40 p-3">
          <ul className="space-y-1.5">
            {status.map((entry) => (
              <li key={entry.phone} className="flex flex-wrap items-center gap-2 text-xs">
                <span dir="ltr" className="font-medium text-foreground">
                  {entry.phone}
                </span>
                {entry.directUntil ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                    وصول مضمون حتى {riyadhTime.format(new Date(entry.directUntil))}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                    غير مضمون: قد تحجب Meta بعض التنبيهات
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            ليصبح الوصول مضموناً: أرسل من الرقم أي رسالة إلى محادثة مدار في واتساب (المحادثة التي
            تصلك منها التنبيهات). يستمر ذلك 24 ساعة، ويتجدد كلما ضغطت زر &quot;تم الاستلام&quot; في
            أي تنبيه. وقبل انتهاء المدة تصلك رسالة تذكير فيها زر للتجديد.
          </p>
        </div>
      ) : null}
    </div>
  )
}
