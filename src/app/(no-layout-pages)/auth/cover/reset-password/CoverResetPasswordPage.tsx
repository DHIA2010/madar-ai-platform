"use client"

import { cn } from "@/lib/utils"
import { GalleryVerticalEnd } from "lucide-react"
import { ResetPasswordForm } from "@/features/authentication/components"

export default function CoverResetPasswordPage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* LEFT – RESET FORM */}
      <div className="flex items-center justify-center bg-muted p-6 md:p-10">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-6 flex items-center justify-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-5" />
            </div>
            <span className="text-lg">Acme Inc.</span>
          </div>

          {/* Form */}
          <ResetPasswordForm className={cn("flex flex-col gap-6", className)} {...props} />
        </div>
      </div>

      {/* RIGHT – COVER */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground">
        {/* overlay */}
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold leading-tight">Set a new password 🔐</h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            Choose a strong password to keep your account secure and protected.
          </p>

          <ul className="mt-6 space-y-2 text-sm">
            <li>✔ At least 8 characters</li>
            <li>✔ Use numbers & symbols</li>
            <li>✔ Avoid common passwords</li>
          </ul>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/80">
          © {new Date().getFullYear()} Acme Inc. All rights reserved.
        </div>
      </div>
    </div>
  )
}
