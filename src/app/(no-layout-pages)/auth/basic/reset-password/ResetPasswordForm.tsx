"use client"

import Image from "next/image"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ResetPasswordForm as AuthResetPasswordForm } from "@/features/authentication/components"

export default function ResetPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="bg-muted min-h-svh w-full flex items-center justify-center p-6 md:p-10">
      <div className="max-w-lg">
        <div className="flex flex-col gap-6">
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

          <AuthResetPasswordForm
            className={cn("mx-auto w-full max-w-sm flex flex-col gap-6", className)}
            {...props}
          />
        </div>
      </div>
    </div>
  )
}
