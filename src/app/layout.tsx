import type { Metadata, Viewport } from "next"
import "./globals.css"
import { headers } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { ThemeProvider } from "next-themes"
import { ApplicationProvider } from "@/application"
import { AuthProvider, PermissionProvider } from "@/features/authentication/components"
import { WorkspaceProvider } from "@/features/workspace"
import { DEFAULT_THEME, THEME_KEYS } from "@/constants/theme"
import { localeDirection } from "@/i18n/locales"
import {
  isMarketingHostname,
  MARKETING_GTM_CONTAINER_ID,
} from "@/features/marketing-site/marketing-constants"
import { cairo } from "@/components/design/fonts"
import StoreContextProvider from "@/providers/store-context-provider"
import QueryProvider from "../providers/query-provider"
import { AttributionCapture } from "@/components/attribution-capture"
import { GoogleTagManagerNoScript, GoogleTagManagerScript } from "@/components/google-tag-manager"

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
  // The public marketing site (madar.my) is Arabic regardless of the app's locale cookie --
  // everything else keeps the existing locale-driven lang/dir.
  const isMarketingSite = isMarketingHostname(headersList.get("host") ?? "")
  const htmlLang = isMarketingSite ? "ar" : locale
  const htmlDir = isMarketingSite ? "rtl" : localeDirection(locale as "ar" | "en")

  // cairo.variable goes on <html>, not <body>: globals.css derives --font-sans from it on :root,
  // and a custom property defined only on <body> is out of scope there.
  return (
    <html lang={htmlLang} dir={htmlDir} className={cairo.variable} suppressHydrationWarning>
      <body className={`${cairo.className} antialiased`} suppressHydrationWarning>
        {/* Google Tag Manager -- on the public marketing site (madar.my). The app loads it on its
            sign-up pages only (SignUpFunnelTagManager). */}
        {isMarketingSite ? (
          <>
            <GoogleTagManagerNoScript containerId={MARKETING_GTM_CONTAINER_ID} />
            <GoogleTagManagerScript containerId={MARKETING_GTM_CONTAINER_ID} />
          </>
        ) : null}
        {/* Where this visitor came from (UTM tags, ad click ids), for the CRM. */}
        <AttributionCapture />
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
