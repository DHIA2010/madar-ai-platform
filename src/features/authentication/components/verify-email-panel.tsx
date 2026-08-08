"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard } from "@/components/app"

import { useAuthRecovery } from "../hooks"

type VerifyState = "verifying" | "success" | "error" | "missing-token"

export function VerifyEmailPanel({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const recovery = useAuthRecovery()
  const [state, setState] = useState<VerifyState>(token ? "verifying" : "missing-token")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    void (async () => {
      const result = await recovery.verifyEmail({ token })
      if (result.success) {
        setState("success")
        return
      }
      setErrorMessage(result.error.message)
      setState("error")
    })()
  }, [token, recovery])

  if (state === "verifying") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <AppCard title="Verifying your email" subtitle="Just a moment while we confirm your link.">
          <div className="flex justify-center py-4">
            <Loader2 className="size-8 animate-spin text-violet-600" />
          </div>
        </AppCard>
      </div>
    )
  }

  if (state === "success") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <AppCard
          title="Email verified"
          subtitle="Your email has been confirmed. You can now sign in."
          icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
        >
          <AppButton fullWidth asChild>
            <Link href={ROUTES.login}>Continue to login</Link>
          </AppButton>
        </AppCard>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <AppCard
          title="Couldn't verify this link"
          subtitle={errorMessage ?? "This verification link is invalid or has expired."}
          icon={<XCircle className="h-6 w-6 text-destructive" />}
        >
          <p className="text-center text-sm text-muted-foreground">
            If your account already works, it may already be verified — try signing in.
          </p>
          <AppButton fullWidth asChild>
            <Link href={ROUTES.login}>Back to login</Link>
          </AppButton>
        </AppCard>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="Verify your email" subtitle="We sent a verification link to your inbox.">
        <p className="text-center text-sm">
          <Link className="underline underline-offset-4" href={ROUTES.login}>
            Back to login
          </Link>
        </p>
      </AppCard>
    </div>
  )
}
