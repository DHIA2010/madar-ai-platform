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
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  type LucideIcon,
  PauseCircle,
  PlayCircle,
  Search,
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

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card">
      <div className="border-b border-border/60 px-5 py-4 md:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="px-5 py-5 md:px-6">{children}</div>
    </section>
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

  return (
    <AppCard
      title={t("form.title")}
      subtitle={t("form.subtitle")}
      className="overflow-visible shadow-none"
      headerClassName="border-b border-border/60 px-5 py-5 md:px-6"
      contentClassName="p-0"
    >
      <AppForm onSubmit={onSubmit}>
        <div className="space-y-6 px-5 py-5 md:px-6">
          <SectionCard
            title={t("form.sections.basics.title")}
            description={t("form.sections.basics.description")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <AppInput
                label={t("form.fields.name.label")}
                required
                wrapperClassName="md:col-span-2"
                errorText={form.formState.errors.name?.message}
                {...form.register("name")}
              />

              <Controller
                control={form.control}
                name="objective"
                render={({ field, fieldState }) => (
                  <SelectField
                    label={t("detailsView.detailLabels.objective")}
                    required
                    value={field.value}
                    placeholder={t("form.fields.objective.placeholder")}
                    options={objectiveOptions}
                    onValueChange={field.onChange}
                    errorText={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                control={form.control}
                name="channel"
                render={({ field, fieldState }) => (
                  <SelectField
                    label={t("detailsView.detailLabels.channel")}
                    required
                    value={field.value}
                    placeholder={t("form.fields.channel.placeholder")}
                    options={CHANNEL_OPTIONS}
                    onValueChange={field.onChange}
                    errorText={fieldState.error?.message}
                  />
                )}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t("form.sections.budget.title")}
            description={t("form.sections.budget.description")}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <AppInput
                label={t("form.fields.budget.label")}
                type="number"
                required
                inputMode="numeric"
                min={0}
                step="1"
                endIcon={
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {tCommon("currency")}
                  </span>
                }
                errorText={form.formState.errors.budget?.message}
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
                    errorText={fieldState.error?.message}
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
                    errorText={fieldState.error?.message}
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
                    errorText={fieldState.error?.message ?? dateRangeError}
                  />
                )}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t("form.sections.targeting.title")}
            description={t("form.sections.targeting.description")}
          >
            <div className="grid gap-4 md:grid-cols-2">
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
                errorText={form.formState.errors.country?.message}
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
                    errorText={fieldState.error?.message}
                  />
                )}
              />

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
                errorText={form.formState.errors.audience?.message}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t("creativeLibrary.title")}
            description={t("form.sections.creative.description")}
          >
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium">{t("form.creative.selectedLabel")}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedCreative
                    ? t("form.creative.creativeIdLabel", { id: selectedCreative })
                    : t("form.creative.noneSelected")}
                </p>
              </div>
              <AppButton asChild variant="outline" size="sm">
                <Link
                  href={`${ROUTES.campaigns}/creative-library?returnTo=${encodeURIComponent(ROUTES.campaignsCreate)}`}
                >
                  {t("form.creative.openLibrary")}
                </Link>
              </AppButton>
            </div>
          </SectionCard>

          <SectionCard
            title={t("form.sections.notes.title")}
            description={t("form.sections.notes.description")}
          >
            <AppTextarea
              label={t("form.sections.notes.title")}
              placeholder={t("form.fields.notes.placeholder")}
              wrapperClassName="md:col-span-2"
              className="min-h-[96px] resize-y"
              helperText={t("form.fields.notes.optional")}
            />
          </SectionCard>
        </div>

        <div className="sticky bottom-0 z-20 border-t border-border/60 bg-card/95 px-5 py-4 backdrop-blur md:px-6">
          <div className="flex items-center justify-end gap-3">
            <AppButton type="button" variant="outline" size="lg" onClick={() => router.back()}>
              {tCommon("cancel")}
            </AppButton>
            <AppButton
              type="submit"
              size="lg"
              loading={isSubmitting}
              disabled={isSubmitting || Boolean(dateRangeError)}
            >
              {mode === "create" ? t("listScreen.createCampaign") : t("form.actions.saveChanges")}
            </AppButton>
          </div>
        </div>
      </AppForm>
    </AppCard>
  )
}
