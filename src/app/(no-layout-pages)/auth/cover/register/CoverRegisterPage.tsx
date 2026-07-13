"use client"

import Link from "next/link"
import { GalleryVerticalEnd } from "lucide-react"
import { SignupForm } from "@/components/signup-form"

export default function CoverRegisterPage() {
  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* LEFT – SIGNUP FORM */}
      <div className="flex items-center justify-center bg-muted p-6 md:p-10">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-6 flex items-center justify-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-5" />
            </div>
            <span className="text-lg">Acme Inc.</span>
          </div>

          <SignupForm />

          {/* Footer text */}
          <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
            By creating an account, you agree to our{" "}
            <Link href="/privacy">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </div>
        </div>
      </div>

      {/* RIGHT – COVER */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground">
        {/* overlay */}
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold leading-tight">
            Join Acme Inc. 🚀
          </h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            Create your account to access powerful dashboards,
            manage your data, and grow your business faster.
          </p>

          <ul className="mt-6 space-y-2 text-sm">
            <li>✔ Modern analytics dashboards</li>
            <li>✔ Secure authentication</li>
            <li>✔ Dark mode support</li>
          </ul>
        </div>

        <div className="relative z-10 text-sm text-primary-foreground/80">
          © {new Date().getFullYear()} Acme Inc. All rights reserved.
        </div>
      </div>
    </div>
  )
}
