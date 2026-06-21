"use client"

import Link from "next/link"

import { AppButton, AppCard } from "@/components/app"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"
import { GalleryVerticalEnd, CheckCircle2 } from "lucide-react"

export default function CoverPasswordResetSuccessPage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* LEFT – SUCCESS CARD */}
      <div className="flex items-center justify-center bg-muted p-6 md:p-10">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-6 flex items-center justify-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-5" />
            </div>
            <span className="text-lg">Acme Inc.</span>
          </div>

          {/* Card */}
          <div className={cn("flex flex-col gap-6", className)} {...props}>
            <AppCard
              title="Password reset successful"
              subtitle="Your password has been updated successfully. You can now sign in using your new password."
              icon={<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />}
            >
              <div className="grid gap-4">
                <AppButton fullWidth asChild>
                  <Link href={ROUTES.login}>Go to login</Link>
                </AppButton>
              </div>
            </AppCard>

            {/* Footer text */}
            <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
              If you didn’t request a password reset, please <a href="#">contact support</a>{" "}
              immediately.
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT – COVER */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground">
        {/* overlay */}
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold leading-tight">You’re all set 🎉</h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            Your password has been reset successfully. You can now log in securely and continue
            using the platform.
          </p>

          <ul className="mt-6 space-y-2 text-sm">
            <li>✔ Password updated securely</li>
            <li>✔ Account protected</li>
            <li>✔ Ready to sign in</li>
          </ul>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/80">
          © {new Date().getFullYear()} Acme Inc. All rights reserved.
        </div>
      </div>
    </div>
  )
}
