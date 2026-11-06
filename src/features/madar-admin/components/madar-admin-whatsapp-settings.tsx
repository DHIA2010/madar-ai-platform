"use client"

// Madar Admin -> settings -> WhatsApp: Madar's WhatsApp Business Platform setup (Meta's Cloud API,
// no third-party provider). The App Secret and the System User token are write-only -- the
// backend stores them encrypted and only says whether they're set. "اختبار الاتصال" checks the
// setup against Meta; "تفعيل الـ Webhook" points the Meta app's webhook at Madar.

import { useEffect, useState } from "react"
import { CheckCircle2, Copy, XCircle } from "lucide-react"
import { toast } from "sonner"

import { AppButton, AppCard, AppInput } from "@/components/app"

import { platformAdminService } from "../services"
import type {
  AdminWhatsAppCheck,
  AdminWhatsAppConfig,
  AdminWhatsAppConfigPatch,
} from "../types/platform-admin.types"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

// Where Meta sends WhatsApp events: this backend's public webhook route.
const WHATSAPP_WEBHOOK_URL = new URL(
  ["", "v1", "public", "webhooks", "whatsapp"].join(String.fromCharCode(47)),
  getClientEnvironment().API_BASE_URL
).toString()

const CHECK_LABEL: Record<AdminWhatsAppCheck["key"], string> = {
  token: "رمز مستخدم النظام (System User)",
  tokenExpiry: "صلاحية الرمز",
  permissions: "صلاحيات واتساب",
  account: "حساب واتساب للأعمال (WABA)",
  phoneNumbers: "أرقام الهاتف",
  configuredNumber: "رقم الإرسال",
}

type IdField = "appId" | "embeddedSignupConfigId" | "madarWabaId" | "madarPhoneNumberId"

const ID_FIELDS: Array<{ key: IdField; label: string; hint: string }> = [
  { key: "appId", label: "App ID", hint: "من لوحة تطبيق Meta ← App settings ← Basic" },
  {
    key: "embeddedSignupConfigId",
    label: "Embedded Signup Configuration ID",
    hint: "من Facebook Login for Business ← Configurations",
  },
  {
    key: "madarWabaId",
    label: "معرّف حساب واتساب لمدار (WABA ID)",
    hint: "من WhatsApp Manager ← إعدادات الحساب",
  },
  {
    key: "madarPhoneNumberId",
    label: "معرّف رقم مدار (Phone Number ID)",
    hint: "من لوحة التطبيق ← WhatsApp ← API Setup",
  },
]

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <div className="flex gap-2">
        <AppInput readOnly dir="ltr" value={value} onFocus={(event) => event.target.select()} />
        <AppButton
          variant="outline"
          className="h-10 shrink-0 px-3"
          onClick={() => {
            void navigator.clipboard.writeText(value)
            toast.success("تم النسخ.")
          }}
        >
          <Copy className="size-4" />
        </AppButton>
      </div>
    </div>
  )
}

function AwsBadge() {
  return (
    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-200">
      AWS
    </span>
  )
}

export function MadarAdminWhatsAppSettings() {
  const [config, setConfig] = useState<AdminWhatsAppConfig | null>(null)
  const [ids, setIds] = useState<Record<IdField, string>>({
    appId: "",
    embeddedSignupConfigId: "",
    madarWabaId: "",
    madarPhoneNumberId: "",
  })
  const [appSecret, setAppSecret] = useState("")
  const [systemUserToken, setSystemUserToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activating, setActivating] = useState(false)
  const [checks, setChecks] = useState<AdminWhatsAppCheck[] | null>(null)

  const awsField = (field: string) => Boolean(config?.fromAws.some((awsKey) => awsKey === field))

  const apply = (loaded: AdminWhatsAppConfig) => {
    setConfig(loaded)
    setIds({
      appId: loaded.appId,
      embeddedSignupConfigId: loaded.embeddedSignupConfigId,
      madarWabaId: loaded.madarWabaId,
      madarPhoneNumberId: loaded.madarPhoneNumberId,
    })
  }

  useEffect(() => {
    platformAdminService
      .getWhatsAppConfig()
      .then(apply)
      .catch(() => toast.error("تعذر تحميل إعدادات واتساب."))
  }, [])

  // Meta's own reason (WHATSAPP_REJECTED / WHATSAPP_NOT_CONFIGURED), shown under the toast.
  const reason = (error: unknown) => {
    const { code, message } = (error ?? {}) as { code?: string; message?: string }
    return code?.startsWith("WHATSAPP_") ? message : undefined
  }

  async function save() {
    setSaving(true)
    try {
      // Values from AWS aren't sent -- they're changed in the secret, not here.
      const patch: AdminWhatsAppConfigPatch = Object.fromEntries(
        Object.entries(ids).filter(([key]) => !awsField(key as IdField))
      )
      // Secrets are only sent when typed -- empty keeps what's saved.
      if (appSecret.trim()) patch.appSecret = appSecret
      if (systemUserToken.trim()) patch.systemUserToken = systemUserToken
      apply(await platformAdminService.updateWhatsAppConfig(patch))
      setAppSecret("")
      setSystemUserToken("")
      toast.success("تم حفظ إعدادات واتساب.")
    } catch (error) {
      toast.error("تعذر حفظ إعدادات واتساب.", { description: reason(error) })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      setChecks((await platformAdminService.testWhatsAppConnection()).checks)
    } catch (error) {
      toast.error("تعذر اختبار الاتصال.", { description: reason(error) })
    } finally {
      setTesting(false)
    }
  }

  async function activateWebhook() {
    setActivating(true)
    try {
      const result = await platformAdminService.activateWhatsAppWebhook(WHATSAPP_WEBHOOK_URL)
      toast.success(
        result.accountSubscribed
          ? "تم ربط الـ Webhook بالتطبيق وبحساب واتساب لمدار."
          : "تم ربط الـ Webhook بالتطبيق. أضف معرّف حساب واتساب لربطه أيضاً."
      )
    } catch (error) {
      toast.error("تعذر تفعيل الـ Webhook.", { description: reason(error) })
    } finally {
      setActivating(false)
    }
  }

  return (
    <AppCard
      title="واتساب للأعمال (WhatsApp Cloud API من Meta)"
      state={config === null ? "loading" : "idle"}
      className="rounded-2xl border-border/60 shadow-sm"
    >
      <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">
          ربط مباشر بمنصة واتساب للأعمال من Meta بدون أي وسيط. القيم السرية (App Secret ورمز مستخدم
          النظام) تُحفظ مشفّرة ولا تُعرض بعد الحفظ.
        </p>
        {config && config.fromAws.length > 0 ? (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            القيم المعلّمة &quot;AWS&quot; تُقرأ من AWS Secrets Manager (madar/Whatsapp/production)
            -- لتغييرها عدّل السر هناك، ويلتقطها مدار خلال 5 دقائق. إصدار الـ API:{" "}
            {config.apiVersion}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {ID_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
                {field.label}
                {awsField(field.key) ? <AwsBadge /> : null}
              </label>
              <AppInput
                dir="ltr"
                inputMode="numeric"
                readOnly={awsField(field.key)}
                value={ids[field.key]}
                onChange={(event) =>
                  setIds((current) => ({ ...current, [field.key]: event.target.value.trim() }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
              App Secret
              {awsField("appSecret") ? <AwsBadge /> : null}
            </label>
            <AppInput
              readOnly={awsField("appSecret")}
              type="password"
              dir="ltr"
              autoComplete="off"
              placeholder={config?.hasAppSecret ? "محفوظ ✓ -- اتركه فارغاً للإبقاء عليه" : ""}
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
              رمز مستخدم النظام الدائم (System User Token)
              {awsField("systemUserToken") ? <AwsBadge /> : null}
            </label>
            <AppInput
              readOnly={awsField("systemUserToken")}
              type="password"
              dir="ltr"
              autoComplete="off"
              placeholder={
                config?.hasSystemUserToken
                  ? `محفوظ ✓ (…${config.systemUserTokenHint ?? ""}) -- اتركه فارغاً للإبقاء عليه`
                  : ""
              }
              value={systemUserToken}
              onChange={(event) => setSystemUserToken(event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">الـ Webhook</p>
          <div className="grid gap-4 md:grid-cols-2">
            <CopyField label="Callback URL" value={WHATSAPP_WEBHOOK_URL} />
            <CopyField label="Verify token" value={config?.webhookVerifyToken ?? ""} />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            بعد حفظ App ID و App Secret اضغط &quot;تفعيل الـ Webhook&quot; ليربطه مدار بتطبيق Meta
            تلقائياً، أو الصق القيمتين يدوياً في لوحة التطبيق ← WhatsApp ← Configuration.
          </p>
        </div>

        {checks ? (
          <div className="flex flex-col gap-2">
            {checks.map((check) => (
              <div
                key={check.key}
                className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                {check.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                )}
                <div>
                  <p className="font-medium text-foreground">{CHECK_LABEL[check.key]}</p>
                  <p dir="auto" className="text-xs text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px]"
            loading={activating}
            disabled={!config?.hasAppSecret || !ids.appId}
            onClick={activateWebhook}
          >
            تفعيل الـ Webhook
          </AppButton>
          <AppButton
            variant="outline"
            className="h-10 rounded-[10px]"
            loading={testing}
            disabled={!config?.hasSystemUserToken}
            onClick={test}
          >
            اختبار الاتصال
          </AppButton>
          <AppButton className="h-10 rounded-[10px] px-6" loading={saving} onClick={save}>
            حفظ إعدادات واتساب
          </AppButton>
        </div>
      </div>
    </AppCard>
  )
}
