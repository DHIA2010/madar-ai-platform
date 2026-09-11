"use client"

// الإعدادات العامة -- the account's own record as it appears on invoices and official documents,
// its national address, its regional defaults, and account security.
//
// Every field persists for real. name / locale / timezone / currency are columns on the
// organization; everything else is a key in organizations.settings, a free-form jsonb the backend
// MERGES on write (see OrganizationEntity.update), so a partial save never clears the other keys.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bell,
  Building2,
  Globe,
  Info,
  Mail,
  MapPin,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import {
  AppButton,
  AppInput,
  AppPasswordInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
import type { OrganizationSettings } from "@/features/workspace"
import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"

const CARD =
  "rounded-[12px] border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const NAVY = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"

const CURRENCY_OPTIONS = [
  { code: "SAR", label: "الريال السعودي (SAR)" },
  { code: "USD", label: "الدولار الأمريكي (USD)" },
]

// Real IANA zone identifiers -- written verbatim to organizations.timezone, so these have to be
// zones the platform can actually resolve.
const TIMEZONE_OPTIONS = [
  { code: "Asia/Riyadh", label: "الرياض (GMT+3)" },
  { code: "Asia/Dubai", label: "دبي (GMT+4)" },
  { code: "Asia/Kuwait", label: "الكويت (GMT+3)" },
  { code: "Asia/Qatar", label: "الدوحة (GMT+3)" },
  { code: "Asia/Bahrain", label: "المنامة (GMT+3)" },
  { code: "Asia/Muscat", label: "مسقط (GMT+4)" },
  { code: "Africa/Cairo", label: "القاهرة (GMT+2)" },
  { code: "Asia/Baghdad", label: "بغداد (GMT+3)" },
  { code: "Asia/Amman", label: "عمّان (GMT+3)" },
  { code: "UTC", label: "التوقيت العالمي (UTC)" },
]

// Only the locales the app actually ships messages for -- offering more would promise
// translations that do not exist.
const LOCALE_OPTIONS = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
]

const COUNTRY_OPTIONS = [
  { code: "SA", label: "المملكة العربية السعودية" },
  { code: "AE", label: "الإمارات العربية المتحدة" },
  { code: "KW", label: "الكويت" },
  { code: "QA", label: "قطر" },
  { code: "BH", label: "البحرين" },
  { code: "OM", label: "عُمان" },
  { code: "EG", label: "مصر" },
  { code: "JO", label: "الأردن" },
  { code: "IQ", label: "العراق" },
  { code: "MA", label: "المغرب" },
]

// The settings keys this screen owns, as plain text. Kept as one list so the draft, the dirty
// check and the save payload can never drift apart.
const TEXT_KEYS = [
  "commercialRegistration",
  "taxNumber",
  "phone",
  "email",
  "website",
  "addressShort",
  "buildingNumber",
  "street",
  "secondaryNumber",
  "district",
  "postalCode",
  "city",
  "country",
] as const

type TextKey = (typeof TEXT_KEYS)[number]

interface Draft {
  name: string
  locale: string
  timezone: string
  currency: string
  notifyEmail: boolean
  text: Record<TextKey, string>
}

function buildDraft(
  organization: {
    name?: string
    locale?: string
    timezone?: string
    currency?: string
    settings?: OrganizationSettings
  } | null
): Draft {
  const settings = organization?.settings ?? {}
  const text = {} as Record<TextKey, string>
  for (const key of TEXT_KEYS) {
    const value = settings[key]
    text[key] = typeof value === "string" ? value : ""
  }
  return {
    name: organization?.name ?? "",
    locale: organization?.locale ?? "",
    timezone: organization?.timezone ?? "",
    currency: organization?.currency ?? "",
    notifyEmail: settings.notifyEmail ?? false,
    text,
  }
}

// Real formats, not invented ones: a Saudi VAT number is 15 digits, a commercial registration is
// 10, and the National Address uses a 4-digit building number, 4-digit secondary number and
// 5-digit postal code. Blank is always allowed -- these are optional until an invoice needs them.
const DIGIT_RULES: Partial<Record<TextKey, { length: number; message: string }>> = {
  taxNumber: { length: 15, message: "الرقم الضريبي يتكوّن من 15 رقماً." },
  commercialRegistration: { length: 10, message: "رقم السجل التجاري يتكوّن من 10 أرقام." },
  buildingNumber: { length: 4, message: "رقم المبنى يتكوّن من 4 أرقام." },
  secondaryNumber: { length: 4, message: "الرقم الفرعي يتكوّن من 4 أرقام." },
  postalCode: { length: 5, message: "الرمز البريدي يتكوّن من 5 أرقام." },
}

function validate(draft: Draft): Partial<Record<TextKey | "name", string>> {
  const errors: Partial<Record<TextKey | "name", string>> = {}

  if (!draft.name.trim()) {
    errors.name = "اسم الحساب مطلوب."
  }

  for (const [key, rule] of Object.entries(DIGIT_RULES) as [
    TextKey,
    { length: number; message: string },
  ][]) {
    const value = draft.text[key].trim()
    if (value && !new RegExp(`^\\d{${rule.length}}$`).test(value)) {
      errors[key] = rule.message
    }
  }

  const email = draft.text.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "صيغة البريد الإلكتروني غير صحيحة."
  }

  return errors
}

function getInitials(name: string | undefined) {
  if (!name) return "؟"
  const parts = name.trim().split(/\s+/)
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "؟"
  )
}

// RTL: the icon tile is written first so it lands at the right, ahead of the text it labels.
function SectionHeader({
  title,
  subtitle,
  icon,
  tint = "blue",
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  tint?: "blue" | "violet"
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
          tint === "violet" ? "bg-[#f5f3ff] text-[#7c3aed]" : "bg-[#eff6ff] text-[#2563eb]"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className={cn("text-[15px] font-bold", NAVY)}>{title}</h2>
        <p className={cn("mt-0.5 text-[12px]", MUTED)}>{subtitle}</p>
      </div>
    </div>
  )
}

const FIELD_CLASS = "h-11 rounded-[10px] border-[#e8edf3] bg-white text-[13px]"
// #0b1738 is the field-label colour every other form in the app already renders.
const LABEL_CLASS = "text-[12.5px] font-medium text-[#0b1738]"

function ChangePasswordForm() {
  const { changePassword } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setErrorText(null)

    if (newPassword.length < 12) {
      setErrorText("يجب ألا تقل كلمة المرور الجديدة عن 12 حرفاً.")
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorText("كلمتا المرور الجديدتان غير متطابقتين.")
      return
    }

    setIsSaving(true)
    try {
      await changePassword({ currentPassword, newPassword })
      toast.success("تم تغيير كلمة المرور. سيتم تسجيل خروجك الآن.")
      // The backend revokes every other active session on a successful change, and the current
      // one isn't excluded -- redirect to login rather than leave the UI on a stale session.
      window.setTimeout(() => {
        window.location.href = "/auth/basic/login/"
      }, 1200)
    } catch {
      setErrorText("كلمة المرور الحالية غير صحيحة.")
    } finally {
      setIsSaving(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[10px] border border-[#e8edf3] bg-[#f8fafc] px-4 py-3.5 text-start transition-colors hover:border-[#c7d9ff] hover:bg-[#eff6ff]"
      >
        <span className="flex flex-col">
          <span className={cn("text-[13px] font-bold", NAVY)}>تغيير كلمة المرور</span>
          <span className={cn("mt-0.5 text-[12px]", MUTED)}>تحديث كلمة المرور الخاصة بحسابك</span>
        </span>
        <span className="rounded-[8px] border border-[#c7d9ff] bg-white px-4 py-2 text-[12px] font-semibold text-[#2563eb]">
          تغيير
        </span>
      </button>
    )
  }

  return (
    <form className="space-y-3 rounded-[10px] border border-[#e8edf3] p-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AppPasswordInput
          label="كلمة المرور الحالية"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          className={FIELD_CLASS}
          labelClassName={LABEL_CLASS}
        />
        <AppPasswordInput
          label="كلمة المرور الجديدة"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          helperText="12 حرفاً على الأقل."
          className={FIELD_CLASS}
          labelClassName={LABEL_CLASS}
        />
        <AppPasswordInput
          label="تأكيد كلمة المرور الجديدة"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          className={FIELD_CLASS}
          labelClassName={LABEL_CLASS}
        />
      </div>
      {errorText ? <p className="text-xs text-rose-600">{errorText}</p> : null}
      <div className="flex justify-end gap-2">
        <AppButton
          type="button"
          variant="outline"
          className="h-11 rounded-[10px] px-5 text-[13px]"
          onClick={() => {
            setExpanded(false)
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setErrorText(null)
          }}
          disabled={isSaving}
        >
          إلغاء
        </AppButton>
        <AppButton
          type="submit"
          className="h-11 rounded-[10px] px-5 text-[13px]"
          disabled={isSaving}
        >
          {isSaving ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
        </AppButton>
      </div>
    </form>
  )
}

export default function SettingsDashboard() {
  const { currentOrganization, updateOrganization, uploadOrganizationLogo, deleteOrganization } =
    useWorkspace()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => buildDraft(currentOrganization))
  const [errors, setErrors] = useState<Partial<Record<TextKey | "name", string>>>({})
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  // The organization arrives after the first render (and changes when the workspace switches),
  // so the draft is rebuilt from it -- but only while the form is clean, so a refresh mid-edit
  // cannot wipe what is being typed.
  const saved = useMemo(() => buildDraft(currentOrganization), [currentOrganization])
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    if (!isDirtyRef.current) setDraft(saved)
  }, [saved])

  const savedName = currentOrganization?.name ?? ""
  const canDelete = deleteConfirmation.trim() === savedName && savedName.length > 0

  const setText = useCallback((key: TextKey, value: string) => {
    setDraft((current) => ({ ...current, text: { ...current.text, [key]: value } }))
  }, [])

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !currentOrganization) return

    setIsUploadingLogo(true)
    try {
      await uploadOrganizationLogo(currentOrganization.id, file)
      toast.success("تم تحديث الشعار")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر رفع الشعار")
    } finally {
      setIsUploadingLogo(false)
    }
  }

  async function handleSave() {
    if (!currentOrganization) return

    const found = validate(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error("راجع الحقول المحدّدة قبل الحفظ.")
      return
    }

    // settings is merged server-side, so sending only this screen's keys leaves anything else
    // stored there untouched.
    const settings: OrganizationSettings = { notifyEmail: draft.notifyEmail }
    for (const key of TEXT_KEYS) {
      settings[key] = draft.text[key].trim()
    }

    setIsSaving(true)
    try {
      await updateOrganization(currentOrganization.id, {
        name: draft.name.trim(),
        locale: draft.locale || undefined,
        timezone: draft.timezone || undefined,
        currency: draft.currency || undefined,
        settings,
      })
      toast.success("تم حفظ الإعدادات")
    } catch {
      toast.error("تعذّر الحفظ. حاول مرة أخرى.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentOrganization || !canDelete) return
    setIsDeleting(true)
    try {
      await deleteOrganization(currentOrganization.id)
      setIsDeleteOpen(false)
      toast.success("تم حذف الحساب")
      // The organization this session was working in no longer exists; a full reload lets the
      // workspace provider resolve whatever context remains rather than leaving a dead one.
      window.setTimeout(() => {
        window.location.href = "/"
      }, 1200)
    } catch {
      toast.error("تعذّر حذف الحساب. حاول مرة أخرى.")
      setIsDeleting(false)
    }
  }

  const textField = (
    key: TextKey,
    label: string,
    extra?: Partial<React.ComponentProps<typeof AppInput>>
  ) => (
    <AppInput
      label={label}
      value={draft.text[key]}
      onChange={(event) => setText(key, event.target.value)}
      errorText={errors[key]}
      className={FIELD_CLASS}
      labelClassName={LABEL_CLASS}
      {...extra}
    />
  )

  return (
    <div dir="rtl" className="flex flex-col gap-4 pb-4">
      <div>
        <h1 className={cn("text-[22px] font-extrabold leading-tight", NAVY)}>الإعدادات العامة</h1>
        <p className={cn("mt-1 text-[13px]", MUTED)}>
          إدارة معلومات الحساب والتهيئات الأساسية للنظام
        </p>
      </div>

      <section className={cn(CARD, "p-5")}>
        <SectionHeader
          title="معلومات الحساب"
          subtitle="بيانات الحساب التي ستظهر في الفواتير والمستندات الرسمية"
          icon={<Building2 className="size-[18px]" />}
        />

        {/* RTL: the logo column is written first so it lands on the right, as in the design. */}
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex w-full shrink-0 flex-col items-center gap-2.5 lg:w-[116px]">
            <div className="flex size-[92px] items-center justify-center overflow-hidden rounded-[12px] border border-[#e8edf3] bg-[#f8fafc]">
              {currentOrganization?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentOrganization.logoUrl}
                  alt={currentOrganization.name}
                  className="size-full object-cover"
                />
              ) : (
                <span className={cn("text-[24px] font-extrabold", NAVY)}>
                  {getInitials(currentOrganization?.name)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploadingLogo}
              className="flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-[#e8edf3] bg-white py-2 text-[12px] font-semibold text-[#334155] transition-colors hover:border-[#c7d9ff] hover:text-[#2563eb] disabled:opacity-50"
            >
              {isUploadingLogo ? "جارٍ الرفع…" : "تغيير الشعار"}
              <Upload className="size-3" />
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AppInput
              label="اسم الحساب"
              required
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              errorText={errors.name}
              className={FIELD_CLASS}
              labelClassName={LABEL_CLASS}
            />
            {textField("commercialRegistration", "رقم السجل التجاري", {
              inputMode: "numeric",
              placeholder: "1012345678",
            })}
            {textField("taxNumber", "الرقم الضريبي", {
              inputMode: "numeric",
              placeholder: "300000000000003",
            })}
            {textField("phone", "رقم الهاتف", {
              inputMode: "tel",
              placeholder: "+966 50 000 0000",
            })}
            {textField("email", "البريد الإلكتروني", {
              type: "email",
              placeholder: "info@example.sa",
            })}
            {textField("website", "الموقع الإلكتروني", { placeholder: "example.sa" })}
          </div>
        </div>
      </section>

      <section className={cn(CARD, "p-5")}>
        <SectionHeader
          title="معلومات العنوان الوطني"
          subtitle="أدخل بيانات العنوان الوطني لاستخدامها في الفواتير والمستندات"
          icon={<MapPin className="size-[18px]" />}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {textField("addressShort", "العنوان المختصر", { placeholder: "حي العليا" })}
          {textField("buildingNumber", "رقم المبنى", { inputMode: "numeric", placeholder: "0000" })}
          {textField("street", "الشارع", { placeholder: "طريق الملك فهد" })}
          {textField("secondaryNumber", "الرقم الفرعي", {
            inputMode: "numeric",
            placeholder: "0000",
          })}
          {textField("district", "الحي", { placeholder: "العليا" })}
          {textField("postalCode", "الرمز البريدي", { inputMode: "numeric", placeholder: "00000" })}
          {textField("city", "المدينة", { placeholder: "الرياض" })}
        </div>
      </section>

      {/* RTL: regional is written first so it lands on the right, notifications on the left. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(CARD, "p-5")}>
          <SectionHeader
            title="الإعدادات الإقليمية"
            subtitle="تحديد اللغة والمنطقة الزمنية والعملة"
            icon={<Globe className="size-[18px]" />}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>
                اللغة <span className="text-[#e0484d]">*</span>
              </span>
              <AppSelect
                value={draft.locale}
                onValueChange={(value) => setDraft((current) => ({ ...current, locale: value }))}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder="اختر اللغة" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {LOCALE_OPTIONS.map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>
                المنطقة الزمنية <span className="text-[#e0484d]">*</span>
              </span>
              <AppSelect
                value={draft.timezone}
                onValueChange={(value) => setDraft((current) => ({ ...current, timezone: value }))}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder="اختر المنطقة الزمنية" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>العملة (عملة التقارير)</span>
              <AppSelect
                value={draft.currency}
                onValueChange={(value) => setDraft((current) => ({ ...current, currency: value }))}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder="اختر العملة" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {CURRENCY_OPTIONS.map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>الدولة</span>
              <AppSelect
                value={draft.text.country}
                onValueChange={(value) => setText("country", value)}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder="اختر الدولة" />
                </AppSelectTrigger>
                <AppSelectContent>
                  {COUNTRY_OPTIONS.map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </section>

        <section className={cn(CARD, "p-5")}>
          <SectionHeader
            title="إعدادات الإشعارات"
            subtitle="تفعيل الإشعارات المهمة عبر القنوات المختلفة"
            icon={<Bell className="size-[18px]" />}
            tint="violet"
          />

          {/* RTL: the mark is written first so it sits at the right of the label. */}
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e8edf3] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb]">
                <Mail className="size-4" />
              </span>
              <div>
                <p className={cn("text-[13px] font-bold", NAVY)}>إشعارات البريد الإلكتروني</p>
                <p className={cn("mt-0.5 text-[12px]", MUTED)}>
                  استلام الإشعارات عبر البريد الإلكتروني
                </p>
              </div>
            </div>
            <Switch
              checked={draft.notifyEmail}
              onCheckedChange={(next) => setDraft((current) => ({ ...current, notifyEmail: next }))}
              aria-label="إشعارات البريد الإلكتروني"
              className="h-6 w-11 data-[state=checked]:bg-[#2563eb] [&>span]:size-5"
            />
          </div>

          {/* The preference is stored, but nothing sends on it yet -- there is no notifications
              service in the platform. Saying so beats a switch that silently promises email. */}
          <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-[#c7d9ff] bg-[#eff6ff] px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[#2563eb]" />
            <p className={cn("text-[12px] leading-[1.6]", MUTED)}>
              يُحفظ تفضيلك الآن، وسيبدأ الإرسال فور تفعيل خدمة الإشعارات على المنصة.
            </p>
          </div>
        </section>
      </div>

      <section className={cn(CARD, "p-5")}>
        <SectionHeader
          title="الأمان وكلمة المرور"
          subtitle="إدارة أمان حسابك وتغيير كلمة المرور"
          icon={<ShieldCheck className="size-[18px]" />}
        />
        <ChangePasswordForm />
      </section>

      {/* RTL: the danger card is written first so it lands on the right and the save action on
          the left, as in the design. */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => {
            setDeleteConfirmation("")
            setIsDeleteOpen(true)
          }}
          className="flex flex-1 items-center gap-3 rounded-[12px] border border-[#f7d4d4] bg-[#fef4f4] px-5 py-3.5 text-start transition-colors hover:border-[#f0b4b4] hover:bg-[#fdecec]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#fde2e2] text-[#dc2626]">
            <Trash2 className="size-[18px]" />
          </span>
          <span className="flex flex-col">
            <span className="text-[14px] font-bold text-[#dc2626]">حذف الحساب</span>
            <span className="mt-0.5 text-[12.5px] text-[#b06a6a]">
              سيتم حذف جميع البيانات بشكل نهائي ولا يمكن التراجع عن هذا الإجراء
            </span>
          </span>
        </button>

        <AppButton
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="h-[74px] shrink-0 rounded-[12px] px-10 text-[15px] font-bold sm:w-[190px]"
        >
          {isSaving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
        </AppButton>
      </div>

      <p className={cn("text-center text-[12px]", MUTED)}>
        {isDirty ? "لديك تغييرات غير محفوظة." : "كل التغييرات محفوظة."}
      </p>

      {/* Deleting is irreversible from this screen, so it asks for the account name to be typed
          rather than accepting a single click. */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[30rem] [direction:rtl]">
          <DialogHeader className="text-right">
            <DialogTitle className={cn("flex items-center gap-2 text-[16px] font-extrabold", NAVY)}>
              <AlertTriangle className="size-5 text-[#dc2626]" />
              حذف الحساب نهائياً
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-[1.7]", MUTED)}>
              سيتم حذف حساب <span className="font-bold text-[#0d1b3e]">{savedName || "—"}</span>{" "}
              وجميع بياناته. لا يمكن التراجع عن هذا الإجراء. اكتب اسم الحساب للتأكيد.
            </DialogDescription>
          </DialogHeader>

          <AppInput
            label="اسم الحساب"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder={savedName}
            className={FIELD_CLASS}
            labelClassName={LABEL_CLASS}
          />

          <DialogFooter className="gap-2 sm:justify-start">
            <AppButton
              type="button"
              variant="outline"
              className="h-11 rounded-[10px] px-5 text-[13px]"
              onClick={() => setIsDeleteOpen(false)}
              disabled={isDeleting}
            >
              إلغاء
            </AppButton>
            <AppButton
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || isDeleting}
              className="h-11 rounded-[10px] bg-[#dc2626] px-5 text-[13px] text-white hover:bg-[#b91c1c]"
            >
              {isDeleting ? "جارٍ الحذف…" : "حذف الحساب"}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className={cn("text-center text-[11.5px]", MUTED)}>
        © {new Date().getFullYear()} مدار. جميع الحقوق محفوظة &nbsp;|&nbsp;{" "}
        <Link href={ROUTES.privacy} className="hover:text-[#2563eb]">
          سياسة الخصوصية
        </Link>
        &nbsp;|&nbsp;
        <Link href={ROUTES.terms} className="hover:text-[#2563eb]">
          الشروط والأحكام
        </Link>
      </p>
    </div>
  )
}
