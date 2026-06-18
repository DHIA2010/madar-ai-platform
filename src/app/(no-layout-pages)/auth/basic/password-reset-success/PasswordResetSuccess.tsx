"use client"

import { cn } from "@/lib/utils"
import { GalleryVerticalEnd, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-5" />
            </div>
            <span className="text-lg">Acme Inc.</span>
          </div>

          {/* Card */}
          <div
            className={cn(
              "mx-auto w-full max-w-sm flex flex-col gap-6",
              className
            )}
            {...props}
          >
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <CheckCircle2 className="h-6 w-6" />
                </div>

                <CardTitle className="text-xl">
                  Password reset successful
                </CardTitle>
                <CardDescription>
                  Your password has been updated successfully.  
                  You can now sign in with your new password.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4">
                  <Button className="w-full" asChild>
                    <a href="/login">Go to login</a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Footer text */}
            <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
              If you didn’t request a password reset, please{" "}
              <a href="#">contact support</a> immediately.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
