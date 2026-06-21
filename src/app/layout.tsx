import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { ApplicationProvider } from "@/application"
import { AuthProvider, PermissionProvider } from "@/features/authentication/components"
import { WorkspaceProvider } from "@/features/workspace"
import { DEFAULT_THEME, THEME_KEYS } from "@/constants/theme"
import StoreContextProvider from "@/providers/store-context-provider"
import QueryProvider from "../providers/query-provider"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

/* SEO Metadata */
export const metadata: Metadata = {
  metadataBase: new URL("https://madar.ai"),

  title: {
    default: "MADAR | AI Marketing Intelligence Platform",
    template: "%s | MADAR",
  },

  description:
    "MADAR is an AI-powered Marketing Intelligence Platform that unifies marketing, sales, analytics, and customer insights into one intelligent workspace.",

  keywords: [
    "Marketing Intelligence Platform",
    "AI Marketing Dashboard",
    "Marketing Analytics",
    "Campaign Management",
    "Marketing Automation",
    "Business Intelligence",
    "SaaS Platform",
    "Marketing Operations",
    "Customer Analytics",
  ],

  authors: [
    {
      name: "MADAR Team",
      url: "https://madar.ai/",
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
    url: "https://madar.ai/",
    siteName: "MADAR",
    title: "MADAR | AI Marketing Intelligence Platform",
    description:
      "AI-powered Marketing Intelligence Platform that unifies marketing, sales, analytics, and customer insights.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "MADAR - AI Marketing Intelligence Platform",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "MADAR | AI Marketing Intelligence Platform",
    description:
      "AI-powered Marketing Intelligence Platform that unifies marketing, sales, analytics, and customer insights.",
    images: ["/og-image.jpg"],
    creator: "@MADAR",
  },

  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
}

/* Viewport */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
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
      </body>
    </html>
  )
}
