import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import { headers } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { ThemeProvider } from "next-themes"
import { ApplicationProvider } from "@/application"
import { AuthProvider, PermissionProvider } from "@/features/authentication/components"
import { WorkspaceProvider } from "@/features/workspace"
import { DEFAULT_THEME, THEME_KEYS } from "@/constants/theme"
import { localeDirection } from "@/i18n/locales"
import { isMarketingHostname } from "@/features/marketing-site/marketing-constants"
import StoreContextProvider from "@/providers/store-context-provider"
import QueryProvider from "../providers/query-provider"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

/* SEO Metadata */
export const metadata: Metadata = {
  metadataBase: new URL("https://madar.my"),

  title: {
    default: "MADAR | AI-Powered Marketing Intelligence for E-commerce",
    template: "%s | MADAR",
  },

  description:
    "MADAR helps e-commerce businesses connect marketing data, analyze advertising performance, monitor key KPIs, and turn data into actionable insights.",

  keywords: [
    "Marketing Intelligence Platform",
    "E-commerce Marketing Analytics",
    "Advertising Performance Analytics",
    "Campaign Analytics",
    "Cross-Channel Reporting",
    "Marketing KPIs",
    "Business Intelligence",
    "SaaS Platform",
    "Marketing Operations",
  ],

  authors: [
    {
      name: "MADAR",
      url: "https://madar.my/",
    },
  ],

  creator: "MADAR",
  publisher: "MADAR",

  robots: {
    index: true,
    follow: true,
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://madar.my/",
    siteName: "MADAR",
    title: "MADAR | AI-Powered Marketing Intelligence for E-commerce",
    description:
      "MADAR helps e-commerce businesses connect marketing data, analyze advertising performance, monitor key KPIs, and turn data into actionable insights.",
    images: [
      {
        url: "/images/madar-logo.png",
        width: 778,
        height: 325,
        alt: "MADAR - AI-Powered Marketing Intelligence for E-commerce",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "MADAR | AI-Powered Marketing Intelligence for E-commerce",
    description:
      "MADAR helps e-commerce businesses connect marketing data, analyze advertising performance, monitor key KPIs, and turn data into actionable insights.",
    images: ["/images/madar-logo.png"],
    creator: "@MADAR",
  },

  icons: {
    icon: "/favicon.ico",
  },
}

/* Viewport */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const headersList = await headers()
  // The public marketing site (madar.my) is English-only regardless of the app's locale
  // cookie/default (Arabic) -- everything else keeps the existing locale-driven lang/dir.
  const isMarketingSite = isMarketingHostname(headersList.get("host") ?? "")
  const htmlLang = isMarketingSite ? "en" : locale
  const htmlDir = isMarketingSite ? "ltr" : localeDirection(locale as "ar" | "en")

  return (
    <html lang={htmlLang} dir={htmlDir} suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme={DEFAULT_THEME}
            themes={[
              "light",
              "dark",
              THEME_KEYS.darkBlue,
              THEME_KEYS.gaussianBlack,
              THEME_KEYS.semiDark,
            ]}
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <ApplicationProvider>
                <AuthProvider>
                  <WorkspaceProvider>
                    <PermissionProvider>
                      <StoreContextProvider>{children}</StoreContextProvider>
                    </PermissionProvider>
                  </WorkspaceProvider>
                </AuthProvider>
              </ApplicationProvider>
            </QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
