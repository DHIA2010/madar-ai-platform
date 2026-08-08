"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { zodResolver } from "@hookform/resolvers/zod"
import { Briefcase, Building2, Check, Lock, Mail, User, Users } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCheckbox,
  AppForm,
  AppInput,
  AppPasswordInput,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import { type SignupFormValues, signupSchema } from "../validators"

const STEP_1_FIELDS = [
  "fullName",
  "email",
  "password",
  "confirmPassword",
  "jobRole",
  "acceptTerms",
] as const
const STEP_2_FIELDS = ["companyName", "industry", "companySize"] as const

const JOB_ROLE_VALUES = [
  "marketing-manager",
  "founder-ceo",
  "growth-marketer",
  "agency-owner",
  "other",
] as const
const INDUSTRY_VALUES = [
  "ecommerce",
  "retail",
  "fashion",
  "food-beverage",
  "technology",
  "other",
] as const
const COMPANY_SIZE_VALUES = ["1-10", "11-50", "51-200", "200+"] as const

const JOB_ROLE_KEYS: Record<(typeof JOB_ROLE_VALUES)[number], string> = {
  "marketing-manager": "marketingManager",
  "founder-ceo": "founderCeo",
  "growth-marketer": "growthMarketer",
  "agency-owner": "agencyOwner",
  other: "other",
}
const INDUSTRY_KEYS: Record<(typeof INDUSTRY_VALUES)[number], string> = {
  ecommerce: "ecommerce",
  retail: "retail",
  fashion: "fashion",
  "food-beverage": "foodBeverage",
  technology: "technology",
  other: "other",
}

function StepIndicator({
  current,
  steps,
}: {
  current: number
  steps: { step: 1 | 2 | 3; label: string }[]
}) {
  return (
    <div className="flex items-start">
      {steps.map((item, index) => {
        const isComplete = current > item.step
        const isActive = current === item.step

        return (
          <div key={item.step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  isComplete
                    ? "bg-violet-600 text-white"
                    : isActive
                      ? "bg-violet-600 text-white ring-4 ring-violet-100"
                      : "bg-slate-100 text-slate-400"
                )}
              >
                {isComplete ? <Check className="size-4" /> : item.step}
              </span>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isActive || isComplete ? "text-slate-900" : "text-slate-400"
                )}
              >
                {item.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "mx-2 mb-5 h-0.5 flex-1",
                  isComplete ? "bg-violet-600" : "bg-slate-100"
                )}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value || "—"}</span>
    </div>
  )
}

export function SignupForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [submitted, setSubmitted] = useState(false)
  const t = useTranslations("auth.register")

  const steps: { step: 1 | 2 | 3; label: string }[] = [
    { step: 1, label: t("steps.account") },
    { step: 2, label: t("steps.company") },
    { step: 3, label: t("steps.confirm") },
  ]

  const jobRoles = JOB_ROLE_VALUES.map((value) => ({
    value,
    label: t(`jobRoles.${JOB_ROLE_KEYS[value]}`),
  }))
  const industries = INDUSTRY_VALUES.map((value) => ({
    value,
    label: t(`industries.${INDUSTRY_KEYS[value]}`),
  }))
  const companySizes = COMPANY_SIZE_VALUES.map((value) => ({
    value,
    label: t(`companySizes.${value}`),
  }))

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      jobRole: "",
      acceptTerms: false,
      companyName: "",
      industry: "",
      companySize: "",
    },
  })

  const values = useWatch({ control: form.control })

  const goNext = async () => {
    const fields = step === 1 ? STEP_1_FIELDS : STEP_2_FIELDS
    const valid = await form.trigger(fields)
    if (valid) setStep((current) => (current === 1 ? 2 : 3) as 1 | 2 | 3)
  }

  const goBack = () => {
    setStep((current) => (current === 3 ? 2 : 1) as 1 | 2 | 3)
  }

  const onSubmit = form.handleSubmit(async () => {
    await Promise.resolve()
    setSubmitted(true)
  })

  if (submitted) {
    return (
      <div
        className={cn("flex w-full max-w-md flex-col items-center gap-6 text-center", className)}
        {...props}
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="size-8" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-slate-900">{t("success.heading")}</h1>
          <p className="text-sm text-slate-500">{t("success.description")}</p>
        </div>
        <AppButton
          asChild
          fullWidth
          className="h-11 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
        >
          <Link href={ROUTES.login}>{t("success.goToLogin")}</Link>
        </AppButton>
      </div>
    )
  }

  return (
    <div className={cn("flex w-full max-w-lg flex-col gap-8", className)} {...props}>
      <div className="flex flex-col items-center gap-6 text-center">
        <Image
          src={ASSETS.logo}
          alt="مدار MADAR"
          width={778}
          height={325}
          priority
          className="h-14 w-auto"
        />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
          <p className="text-sm text-slate-500">{t("subheading")}</p>
        </div>
      </div>

      <StepIndicator current={step} steps={steps} />

      <AppForm onSubmit={onSubmit} className="space-y-5">
        {step === 1 ? (
          <>
            <AppInput
              label={t("fullNameLabel")}
              placeholder={t("fullNamePlaceholder")}
              autoComplete="name"
              startIcon={<User className="size-4" />}
              errorText={form.formState.errors.fullName?.message}
              required
              {...form.register("fullName")}
            />

            <AppInput
              type="email"
              label={t("emailLabel")}
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
              startIcon={<Mail className="size-4" />}
              errorText={form.formState.errors.email?.message}
              required
              {...form.register("email")}
            />

            <AppPasswordInput
              label={t("passwordLabel")}
              placeholder={t("passwordPlaceholder")}
              autoComplete="new-password"
              startIcon={<Lock className="size-4" />}
              errorText={form.formState.errors.password?.message}
              helperText={t("passwordHelper")}
              required
              {...form.register("password")}
            />

            <AppPasswordInput
              label={t("confirmPasswordLabel")}
              placeholder={t("confirmPasswordPlaceholder")}
              autoComplete="new-password"
              startIcon={<Lock className="size-4" />}
              errorText={form.formState.errors.confirmPassword?.message}
              required
              {...form.register("confirmPassword")}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("jobRoleLabel")} <span aria-hidden="true">*</span>
              </label>
              <Controller
                control={form.control}
                name="jobRole"
                render={({ field }) => (
                  <AppSelect value={field.value} onValueChange={field.onChange}>
                    <AppSelectTrigger className="h-10 w-full">
                      <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                      <AppSelectValue placeholder={t("jobRolePlaceholder")} />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {jobRoles.map((role) => (
                        <AppSelectItem key={role.value} value={role.value}>
                          {role.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                )}
              />
              {form.formState.errors.jobRole ? (
                <p className="text-sm text-destructive">{form.formState.errors.jobRole.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <Controller
                  control={form.control}
                  name="acceptTerms"
                  render={({ field }) => (
                    <AppCheckbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-0.5"
                    />
                  )}
                />
                <span>
                  {t("acceptTermsPrefix")}{" "}
                  <span className="font-medium text-violet-600">{t("termsAndConditions")}</span>{" "}
                  {t("and")}{" "}
                  <Link
                    href={ROUTES.privacy}
                    className="font-medium text-violet-600 underline-offset-4 hover:underline"
                  >
                    {t("privacyPolicy")}
                  </Link>
                </span>
              </label>
              {form.formState.errors.acceptTerms ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.acceptTerms.message}
                </p>
              ) : null}
            </div>

            <AppButton
              type="button"
              onClick={goNext}
              fullWidth
              className="h-11 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
            >
              {t("next")}
            </AppButton>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <AppInput
              label={t("companyNameLabel")}
              placeholder={t("companyNamePlaceholder")}
              startIcon={<Building2 className="size-4" />}
              errorText={form.formState.errors.companyName?.message}
              required
              {...form.register("companyName")}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("industryLabel")} <span aria-hidden="true">*</span>
              </label>
              <Controller
                control={form.control}
                name="industry"
                render={({ field }) => (
                  <AppSelect value={field.value} onValueChange={field.onChange}>
                    <AppSelectTrigger className="h-10 w-full">
                      <AppSelectValue placeholder={t("industryPlaceholder")} />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {industries.map((industry) => (
                        <AppSelectItem key={industry.value} value={industry.value}>
                          {industry.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                )}
              />
              {form.formState.errors.industry ? (
                <p className="text-sm text-destructive">{form.formState.errors.industry.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                {t("companySizeLabel")} <span aria-hidden="true">*</span>
              </label>
              <Controller
                control={form.control}
                name="companySize"
                render={({ field }) => (
                  <AppSelect value={field.value} onValueChange={field.onChange}>
                    <AppSelectTrigger className="h-10 w-full">
                      <Users className="size-4 shrink-0 text-muted-foreground" />
                      <AppSelectValue placeholder={t("companySizePlaceholder")} />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {companySizes.map((size) => (
                        <AppSelectItem key={size.value} value={size.value}>
                          {size.label}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                )}
              />
              {form.formState.errors.companySize ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.companySize.message}
                </p>
              ) : null}
            </div>

            <div className="flex gap-3">
              <AppButton
                type="button"
                variant="outline"
                onClick={goBack}
                className="h-11 flex-1 text-base font-semibold"
              >
                {t("back")}
              </AppButton>
              <AppButton
                type="button"
                onClick={goNext}
                className="h-11 flex-1 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
              >
                {t("next")}
              </AppButton>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <SummaryRow label={t("summary.fullName")} value={values.fullName} />
              <SummaryRow label={t("summary.email")} value={values.email} />
              <SummaryRow
                label={t("summary.jobRole")}
                value={jobRoles.find((role) => role.value === values.jobRole)?.label}
              />
              <SummaryRow label={t("summary.companyName")} value={values.companyName} />
              <SummaryRow
                label={t("summary.industry")}
                value={industries.find((industry) => industry.value === values.industry)?.label}
              />
              <SummaryRow
                label={t("summary.companySize")}
                value={companySizes.find((size) => size.value === values.companySize)?.label}
              />
            </div>

            <div className="flex gap-3">
              <AppButton
                type="button"
                variant="outline"
                onClick={goBack}
                className="h-11 flex-1 text-base font-semibold"
              >
                {t("back")}
              </AppButton>
              <AppButton
                type="submit"
                loading={form.formState.isSubmitting}
                className="h-11 flex-1 bg-gradient-to-l from-violet-600 to-indigo-600 text-base font-semibold shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500"
              >
                {t("submit")}
              </AppButton>
            </div>
          </>
        ) : null}
      </AppForm>

      {step === 1 ? (
        <p className="text-center text-sm text-slate-600">
          {t("alreadyHaveAccount")}{" "}
          <Link
            href={ROUTES.login}
            className="font-semibold text-violet-600 underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
