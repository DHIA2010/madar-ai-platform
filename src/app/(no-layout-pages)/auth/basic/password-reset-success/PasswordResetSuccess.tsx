"use client"

import Image from "next/image"
import Link from "next/link"

import { AppButton, AppCard } from "@/components/app"
import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"
import { CheckCircle2 } from "lucide-react"

export function PasswordResetSuccess({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="bg-muted min-h-svh w-full flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 font-medium">
            <Image
              src={ASSETS.logo}
              alt="مدار MADAR"
              width={778}
              height={325}
              priority
              className="h-14 w-auto"
            />
          </div>

          {/* Card */}
          <div className={cn("mx-auto w-full max-w-sm flex flex-col gap-6", className)} {...props}>
            <AppCard
              title="Password reset successful"
              subtitle="Your password has been updated successfully. You can now sign in with your new password."
              icon={<CheckCircle2 className="h-6 w-6" />}
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
    </div>
  )
}
