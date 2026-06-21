"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard, AppEmpty, AppForm, AppInput } from "@/components/app"

import { useAuthRecovery } from "../hooks"
import { type ForgotPasswordFormValues, forgotPasswordSchema } from "../validators"

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter()
  const recovery = useAuthRecovery()
  const [formError, setFormError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)

    try {
      const result = await recovery.forgotPassword(values)
      if (!result.success) {
        throw result.error
      }
      setSubmittedEmail(values.email)
      form.reset()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to process your request right now."
      )
    }
  })

  if (submittedEmail) {
    return (
      <AppEmpty
        className={className}
        title="Reset email prepared"
        description={`A password reset link was generated for ${submittedEmail}.`}
        actionLabel="Back to login"
        onAction={() => router.push(ROUTES.login)}
      />
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="Forgot password?" subtitle="Enter your email to receive a reset link.">
        <AppForm onSubmit={onSubmit}>
          <AppInput
            type="email"
            label="Email"
            placeholder="name@madar.ai"
            autoComplete="email"
            errorText={form.formState.errors.email?.message}
            required
            {...form.register("email")}
          />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <AppButton type="submit" fullWidth loading={form.formState.isSubmitting}>
            Send reset link
          </AppButton>
        </AppForm>
      </AppCard>
    </div>
  )
}
