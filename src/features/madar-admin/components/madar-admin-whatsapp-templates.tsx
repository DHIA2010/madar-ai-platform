"use client"

// The WhatsApp message templates Madar sends with (e.g. the POS invoice with its PDF) and where
// Meta's review of each stands. A template must be APPROVED before anything can be sent with it;
// "إرسال للاعتماد" submits it (with a sample PDF) and Meta usually answers within minutes to hours.

import { useCallback, useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { AppButton } from "@/components/app"

import { platformAdminService } from "../services"
import type { AdminWhatsAppTemplate } from "../types/platform-admin.types"

const TEMPLATE_LABEL: Record<string, string> = {
  madar_pos_invoice: "فاتورة نقاط البيع (مع ملف PDF)",
  madar_daily_report: "التقرير اليومي للمتجر",
  madar_new_lead: "تنبيه عميل محتمل جديد (لفريق مدار)",
  madar_account_alert: "تنبيه تسجيل حساب جديد (لفريق مدار)",
}

const STATUS: Record<string, { label: string; tint: string }> = {
  APPROVED: { label: "معتمد", tint: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "قيد المراجعة", tint: "bg-amber-100 text-amber-700" },
  REJECTED: { label: "مرفوض", tint: "bg-red-100 text-red-700" },
  PAUSED: { label: "موقوف مؤقتاً", tint: "bg-amber-100 text-amber-700" },
  DISABLED: { label: "معطّل", tint: "bg-red-100 text-red-700" },
  MISSING: { label: "لم يُرسل للاعتماد", tint: "bg-slate-100 text-slate-600" },
}

export function MadarAdminWhatsAppTemplates() {
  const [templates, setTemplates] = useState<AdminWhatsAppTemplate[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    platformAdminService
      .listWhatsAppTemplates()
      .then((result) => setTemplates(result.items))
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (name: string) => {
    setSubmitting(name)
    try {
      await platformAdminService.submitWhatsAppTemplate(name)
      toast.success("تم إرسال القالب لـ Meta للاعتماد.")
      load()
    } catch (error) {
      const { code, message } = (error ?? {}) as { code?: string; message?: string }
      toast.error("تعذر إرسال القالب للاعتماد.", {
        description: code?.startsWith("WHATSAPP_") ? message : undefined,
      })
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">قوالب الرسائل</p>
        <AppButton
          variant="outline"
          className="h-8 rounded-[8px] px-3 text-xs"
          icon={<RotateCcw className="size-3.5" />}
          onClick={load}
        >
          تحديث الحالة
        </AppButton>
      </div>
      {failed ? (
        <p className="text-xs text-muted-foreground">
          تعذر تحميل القوالب -- تأكد من اكتمال إعدادات واتساب أعلاه.
        </p>
      ) : templates === null ? (
        <p className="text-xs text-muted-foreground">جارٍ التحميل...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((template) => {
            const status = STATUS[template.status] ?? {
              label: template.status,
              tint: "bg-slate-100 text-slate-600",
            }
            const canSubmit = template.status === "MISSING" || template.status === "REJECTED"
            return (
              <div
                key={template.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {TEMPLATE_LABEL[template.name] ?? template.name}
                  </p>
                  <p dir="ltr" className="text-right text-xs text-muted-foreground">
                    {template.name} · {template.language} ·{" "}
                    {template.metaCategory ?? template.category}
                  </p>
                  {template.metaCategory === "MARKETING" && template.category !== "MARKETING" ? (
                    <p className="mt-1 text-xs text-amber-700">
                      صنّفت Meta هذا القالب رسالة تسويقية، لذلك قد لا تصل بعض رسائله.
                    </p>
                  ) : null}
                  {template.rejectedReason ? (
                    <p className="mt-1 text-xs text-red-600">
                      سبب الرفض: {template.rejectedReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.tint}`}
                  >
                    {status.label}
                  </span>
                  {canSubmit ? (
                    <AppButton
                      className="h-8 px-3 text-xs"
                      loading={submitting === template.name}
                      onClick={() => void submit(template.name)}
                    >
                      إرسال للاعتماد
                    </AppButton>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
