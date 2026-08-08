"use server"

import { cookies } from "next/headers"

import { LOCALE_COOKIE_NAME, type Locale } from "./locales"

export async function setLocale(locale: Locale) {
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
}
