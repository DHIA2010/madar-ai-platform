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
import { useLocale, useTranslations } from "next-intl"
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

import { Can, useAuth } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
import type { OrganizationSettings } from "@/features/workspace"
import { localeDirection, type Locale } from "@/i18n/locales"
import { ROUTES } from "@/constants/routes"
import { cn } from "@/lib/utils"

const CARD =
  "rounded-[12px] border border-[#e8edf3] bg-white shadow-[0_1px_4px_rgba(15,30,62,0.07),0_0_1px_rgba(15,30,62,0.05)]"
const NAVY = "text-[#0d1b3e]"
const MUTED = "text-[#8098b4]"

type GeneralTranslator = ReturnType<typeof useTranslations<"settings.general">>

const CURRENCY_CODES = ["SAR", "USD"] as const

// Real IANA zone identifiers -- written verbatim to organizations.timezone, so these have to be
// zones the platform can actually resolve.
const TIMEZONE_CODES = [
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Africa/Cairo",
  "Asia/Baghdad",
  "Asia/Amman",
  "UTC",
] as const

// Only the locales the app actually ships messages for -- offering more would promise
// translations that do not exist.
const LOCALE_CODES = ["ar", "en"] as const

const COUNTRY_CODES = ["SA", "AE", "KW", "QA", "BH", "OM", "EG", "JO", "IQ", "MA"] as const

function currencyOptions(t: GeneralTranslator) {
  return CURRENCY_CODES.map((code) => ({
    code,
    label: t(`currencies.${code}` as "currencies.SAR"),
  }))
}
function timezoneOptions(t: GeneralTranslator) {
  return TIMEZONE_CODES.map((code) => ({
    code,
    label: t(`timezones.${code}` as "timezones.UTC"),
  }))
}
function localeOptions(t: GeneralTranslator) {
  return LOCALE_CODES.map((code) => ({ code, label: t(`locales.${code}` as "locales.ar") }))
}
function countryOptions(t: GeneralTranslator) {
  return COUNTRY_CODES.map((code) => ({ code, label: t(`countries.${code}` as "countries.SA") }))
}

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
const DIGIT_RULE_LENGTHS: Partial<Record<TextKey, number>> = {
  taxNumber: 15,
  commercialRegistration: 10,
  buildingNumber: 4,
  secondaryNumber: 4,
  postalCode: 5,
}

function validate(draft: Draft, t: GeneralTranslator): Partial<Record<TextKey | "name", string>> {
  const errors: Partial<Record<TextKey | "name", string>> = {}

  if (!draft.name.trim()) {
    errors.name = t("validation.nameRequired")
  }

  for (const [key, length] of Object.entries(DIGIT_RULE_LENGTHS) as [TextKey, number][]) {
    const value = draft.text[key].trim()
    if (value && !new RegExp(`^\\d{${length}}$`).test(value)) {
      errors[key] = t(`validation.${key}` as "validation.taxNumber")
    }
  }

  const email = draft.text.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = t("validation.invalidEmail")
  }

  return errors
}

function getInitials(name: string | undefined, fallback: string) {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/)
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || fallback
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
  const t = useTranslations("settings.general.password")
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
      setErrorText(t("tooShort"))
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorText(t("mismatch"))
      return
    }

    setIsSaving(true)
    try {
      await changePassword({ currentPassword, newPassword })
      toast.success(t("success"))
      // The backend revokes every other active session on a successful change, and the current
      // one isn't excluded -- redirect to login rather than leave the UI on a stale session.
      window.setTimeout(() => {
        window.location.href = "/auth/basic/login/"
      }, 1200)
    } catch {
      setErrorText(t("currentIncorrect"))
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
          <span className={cn("text-[13px] font-bold", NAVY)}>{t("changeTitle")}</span>
          <span className={cn("mt-0.5 text-[12px]", MUTED)}>{t("changeSubtitle")}</span>
        </span>
        <span className="rounded-[8px] border border-[#c7d9ff] bg-white px-4 py-2 text-[12px] font-semibold text-[#2563eb]">
          {t("change")}
        </span>
      </button>
    )
  }

  return (
    <form className="space-y-3 rounded-[10px] border border-[#e8edf3] p-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AppPasswordInput
          label={t("currentPassword")}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          className={FIELD_CLASS}
          labelClassName={LABEL_CLASS}
        />
        <AppPasswordInput
          label={t("newPassword")}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          helperText={t("newPasswordHint")}
          className={FIELD_CLASS}
          labelClassName={LABEL_CLASS}
        />
        <AppPasswordInput
          label={t("confirmPassword")}
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
          {t("cancel")}
        </AppButton>
        <AppButton
          type="submit"
          className="h-11 rounded-[10px] px-5 text-[13px]"
          disabled={isSaving}
        >
          {isSaving ? t("saving") : t("save")}
        </AppButton>
      </div>
    </form>
  )
}

export default function SettingsDashboard() {
  const t = useTranslations("settings.general")
  const locale = useLocale() as Locale
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
      toast.success(t("toasts.logoUpdated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.logoUploadFailed"))
    } finally {
      setIsUploadingLogo(false)
    }
  }

  async function handleSave() {
    if (!currentOrganization) return

    const found = validate(draft, t)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error(t("validation.reviewFields"))
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
      toast.success(t("toasts.settingsSaved"))
    } catch {
      toast.error(t("toasts.saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentOrganization || !canDelete) return
    setIsDeleting(true)
    try {
      await deleteOrganization(currentOrganization.id)
      // The organization this session was working in no longer exists. A full reload (not a
      // client-side route change) lets the workspace provider resolve whatever context remains
      // rather than leaving a dead one -- landing straight on /workspace/select instead of "/"
      // matters: landing on "/" fires ProtectedRoute's own client-side redirect to
      // /workspace/select a moment after this fresh page finishes hydrating, and that
      // immediate cross-route-group redirect right after a hard load reliably crashed the app
      // (a real "Rendered more hooks than during the previous render" error inside Next's own
      // Router, confirmed live -- not a hooks bug in this app's own components). Going straight
      // to the real destination avoids that redirect entirely.
      window.location.href = ROUTES.workspaceSelect
    } catch {
      toast.error(t("toasts.deleteFailed"))
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
    <div dir={localeDirection(locale)} className="flex flex-col gap-4 pb-4">
      <div>
        <h1 className={cn("text-[22px] font-extrabold leading-tight", NAVY)}>{t("title")}</h1>
        <p className={cn("mt-1 text-[13px]", MUTED)}>{t("subtitle")}</p>
      </div>

      <section className={cn(CARD, "p-5")}>
        <SectionHeader
          title={t("accountInfo.title")}
          subtitle={t("accountInfo.subtitle")}
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
                  {getInitials(currentOrganization?.name, t("initialsFallback"))}
                </span>
              )}
            </div>
            <Can permission="settings:edit">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={isUploadingLogo}
                className="flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-[#e8edf3] bg-white py-2 text-[12px] font-semibold text-[#334155] transition-colors hover:border-[#c7d9ff] hover:text-[#2563eb] disabled:opacity-50"
              >
                {isUploadingLogo ? t("accountInfo.changingLogo") : t("accountInfo.changeLogo")}
                <Upload className="size-3" />
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleLogoChange}
              />
            </Can>
          </div>

          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AppInput
              label={t("accountInfo.accountName")}
              required
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              errorText={errors.name}
              className={FIELD_CLASS}
              labelClassName={LABEL_CLASS}
            />
            {textField("commercialRegistration", t("accountInfo.commercialRegistration"), {
              inputMode: "numeric",
              placeholder: "1012345678",
            })}
            {textField("taxNumber", t("accountInfo.taxNumber"), {
              inputMode: "numeric",
              placeholder: "300000000000003",
            })}
            {textField("phone", t("accountInfo.phone"), {
              inputMode: "tel",
              placeholder: "+966 50 000 0000",
            })}
            {textField("email", t("accountInfo.email"), {
              type: "email",
              placeholder: "info@example.sa",
            })}
            {textField("website", t("accountInfo.website"), { placeholder: "example.sa" })}
          </div>
        </div>
      </section>

      <section className={cn(CARD, "p-5")}>
        <SectionHeader
          title={t("nationalAddress.title")}
          subtitle={t("nationalAddress.subtitle")}
          icon={<MapPin className="size-[18px]" />}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {textField("addressShort", t("nationalAddress.addressShort"), {
            placeholder: t("nationalAddress.addressShortPlaceholder"),
          })}
          {textField("buildingNumber", t("nationalAddress.buildingNumber"), {
            inputMode: "numeric",
            placeholder: "0000",
          })}
          {textField("street", t("nationalAddress.street"), {
            placeholder: t("nationalAddress.streetPlaceholder"),
          })}
          {textField("secondaryNumber", t("nationalAddress.secondaryNumber"), {
            inputMode: "numeric",
            placeholder: "0000",
          })}
          {textField("district", t("nationalAddress.district"), {
            placeholder: t("nationalAddress.districtPlaceholder"),
          })}
          {textField("postalCode", t("nationalAddress.postalCode"), {
            inputMode: "numeric",
            placeholder: "00000",
          })}
          {textField("city", t("nationalAddress.city"), {
            placeholder: t("nationalAddress.cityPlaceholder"),
          })}
        </div>
      </section>

      {/* RTL: regional is written first so it lands on the right, notifications on the left. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(CARD, "p-5")}>
          <SectionHeader
            title={t("regional.title")}
            subtitle={t("regional.subtitle")}
            icon={<Globe className="size-[18px]" />}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>
                {t("regional.languageLabel")} <span className="text-[#e0484d]">*</span>
              </span>
              <AppSelect
                value={draft.locale}
                onValueChange={(value) => setDraft((current) => ({ ...current, locale: value }))}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder={t("regional.languagePlaceholder")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  {localeOptions(t).map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>
                {t("regional.timezoneLabel")} <span className="text-[#e0484d]">*</span>
              </span>
              <AppSelect
                value={draft.timezone}
                onValueChange={(value) => setDraft((current) => ({ ...current, timezone: value }))}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder={t("regional.timezonePlaceholder")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  {timezoneOptions(t).map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>{t("regional.currencyLabel")}</span>
              <AppSelect
                value={draft.currency}
                onValueChange={(value) => setDraft((current) => ({ ...current, currency: value }))}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder={t("regional.currencyPlaceholder")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  {currencyOptions(t).map((option) => (
                    <AppSelectItem key={option.code} value={option.code}>
                      {option.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>

            <div className="space-y-1.5">
              <span className={LABEL_CLASS}>{t("regional.countryLabel")}</span>
              <AppSelect
                value={draft.text.country}
                onValueChange={(value) => setText("country", value)}
              >
                <AppSelectTrigger className={cn(FIELD_CLASS, "w-full")}>
                  <AppSelectValue placeholder={t("regional.countryPlaceholder")} />
                </AppSelectTrigger>
                <AppSelectContent>
                  {countryOptions(t).map((option) => (
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
            title={t("notifications.title")}
            subtitle={t("notifications.subtitle")}
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
                <p className={cn("text-[13px] font-bold", NAVY)}>
                  {t("notifications.emailNotifications")}
                </p>
                <p className={cn("mt-0.5 text-[12px]", MUTED)}>
                  {t("notifications.emailNotificationsDescription")}
                </p>
              </div>
            </div>
            <Switch
              checked={draft.notifyEmail}
              onCheckedChange={(next) => setDraft((current) => ({ ...current, notifyEmail: next }))}
              aria-label={t("notifications.emailNotifications")}
              className="h-6 w-11 data-[state=checked]:bg-[#2563eb] [&>span]:size-5"
            />
          </div>

          {/* The preference is stored, but nothing sends on it yet -- there is no notifications
              service in the platform. Saying so beats a switch that silently promises email. */}
          <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-[#c7d9ff] bg-[#eff6ff] px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[#2563eb]" />
            <p className={cn("text-[12px] leading-[1.6]", MUTED)}>
              {t("notifications.notReadyNote")}
            </p>
          </div>
        </section>
      </div>

      <section className={cn(CARD, "p-5")}>
        <SectionHeader
          title={t("security.title")}
          subtitle={t("security.subtitle")}
          icon={<ShieldCheck className="size-[18px]" />}
        />
        <ChangePasswordForm />
      </section>

      {/* RTL: the danger card is written first so it lands on the right and the save action on
          the left, as in the design. */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Can permission="settings:manage">
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
              <span className="text-[14px] font-bold text-[#dc2626]">
                {t("deleteAccount.title")}
              </span>
              <span className="mt-0.5 text-[12.5px] text-[#b06a6a]">
                {t("deleteAccount.description")}
              </span>
            </span>
          </button>
        </Can>

        <Can permission="settings:edit">
          <AppButton
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="h-[74px] shrink-0 rounded-[12px] px-10 text-[15px] font-bold sm:w-[190px]"
          >
            {isSaving ? t("saving") : t("saveChanges")}
          </AppButton>
        </Can>
      </div>

      <p className={cn("text-center text-[12px]", MUTED)}>
        {isDirty ? t("unsavedChanges") : t("allSaved")}
      </p>

      {/* Deleting is irreversible from this screen, so it asks for the account name to be typed
          rather than accepting a single click. */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-[30rem]",
            locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
          )}
        >
          <DialogHeader className="text-right">
            <DialogTitle className={cn("flex items-center gap-2 text-[16px] font-extrabold", NAVY)}>
              <AlertTriangle className="size-5 text-[#dc2626]" />
              {t("deleteAccount.dialogTitle")}
            </DialogTitle>
            <DialogDescription className={cn("text-[12.5px] leading-[1.7]", MUTED)}>
              {t.rich("deleteAccount.dialogDescription", {
                name: savedName || t("deleteAccount.unnamedFallback"),
                b: (chunks) => <span className="font-bold text-[#0d1b3e]">{chunks}</span>,
              })}
            </DialogDescription>
          </DialogHeader>

          <AppInput
            label={t("deleteAccount.confirmLabel")}
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
              {t("deleteAccount.cancel")}
            </AppButton>
            <AppButton
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || isDeleting}
              className="h-11 rounded-[10px] bg-[#dc2626] px-5 text-[13px] text-white hover:bg-[#b91c1c]"
            >
              {isDeleting ? t("deleteAccount.deleting") : t("deleteAccount.confirmDelete")}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className={cn("text-center text-[11.5px]", MUTED)}>
        {t("footer.copyright", { year: new Date().getFullYear() })} &nbsp;|&nbsp;{" "}
        <Link href={ROUTES.privacy} className="hover:text-[#2563eb]">
          {t("footer.privacyPolicy")}
        </Link>
        &nbsp;|&nbsp;
        <Link href={ROUTES.terms} className="hover:text-[#2563eb]">
          {t("footer.termsOfService")}
        </Link>
      </p>
    </div>
  )
}
