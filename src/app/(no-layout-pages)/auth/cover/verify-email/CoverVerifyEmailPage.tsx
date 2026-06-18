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

export default function CoverVerifyEmailPage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* LEFT – VERIFY EMAIL */}
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
          <div
            className={cn("flex flex-col gap-6", className)}
            {...props}
          >
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Mail className="h-6 w-6 text-muted-foreground" />
                </div>

                <CardTitle className="text-xl">
                  Verify your email
                </CardTitle>
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

      {/* RIGHT – COVER */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground">
        {/* overlay */}
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold leading-tight">
            Verify your account 📩
          </h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            Email verification helps us ensure the security of your
            account and gives you full access to all features.
          </p>

          <ul className="mt-6 space-y-2 text-sm">
            <li>✔ Secure account access</li>
            <li>✔ Protect your data</li>
            <li>✔ Enable full features</li>
          </ul>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/80">
          © {new Date().getFullYear()} Acme Inc. All rights reserved.
        </div>
      </div>
    </div>
  )
}
