"use client"

import { cn } from "@/lib/utils"
import { GalleryVerticalEnd } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function CoverForgotPasswordPage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* LEFT – FORM */}
      <div className="flex items-center justify-center p-6 md:p-10 bg-muted">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-6 flex items-center justify-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-5" />
            </div>
            <span className="text-lg">Acme Inc.</span>
          </div>

          {/* Form */}
          <div className={cn("flex flex-col gap-6", className)} {...props}>
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-xl">
                  Forgot password?
                </CardTitle>
                <CardDescription>
                  Enter your email and we’ll send you a reset link
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form>
                  <div className="grid gap-6">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full">
                      Send reset link
                    </Button>

                    <div className="text-center text-sm">
                      Remember your password?{" "}
                      <a
                        href="/login"
                        className="underline underline-offset-4"
                      >
                        Back to login
                      </a>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
              If you don’t receive an email, check your spam folder or{" "}
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
            Reset your password 🔐
          </h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            We’ll help you get back into your account quickly and securely.
            Just enter your email to receive a reset link.
          </p>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/80">
          © {new Date().getFullYear()} Acme Inc. All rights reserved.
        </div>
      </div>
    </div>
  )
}
