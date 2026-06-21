"use client"

import { useState } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard, AppForm, AppInput } from "@/components/app"

import { useAuth } from "../hooks"
import { type LoginFormValues, loginSchema } from "../validators"

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const { login, authStatus } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)

    try {
      await login(values)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to login. Please try again.")
    }
  })

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="Welcome back" subtitle="Sign in to continue to MADAR.">
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

          <AppInput
            type="password"
            label="Password"
            placeholder="Enter your password"
            autoComplete="current-password"
            errorText={form.formState.errors.password?.message}
            required
            {...form.register("password")}
          />

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" {...form.register("rememberMe")} />
            Remember this session
          </label>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <AppButton
            type="submit"
            fullWidth
            loading={form.formState.isSubmitting || authStatus === "loading"}
          >
            Login
          </AppButton>

          <div className="flex justify-between text-sm">
            <Link className="underline underline-offset-4" href={ROUTES.forgotPassword}>
              Forgot password?
            </Link>
            <Link className="underline underline-offset-4" href={ROUTES.register}>
              Create account
            </Link>
          </div>
        </AppForm>
      </AppCard>
    </div>
  )
}
