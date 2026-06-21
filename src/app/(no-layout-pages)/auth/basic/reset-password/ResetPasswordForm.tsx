"use client"

import { cn } from "@/lib/utils"
import { GalleryVerticalEnd } from "lucide-react"
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
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-5" />
            </div>
            <span className="text-lg">Acme Inc.</span>
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
