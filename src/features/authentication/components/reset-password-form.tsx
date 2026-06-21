"use client"

import { useState } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard, AppForm, AppInput } from "@/components/app"

import { useAuthRecovery } from "../hooks"
import { type ResetPasswordFormValues, resetPasswordSchema } from "../validators"

interface ResetPasswordFormProps extends React.ComponentPropsWithoutRef<"div"> {
  token?: string
}

export function ResetPasswordForm({
  className,
  token = "mock-reset-token",
  ...props
}: ResetPasswordFormProps) {
  const recovery = useAuthRecovery()
  const [formError, setFormError] = useState<string | null>(null)
  const [isUpdated, setIsUpdated] = useState(false)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token,
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)

    try {
      const result = await recovery.resetPassword(values)
      if (!result.success) {
        throw result.error
      }
      setIsUpdated(true)
      form.reset({ token, password: "", confirmPassword: "" })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to reset password right now.")
    }
  })

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="Reset your password" subtitle="Choose a new password for your account.">
        <AppForm onSubmit={onSubmit}>
          <AppInput
            type="password"
            label="New password"
            placeholder="Enter new password"
            autoComplete="new-password"
            errorText={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />

          <AppInput
            type="password"
            label="Confirm password"
            placeholder="Repeat new password"
            autoComplete="new-password"
            errorText={form.formState.errors.confirmPassword?.message}
            required
            {...form.register("confirmPassword")}
          />

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          {isUpdated ? (
            <p className="text-sm text-emerald-600">Password updated successfully.</p>
          ) : null}

          <AppButton type="submit" fullWidth loading={form.formState.isSubmitting}>
            Update password
          </AppButton>

          <p className="text-center text-sm">
            <Link className="underline underline-offset-4" href={ROUTES.login}>
              Back to login
            </Link>
          </p>
        </AppForm>
      </AppCard>
    </div>
  )
}
