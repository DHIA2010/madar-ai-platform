"use client"

import { cn } from "@/lib/utils"
import { GalleryVerticalEnd, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
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

export default function CoverResetPasswordPage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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
          <div
            className={cn("flex flex-col gap-6", className)}
            {...props}
          >
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-xl">
                  Reset your password
                </CardTitle>
                <CardDescription>
                  Enter a new password for your account
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form>
                  <div className="grid gap-6">
                    {/* New Password */}
                    <div className="grid gap-2">
                      <Label htmlFor="password">New password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          required
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword(!showPassword)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showPassword
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password */}
                    <div className="grid gap-2">
                      <Label htmlFor="confirm-password">
                        Confirm password
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={
                            showConfirmPassword
                              ? "text"
                              : "password"
                          }
                          placeholder="••••••••"
                          required
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(
                              !showConfirmPassword
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showConfirmPassword
                              ? "Hide password"
                              : "Show password"
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full">
                      Update password
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
                </form>
              </CardContent>
            </Card>

            {/* Footer text */}
            <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
              Make sure your password is at least 8 characters
              long and contains a mix of letters, numbers, and
              symbols.
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
            Set a new password 🔐
          </h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            Choose a strong password to keep your account secure
            and protected.
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
