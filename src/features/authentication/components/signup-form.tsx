"use client"

import { useState } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard, AppForm, AppInput } from "@/components/app"

import { type SignupFormValues, signupSchema } from "../validators"

export function SignupForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = form.handleSubmit(async () => {
    setSubmitted(false)
    await Promise.resolve()
    setSubmitted(true)
    form.reset()
  })

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="Create your account" subtitle="Set up your MADAR authentication profile.">
        <AppForm onSubmit={onSubmit}>
          <AppInput
            label="Full name"
            placeholder="Jane Doe"
            autoComplete="name"
            errorText={form.formState.errors.fullName?.message}
            required
            {...form.register("fullName")}
          />

          <AppInput
            type="email"
            label="Email"
            placeholder="name@madar.ai"
            autoComplete="email"
            errorText={form.formState.errors.email?.message}
            required
            {...form.register("email")}
          />

          <AppInput
            type="password"
            label="Password"
            placeholder="Create a password"
            autoComplete="new-password"
            errorText={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />

          <AppInput
            type="password"
            label="Confirm password"
            placeholder="Repeat your password"
            autoComplete="new-password"
            errorText={form.formState.errors.confirmPassword?.message}
            required
            {...form.register("confirmPassword")}
          />

          <AppButton type="submit" fullWidth loading={form.formState.isSubmitting}>
            Create account
          </AppButton>

          {submitted ? (
            <p className="text-sm text-emerald-600">Account request submitted successfully.</p>
          ) : null}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link className="underline underline-offset-4" href={ROUTES.login}>
              Sign in
            </Link>
          </p>
        </AppForm>
      </AppCard>
    </div>
  )
}
