"use client"

import { cn } from "@/lib/utils"
import { GalleryVerticalEnd, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function VerifyEmailForm({
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
                  <Mail className="h-6 w-6 text-muted-foreground" />
                </div>

                <CardTitle className="text-xl">Verify your email</CardTitle>
                <CardDescription>
                  We’ve sent a verification link to your email address.
                  Please check your inbox to continue.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid gap-4">
                  <Button className="w-full">
                    Open email app
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      console.log("Resend verification email")
                    }}
                  >
                    Resend email
                  </Button>

                  <div className="text-center text-sm">
                    <a
                      href="/login"
                      className="underline underline-offset-4"
                    >
                      Back to login
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Footer text */}
            <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
              Didn’t receive the email? Check your spam folder or{" "}
              <a href="#">contact support</a>.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
