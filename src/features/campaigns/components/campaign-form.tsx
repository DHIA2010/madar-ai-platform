"use client"

import { useEffect, useId, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  addMonths,
  format,
  getMonth,
  getYear,
  isValid,
  parse,
  parseISO,
  setMonth,
  setYear,
} from "date-fns"
import {
  Archive,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Heart,
  type LucideIcon,
  Mail,
  Megaphone,
  MousePointerClick,
  PauseCircle,
  PlayCircle,
  Search,
  ShoppingBag,
  Target,
  UserPlus,
} from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCalendar,
  AppCard,
  AppForm,
  AppFormField,
  AppInput,
  AppPopover,
  AppPopoverAnchor,
  AppPopoverContent,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppTextarea,
} from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { useCampaignMutations } from "../hooks"
import type { CampaignDetailsResult, CampaignFormValues } from "../types"
import { campaignFormSchema, type CampaignFormSchemaValues } from "../validators"
import {
  CAMPAIGN_SELECT_CONTENT_CLASSNAME,
  CAMPAIGN_SELECT_ITEM_CLASSNAME,
  CAMPAIGN_SELECT_TRIGGER_CLASSNAME,
} from "./campaign-select-styles"

import { PlatformBadge } from "@/components/platform-badge"

interface CampaignFormProps {
  mode: "create" | "edit"
  campaignId?: string
  initialDetails?: CampaignDetailsResult
}

type SelectOption = {
  value: string
  label: string
}

type StatusOption = {
  value: CampaignFormSchemaValues["status"]
  label: string
  description: string
  icon: LucideIcon
  indicatorClassName: string
}

type SearchOption = SelectOption & {
  initials?: string
}

const DEFAULT_OWNER = "Nora Al-Harbi"

const defaultValues: CampaignFormValues = {
  name: "",
  objective: "",
  channel: "" as CampaignFormValues["channel"],
  budget: 0,
  startDate: "",
  endDate: "",
  audience: "",
  country: "",
  language: "",
  status: "draft",
  owner: DEFAULT_OWNER,
}

// Campaign-form brand/channel names (Meta Ads, Google Ads, etc.) are left untranslated, matching
// the rest of this rollout -- only the option labels built below from translations change with
// locale.
const CHANNEL_OPTIONS: SelectOption[] = [
  { value: "meta", label: "Meta Ads" },
  { value: "google", label: "Google Ads" },
  { value: "tiktok", label: "TikTok Ads" },
  { value: "snapchat", label: "Snapchat Ads" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "email", label: "Email" },
]

type CampaignsTranslator = ReturnType<typeof useTranslations<"campaigns">>

function getObjectiveOptions(t: CampaignsTranslator): SelectOption[] {
  return [
    { value: "awareness", label: t("form.fields.objective.options.awareness") },
    { value: "traffic", label: t("form.fields.objective.options.traffic") },
    { value: "leads", label: t("form.fields.objective.options.leads") },
    { value: "conversions", label: t("metrics.columns.conversions") },
    { value: "sales", label: t("form.fields.objective.options.sales") },
    { value: "engagement", label: t("form.fields.objective.options.engagement") },
  ]
}

function getLanguageOptions(t: CampaignsTranslator): SelectOption[] {
  return [
    { value: "Arabic", label: t("form.fields.language.options.arabic") },
    { value: "English", label: t("form.fields.language.options.english") },
    { value: "Both", label: t("form.fields.language.options.both") },
  ]
}

function getStatusOptions(t: CampaignsTranslator): StatusOption[] {
  return [
    {
      value: "draft",
      label: t("statusBadge.status.draft"),
      description: t("form.fields.status.options.draft.description"),
      icon: Circle,
      indicatorClassName: "bg-amber-400",
    },
    {
      value: "scheduled",
      label: t("statusBadge.status.scheduled"),
      description: t("form.fields.status.options.scheduled.description"),
      icon: Clock3,
      indicatorClassName: "bg-sky-400",
    },
    {
      value: "active",
      label: t("statusBadge.status.active"),
      description: t("form.fields.status.options.active.description"),
      icon: PlayCircle,
      indicatorClassName: "bg-emerald-400",
    },
    {
      value: "paused",
      label: t("statusBadge.status.paused"),
      description: t("form.fields.status.options.paused.description"),
      icon: PauseCircle,
      indicatorClassName: "bg-orange-400",
    },
    {
      value: "completed",
      label: t("statusBadge.status.completed"),
      description: t("form.fields.status.options.completed.description"),
      icon: CheckCircle2,
      indicatorClassName: "bg-violet-400",
    },
    {
      value: "archived",
      label: t("statusBadge.status.archived"),
      description: t("form.fields.status.options.archived.description"),
      icon: Archive,
      indicatorClassName: "bg-slate-400",
    },
  ]
}

const DATE_INPUT_CLASSNAME =
  "h-12 rounded-xl border border-border/70 bg-background px-3 text-sm font-medium shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

const MANUAL_DATE_FORMATS = [
  "MMM d, yyyy",
  "MMMM d, yyyy",
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "yyyy-MM-dd",
] as const
// Month names and the two-letter weekday abbreviations below come from the shared
// `dateRangeFilter` namespace (months/weekdaysShort) instead of being hardcoded here -- this
// calendar was previously Arabic-only regardless of the active locale, unlike AppDateField/
// AppDateRangeFilter's own calendar headers (components/app/date-field.tsx,
// date-range-filter.tsx), which already read that same namespace so every date picker in the
// app both reads the same way and follows the current locale.
const YEAR_OPTIONS = Array.from({ length: 26 }, (_, index) => 2020 + index)

function parseIsoDate(value: string) {
  if (!value) {
    return undefined
  }

  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : undefined
}

function formatDateForInput(value: string) {
  const parsed = parseIsoDate(value)
  if (!parsed) {
    return ""
  }

  return format(parsed, "MMM d, yyyy")
}

function parseManualDateInput(input: string) {
  const value = input.trim()
  if (!value) {
    return undefined
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseIsoDate(value)
  }

  for (const pattern of MANUAL_DATE_FORMATS) {
    const parsed = parse(value, pattern, new Date())
    if (isValid(parsed)) {
      return parsed
    }
  }

  return undefined
}

function toIsoDateString(date: Date) {
  return format(date, "yyyy-MM-dd")
}

const COUNTRY_OPTIONS: SearchOption[] = [
  { value: "Saudi Arabia", label: "Saudi Arabia" },
  { value: "United Arab Emirates", label: "United Arab Emirates" },
  { value: "Qatar", label: "Qatar" },
  { value: "Kuwait", label: "Kuwait" },
  { value: "Bahrain", label: "Bahrain" },
  { value: "Oman", label: "Oman" },
  { value: "Jordan", label: "Jordan" },
  { value: "Egypt", label: "Egypt" },
]

const AUDIENCE_OPTIONS: SearchOption[] = [
  { value: "SMB decision makers", label: "SMB decision makers" },
  { value: "Retail shoppers 18-45", label: "Retail shoppers 18-45" },
  {
    value: "Directors and VPs in mid-market companies",
    label: "Directors and VPs in mid-market companies",
  },
  { value: "Enterprise buyers", label: "Enterprise buyers" },
  { value: "High-intent website visitors", label: "High-intent website visitors" },
  { value: "Returning customers", label: "Returning customers" },
]

// Plain text fields at the same height as the selects and date fields beside them.
const TEXT_INPUT_CLASSNAME = "h-12 rounded-xl px-4 text-sm font-medium"

const OBJECTIVE_ICONS: Record<string, LucideIcon> = {
  awareness: Megaphone,
  traffic: MousePointerClick,
  leads: UserPlus,
  conversions: Target,
  sales: ShoppingBag,
  engagement: Heart,
}

const CHANNEL_LOGO: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  snapchat: "Snapchat",
}

function ChannelIcon({ channel }: { channel: string }) {
  const logo = CHANNEL_LOGO[channel]
  if (logo) return <PlatformBadge platform={logo} className="size-10" iconClassName="size-5" />
  const Icon = channel === "email" ? Mail : Briefcase
  return (
    <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-5" />
    </span>
  )
}

// A question answered by tapping one large card instead of opening a dropdown.
function ChoiceGrid({
  label,
  options,
  value,
  onValueChange,
  columns,
  errorText,
}: {
  label: string
  options: Array<SelectOption & { description?: string; icon: React.ReactNode }>
  value: string
  onValueChange: (value: string) => void
  columns: string
  errorText?: string
}) {
  return (
    <div>
      <p className="mb-2.5 text-sm font-semibold text-foreground">
        {label} <span className="text-destructive">*</span>
      </p>
      <div className={cn("grid gap-3", columns)}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onValueChange(option.value)}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-xl border-2 p-3.5 text-start transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border/70 bg-background hover:border-primary/40"
              )}
            >
              {option.icon}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {selected ? <CheckCircle2 className="size-5 shrink-0 text-primary" /> : null}
            </button>
          )
        })}
      </div>
      {errorText ? <p className="mt-1.5 text-xs text-destructive">{errorText}</p> : null}
    </div>
  )
}

function SelectField({
  label,
  required,
  value,
  placeholder,
  options,
  onValueChange,
  errorText,
}: {
  label: string
  required?: boolean
  value: string
  placeholder: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  errorText?: string
}) {
  return (
    <AppFormField label={label} required={required} errorText={errorText}>
      <AppSelect value={value} onValueChange={onValueChange}>
        <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
          <span className="truncate">
            {options.find((option) => option.value === value)?.label ?? placeholder}
          </span>
        </AppSelectTrigger>
        <AppSelectContent
          className={CAMPAIGN_SELECT_CONTENT_CLASSNAME}
          position="popper"
          align="start"
        >
          {options.map((option) => (
            <AppSelectItem
              key={option.value}
              value={option.value}
              className={CAMPAIGN_SELECT_ITEM_CLASSNAME}
            >
              {option.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>
    </AppFormField>
  )
}

function StatusSelectField({
  label,
  required,
  value,
  placeholder,
  onValueChange,
  errorText,
}: {
  label: string
  required?: boolean
  value: CampaignFormSchemaValues["status"]
  placeholder: string
  onValueChange: (value: CampaignFormSchemaValues["status"]) => void
  errorText?: string
}) {
  const t = useTranslations("campaigns")
  const statusOptions = useMemo(() => getStatusOptions(t), [t])
  const selected = statusOptions.find((option) => option.value === value)

  return (
    <AppFormField label={label} required={required} errorText={errorText}>
      <AppSelect
        value={value}
        onValueChange={(next) => onValueChange(next as CampaignFormSchemaValues["status"])}
      >
        <AppSelectTrigger className={CAMPAIGN_SELECT_TRIGGER_CLASSNAME}>
          {selected ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={cn("size-2.5 rounded-full", selected.indicatorClassName)} />
              <selected.icon className="size-4 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{selected.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </AppSelectTrigger>
        <AppSelectContent
          className={cn(CAMPAIGN_SELECT_CONTENT_CLASSNAME, "rounded-2xl p-2")}
          position="popper"
          align="start"
        >
          {statusOptions.map((option) => (
            <AppSelectItem
              key={option.value}
              value={option.value}
              className={cn(CAMPAIGN_SELECT_ITEM_CLASSNAME, "rounded-xl px-3 py-2.5")}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className={cn("mt-1 size-2.5 rounded-full", option.indicatorClassName)} />
                <option.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{option.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </div>
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>
    </AppFormField>
  )
}

function DatePickerField({
  label,
  required,
  value,
  onValueChange,
  errorText,
}: {
  label: string
  required?: boolean
  value: string
  onValueChange: (value: string) => void
  errorText?: string
}) {
  const t = useTranslations("dateRangeFilter")
  const tDateField = useTranslations("dateField")
  const monthOptions = t.raw("months") as string[]
  const weekdayShort = t.raw("weekdaysShort") as string[]

  const id = useId()
  const [open, setOpen] = useState(false)
  const [inputText, setInputText] = useState(formatDateForInput(value))

  const selectedDate = useMemo(() => parseIsoDate(value), [value])
  const [displayMonth, setDisplayMonth] = useState<Date>(() => {
    const source = selectedDate ?? new Date()
    return new Date(source.getFullYear(), source.getMonth(), 1)
  })
  const displayValue = open ? inputText : formatDateForInput(value)
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  function commitManualInput() {
    const next = inputText.trim()
    if (next === "") {
      onValueChange("")
      return
    }

    const parsed = parseManualDateInput(next)
    if (!parsed) {
      return
    }

    onValueChange(toIsoDateString(parsed))
    setInputText(format(parsed, "MMM d, yyyy"))
  }

  return (
    <AppPopover open={open} onOpenChange={setOpen}>
      <AppPopoverAnchor asChild>
        <div>
          <AppInput
            id={id}
            label={label}
            required={required}
            value={displayValue}
            errorText={errorText}
            placeholder={tDateField("placeholder")}
            startIcon={<CalendarDays className="size-4" />}
            className={DATE_INPUT_CLASSNAME}
            onFocus={() => {
              setInputText(formatDateForInput(value))
              const source = selectedDate ?? new Date()
              setDisplayMonth(new Date(source.getFullYear(), source.getMonth(), 1))
              setOpen(true)
            }}
            onClick={() => setOpen(true)}
            onChange={(event) => setInputText(event.target.value)}
            onBlur={() => {
              window.setTimeout(() => {
                commitManualInput()
              }, 100)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false)
              }

              if (event.key === "ArrowDown") {
                setOpen(true)
              }

              if (event.key === "Enter") {
                commitManualInput()
              }
            }}
          />
        </div>
      </AppPopoverAnchor>

      <AppPopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 rounded-[20px] border border-border/60 bg-card p-5 text-foreground shadow-[0_20px_60px_-24px_rgba(59,130,246,0.35),0_30px_80px_-34px_rgba(2,6,23,0.88)] ring-1 ring-blue-400/15 backdrop-blur-xl duration-200 data-open:fade-in-0 data-open:zoom-in-[98%] data-closed:fade-out-0 data-closed:zoom-out-[98%]"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <AppButton
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 rounded-full border border-border/60 bg-background/70 text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-45"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label={t("prevMonth")}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </AppButton>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <AppSelect
              value={String(monthIndex)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }}
            >
              <AppSelectTrigger className="h-10 w-[8.75rem] rounded-full border border-border/50 bg-background/60 px-4 text-sm font-semibold text-foreground shadow-none transition-all duration-200 hover:border-primary/35 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/35">
                <span>{monthOptions[monthIndex]}</span>
              </AppSelectTrigger>
              <AppSelectContent
                className="rounded-2xl border border-border/60 bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
              >
                {monthOptions.map((monthLabel, idx) => (
                  <AppSelectItem
                    key={monthLabel}
                    value={String(idx)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/10 data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground"
                  >
                    {monthLabel}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>

            <AppSelect
              value={String(yearValue)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setYear(current, Number(next)))
              }}
            >
              <AppSelectTrigger className="h-10 w-[7rem] rounded-full border border-border/50 bg-background/60 px-4 text-sm font-semibold text-foreground shadow-none transition-all duration-200 hover:border-primary/35 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/35">
                <span>{yearValue}</span>
              </AppSelectTrigger>
              <AppSelectContent
                className="rounded-2xl border border-border/60 bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
              >
                {YEAR_OPTIONS.map((yearOption) => (
                  <AppSelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/10 data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground"
                  >
                    {yearOption}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </div>

          <AppButton
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 rounded-full border border-border/60 bg-background/70 text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-45"
            onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
            aria-label={t("nextMonth")}
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </AppButton>
        </div>

        <AppCalendar
          mode="single"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) {
              return
            }

            onValueChange(toIsoDateString(date))
            setInputText(format(date, "MMM d, yyyy"))
            setOpen(false)
          }}
          captionLayout="label"
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2035, 11)}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:40px]"
          formatters={{
            formatWeekdayName: (date) => weekdayShort[date.getDay()],
          }}
          classNames={{
            nav: "hidden",
            month_caption: "hidden",
            month: "gap-3",
            weekdays: "mb-3 grid grid-cols-7 gap-2",
            weekday:
              "h-8 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75",
            week: "mt-2 grid grid-cols-7 gap-2",
            day: "rounded-full text-foreground",
            day_button:
              "size-10 rounded-full border border-transparent bg-transparent text-sm font-medium text-foreground transition-all duration-200 ease-out hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35",
            today:
              "rounded-full border border-primary/60 bg-transparent text-foreground shadow-none",
            selected:
              "rounded-full border border-primary bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.22),0_0_24px_rgba(59,130,246,0.36)] hover:bg-primary/90 hover:text-primary-foreground",
            outside: "text-muted-foreground opacity-30",
            disabled: "text-muted-foreground opacity-40",
          }}
        />

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-border/60 pt-4">
          <AppButton
            type="button"
            size="sm"
            variant="outline"
            className="h-10 rounded-xl border-border/60 bg-background/50 px-4 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
            onClick={() => {
              onValueChange("")
              setInputText("")
              setOpen(false)
            }}
          >
            {t("clear")}
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            className="h-10 rounded-xl px-4 text-sm font-medium shadow-[0_14px_30px_-18px_rgba(59,130,246,0.75)] transition-all duration-200 hover:shadow-[0_18px_34px_-18px_rgba(59,130,246,0.8)]"
            onClick={() => {
              const today = new Date()
              onValueChange(toIsoDateString(today))
              setInputText(format(today, "MMM d, yyyy"))
              setOpen(false)
            }}
          >
            {t("today")}
          </AppButton>
        </div>
      </AppPopoverContent>
    </AppPopover>
  )
}

function SearchableSelectField({
  label,
  required,
  value,
  placeholder,
  options,
  onValueChange,
  errorText,
  searchPlaceholder,
}: {
  label: string
  required?: boolean
  value: string
  placeholder: string
  options: SearchOption[]
  onValueChange: (value: string) => void
  errorText?: string
  searchPlaceholder: string
}) {
  const t = useTranslations("campaigns")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = options.find((option) => option.value === value)
  const filteredOptions =
    query.trim() === ""
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="relative">
      <AppInput
        label={label}
        required={required}
        errorText={errorText}
        placeholder={placeholder}
        className={TEXT_INPUT_CLASSNAME}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true)
          setQuery(selected?.label ?? "")
        }}
        onChange={(event) => {
          setOpen(true)
          setQuery(event.target.value)
          if (event.target.value === "") {
            onValueChange("")
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
      />

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-border/70 bg-popover p-1">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <Search className="size-3.5" />
            <span>{searchPlaceholder}</span>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onValueChange(option.value)
                    setQuery(option.label)
                    setOpen(false)
                  }}
                >
                  {option.initials ? (
                    <span className="flex size-6 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-[10px] font-medium text-muted-foreground">
                      {option.initials}
                    </span>
                  ) : null}
                  <span className="truncate">{option.label}</span>
                  <Check
                    className={cn(
                      "ml-auto size-4",
                      option.value === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {t("form.search.noResults")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function CampaignForm({ mode, campaignId, initialDetails }: CampaignFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { createCampaign, updateCampaign } = useCampaignMutations()
  const { currentWorkspace } = useWorkspace()
  const t = useTranslations("campaigns")
  const tCommon = useTranslations("common")

  const objectiveOptions = useMemo(() => getObjectiveOptions(t), [t])
  const languageOptions = useMemo(() => getLanguageOptions(t), [t])

  const selectedCreative = searchParams.get("creative")

  const form = useForm<CampaignFormSchemaValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues,
    // A field's error clears as soon as it is corrected, not only on the next attempt to move on.
    mode: "onChange",
  })

  const country = useWatch({ control: form.control, name: "country" })
  const audience = useWatch({ control: form.control, name: "audience" })
  const startDate = useWatch({ control: form.control, name: "startDate" })
  const endDate = useWatch({ control: form.control, name: "endDate" })

  const dateRangeError = useMemo(() => {
    const parsedStart = parseIsoDate(startDate)
    const parsedEnd = parseIsoDate(endDate)

    if (!parsedStart || !parsedEnd) {
      return undefined
    }

    if (parsedEnd.getTime() < parsedStart.getTime()) {
      return t("form.validation.endDateAfterStart")
    }

    return undefined
  }, [endDate, startDate, t])

  useEffect(() => {
    if (!initialDetails) {
      return
    }

    const payload = initialDetails.payload
    form.reset({
      name: payload.name,
      objective: payload.objective,
      channel: payload.channel,
      budget: payload.budget,
      startDate: payload.startDate,
      endDate: payload.endDate,
      audience: payload.audience,
      country: payload.country,
      language: payload.language,
      status: payload.status,
      owner: payload.owner || DEFAULT_OWNER,
    })
  }, [form, initialDetails])

  const isSubmitting = createCampaign.isPending || updateCampaign.isPending

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      ...values,
      owner: values.owner || DEFAULT_OWNER,
    }

    if (mode === "create") {
      const created = await createCampaign.mutateAsync({
        ...payload,
        workspaceId: currentWorkspace?.id,
      })
      router.push(ROUTES.campaignsDetails(created.payload.id))
      return
    }

    if (!campaignId) {
      return
    }

    const updated = await updateCampaign.mutateAsync({
      campaignId,
      payload,
    })
    router.push(ROUTES.campaignsDetails(updated.payload.id))
  })

  // The schema's own messages are in English; the form shows one plain line in the user's
  // language instead.
  const requiredText = (error: unknown) => (error ? t("form.wizard.required") : undefined)
  const [step, setStep] = useState(0)
  const watched = useWatch({ control: form.control })
  const steps = [
    { key: "basics", fields: ["name", "channel", "objective"] },
    { key: "budget", fields: ["budget", "status", "startDate", "endDate"] },
    { key: "targeting", fields: ["country", "language", "audience"] },
  ] as const
  const isLastStep = step === steps.length - 1

  // Moving forward checks only the fields of the step being left, so a mistake is fixed where
  // it was made instead of surfacing at the very end.
  async function goNext() {
    const valid = await form.trigger([...steps[step].fields])
    if (!valid || (step === 1 && dateRangeError)) return
    setStep((current) => Math.min(current + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const channelLabel = CHANNEL_OPTIONS.find((option) => option.value === watched.channel)?.label
  const objectiveLabel = objectiveOptions.find(
    (option) => option.value === watched.objective
  )?.label
  const summaryRows = [
    { label: t("form.fields.name.label"), value: watched.name },
    { label: t("detailsView.detailLabels.channel"), value: channelLabel },
    { label: t("detailsView.detailLabels.objective"), value: objectiveLabel },
    {
      label: t("form.fields.budget.label"),
      value: watched.budget ? `${watched.budget} ${tCommon("currency")}` : "",
    },
    {
      label: t("form.wizard.period"),
      value:
        watched.startDate && watched.endDate ? `${watched.startDate} ← ${watched.endDate}` : "",
    },
    { label: t("form.fields.country.label"), value: watched.country },
    { label: t("detailsView.detailLabels.audience"), value: watched.audience },
  ]

  return (
    <AppCard
      title={t("form.title")}
      subtitle={t("form.subtitle")}
      className="overflow-visible shadow-none"
      headerClassName="border-b border-border/60 px-5 py-5 md:px-6"
      contentClassName="p-0"
    >
      <AppForm
        onSubmit={(event) => {
          // Enter on an early step moves on; only the last step saves.
          if (!isLastStep) {
            event.preventDefault()
            void goNext()
            return
          }
          void onSubmit(event)
        }}
      >
        <div className="mx-auto w-full max-w-3xl space-y-6 px-5 py-6 md:px-6">
          <ol className="flex items-center gap-2">
            {steps.map((item, index) => {
              const done = index < step
              const current = index === step
              return (
                <li key={item.key} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    disabled={index > step}
                    onClick={() => setStep(index)}
                    className="flex min-w-0 items-center gap-2.5 text-start disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
                        done && "bg-emerald-500 text-white",
                        current && "bg-primary text-primary-foreground",
                        !done && !current && "bg-muted text-muted-foreground"
                      )}
                    >
                      {done ? <Check className="size-4" /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        "hidden truncate text-sm font-semibold sm:block",
                        current ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {t(`form.wizard.steps.${item.key}` as "form.wizard.steps.basics")}
                    </span>
                  </button>
                  {index < steps.length - 1 ? (
                    <span
                      className={cn(
                        "h-0.5 flex-1 rounded-full",
                        done ? "bg-emerald-500" : "bg-border"
                      )}
                    />
                  ) : null}
                </li>
              )
            })}
          </ol>
          <p className="text-sm font-semibold text-foreground sm:hidden">
            {t(`form.wizard.steps.${steps[step].key}` as "form.wizard.steps.basics")}
          </p>

          {step === 0 ? (
            <div className="space-y-6">
              <AppInput
                label={t("form.fields.name.label")}
                required
                className={TEXT_INPUT_CLASSNAME}
                helperText={t("form.wizard.nameHint")}
                errorText={requiredText(form.formState.errors.name)}
                {...form.register("name")}
              />

              <Controller
                control={form.control}
                name="channel"
                render={({ field, fieldState }) => (
                  <ChoiceGrid
                    label={t("form.wizard.platformQuestion")}
                    errorText={requiredText(fieldState.error)}
                    value={field.value}
                    onValueChange={field.onChange}
                    columns="grid-cols-2 sm:grid-cols-3"
                    options={CHANNEL_OPTIONS.map((option) => ({
                      ...option,
                      icon: <ChannelIcon channel={option.value} />,
                    }))}
                  />
                )}
              />

              <Controller
                control={form.control}
                name="objective"
                render={({ field, fieldState }) => (
                  <ChoiceGrid
                    label={t("form.wizard.objectiveQuestion")}
                    errorText={requiredText(fieldState.error)}
                    value={field.value}
                    onValueChange={field.onChange}
                    columns="grid-cols-1 sm:grid-cols-2"
                    options={objectiveOptions.map((option) => {
                      const Icon = OBJECTIVE_ICONS[option.value] ?? Target
                      return {
                        ...option,
                        description: t(
                          `form.wizard.objectiveHints.${option.value}` as "form.wizard.objectiveHints.leads"
                        ),
                        icon: (
                          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="size-5" />
                          </span>
                        ),
                      }
                    })}
                  />
                )}
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <AppInput
                label={t("form.fields.budget.label")}
                type="number"
                required
                inputMode="numeric"
                min={0}
                step="1"
                className={TEXT_INPUT_CLASSNAME}
                endIcon={
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {tCommon("currency")}
                  </span>
                }
                errorText={
                  form.formState.errors.budget ? t("form.wizard.budgetRequired") : undefined
                }
                {...form.register("budget", { valueAsNumber: true })}
              />

              <Controller
                control={form.control}
                name="status"
                render={({ field, fieldState }) => (
                  <StatusSelectField
                    label={t("metrics.columns.status")}
                    required
                    value={field.value}
                    placeholder={t("form.fields.status.placeholder")}
                    onValueChange={field.onChange}
                    errorText={requiredText(fieldState.error)}
                  />
                )}
              />

              <Controller
                control={form.control}
                name="startDate"
                render={({ field, fieldState }) => (
                  <DatePickerField
                    label={t("form.fields.startDate.label")}
                    required
                    value={field.value}
                    onValueChange={field.onChange}
                    errorText={requiredText(fieldState.error)}
                  />
                )}
              />

              <Controller
                control={form.control}
                name="endDate"
                render={({ field, fieldState }) => (
                  <DatePickerField
                    label={t("form.fields.endDate.label")}
                    required
                    value={field.value}
                    onValueChange={field.onChange}
                    errorText={requiredText(fieldState.error) ?? dateRangeError}
                  />
                )}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <SearchableSelectField
                  label={t("form.fields.country.label")}
                  required
                  value={country}
                  placeholder={t("form.fields.country.placeholder")}
                  options={COUNTRY_OPTIONS}
                  onValueChange={(value) =>
                    form.setValue("country", value, { shouldDirty: true, shouldValidate: true })
                  }
                  searchPlaceholder={t("form.fields.country.searchPlaceholder")}
                  errorText={requiredText(form.formState.errors.country)}
                />

                <Controller
                  control={form.control}
                  name="language"
                  render={({ field, fieldState }) => (
                    <SelectField
                      label={tCommon("language")}
                      required
                      value={field.value}
                      placeholder={t("form.fields.language.placeholder")}
                      options={languageOptions}
                      onValueChange={field.onChange}
                      errorText={requiredText(fieldState.error)}
                    />
                  )}
                />

                <div className="md:col-span-2">
                  <SearchableSelectField
                    label={t("detailsView.detailLabels.audience")}
                    required
                    value={audience}
                    placeholder={t("form.fields.audience.placeholder")}
                    options={AUDIENCE_OPTIONS}
                    onValueChange={(value) =>
                      form.setValue("audience", value, { shouldDirty: true, shouldValidate: true })
                    }
                    searchPlaceholder={t("form.fields.audience.searchPlaceholder")}
                    errorText={requiredText(form.formState.errors.audience)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">{t("form.creative.selectedLabel")}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedCreative
                      ? t("form.creative.creativeIdLabel", { id: selectedCreative })
                      : t("form.creative.noneSelected")}
                  </p>
                </div>
                <AppButton asChild variant="outline" className="h-11 px-4">
                  <Link
                    href={`${ROUTES.campaigns}/creative-library?returnTo=${encodeURIComponent(ROUTES.campaignsCreate)}`}
                  >
                    {t("form.creative.openLibrary")}
                  </Link>
                </AppButton>
              </div>

              <AppTextarea
                label={t("form.sections.notes.title")}
                placeholder={t("form.fields.notes.placeholder")}
                className="min-h-[110px] resize-y rounded-xl"
                helperText={t("form.fields.notes.optional")}
              />

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-bold text-foreground">{t("form.wizard.summaryTitle")}</p>
                <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {summaryRows.map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-muted-foreground">{row.label}</dt>
                      <dd className="truncate text-sm font-semibold text-foreground">
                        {row.value || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-20 border-t border-border/60 bg-card/95 px-5 py-4 backdrop-blur md:px-6">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <AppButton
              type="button"
              variant="outline"
              className="h-12 min-w-28 rounded-xl px-5 text-sm font-semibold"
              onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
            >
              {step === 0 ? tCommon("cancel") : t("form.wizard.back")}
            </AppButton>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {t("form.wizard.stepCount", { current: step + 1, total: steps.length })}
            </p>
            {isLastStep ? (
              <AppButton
                // Its own key: without it the "next" button turns into this one mid-click, and
                // the same click would submit the form.
                key="save"
                type="submit"
                className="h-12 min-w-40 rounded-xl px-6 text-sm font-bold"
                loading={isSubmitting}
                disabled={isSubmitting || Boolean(dateRangeError)}
              >
                {mode === "create" ? t("listScreen.createCampaign") : t("form.actions.saveChanges")}
              </AppButton>
            ) : (
              <AppButton
                key="next"
                type="button"
                className="h-12 min-w-40 rounded-xl px-6 text-sm font-bold"
                onClick={() => void goNext()}
              >
                {t("form.wizard.next")}
              </AppButton>
            )}
          </div>
        </div>
      </AppForm>
    </AppCard>
  )
}
