"use client"

import { useState } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard } from "@/components/app"

import { useAuthRecovery } from "../hooks"

export function VerifyEmailPanel({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const recovery = useAuthRecovery()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const resend = async () => {
    setLoading(true)
    setStatusMessage(null)

    try {
      const result = await recovery.verifyEmail({ token: "mock-email-token" })
      if (!result.success) {
        throw result.error
      }
      setStatusMessage("Verification email sent.")
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to resend email.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AppCard title="Verify your email" subtitle="We sent a verification link to your inbox.">
        <div className="grid gap-4">
          <AppButton fullWidth>Open email app</AppButton>
          <AppButton variant="outline" fullWidth loading={loading} onClick={resend}>
            Resend email
          </AppButton>

          {statusMessage ? <p className="text-sm text-muted-foreground">{statusMessage}</p> : null}

          <p className="text-center text-sm">
            <Link className="underline underline-offset-4" href={ROUTES.login}>
              Back to login
            </Link>
          </p>
        </div>
      </AppCard>
    </div>
  )
}
