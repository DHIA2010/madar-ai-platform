"use client"

import { SignupForm } from "@/components/signup-form"

export default function CoverRegisterPage() {
  return (
    <div className="min-h-svh grid lg:grid-cols-2">
      {/* LEFT – SIGNUP FORM */}
      <div className="flex items-center justify-center bg-muted p-6 md:p-10">
        <SignupForm />
      </div>

      {/* RIGHT – COVER */}
      <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary to-primary/80 p-10 text-primary-foreground">
        {/* overlay */}
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold leading-tight">Join Acme Inc. 🚀</h1>
          <p className="mt-3 max-w-md text-primary-foreground/90">
            Create your account to access powerful dashboards, manage your data, and grow your
            business faster.
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
