"use client"

import { useTranslations } from "next-intl"

import {
  getClientEnvironment,
  getResolvedAuthApiBaseUrl,
} from "@/infrastructure/environment/app-environment"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4">
      <path
        d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.67h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.25Z"
        fill="#4285F4"
      />
      <path
        d="M10 20c2.7 0 4.96-.89 6.61-2.42l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.07v2.59A9.99 9.99 0 0 0 10 20Z"
        fill="#34A853"
      />
      <path
        d="M4.41 11.92a6.02 6.02 0 0 1 0-3.84V5.49H1.07a10 10 0 0 0 0 9.02l3.34-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C14.95.99 12.7 0 10 0A9.99 9.99 0 0 0 1.07 5.49l3.34 2.59C5.2 5.72 7.4 3.96 10 3.96Z"
        fill="#EA4335"
      />
    </svg>
  )
}

// "Continue with Google": the backend sends the person to Google, then signs them into their
// Madar account -- or creates one for a new email -- and lands them in the app.
export function GoogleSignInButton() {
  const t = useTranslations("auth.google")
  const apiBase = (getResolvedAuthApiBaseUrl(getClientEnvironment()) ?? "").replace(/\/$/, "")
  return (
    <a
      href={`${apiBase}/v1/auth/google/start`}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
    >
      <GoogleIcon />
      {t("continue")}
    </a>
  )
}
