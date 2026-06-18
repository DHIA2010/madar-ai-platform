import type { Metadata, Viewport } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import UIThemeProvider from "@/providers/ui-theme-provider"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

/* SEO Metadata */
export const metadata: Metadata = {
  metadataBase: new URL("https://yourdomain.com"),

  title: {
    default: "Pulse UI - Premium Nextjs 16 Admin Dashboard Template",
    template: "%s | Pulse UI",
  },

  description:
    "Pulse UI is a premium admin dashboard template built with Next.js 16, React 19, ShadCN UI, Tailwind CSS, and TypeScript.",

  keywords: [
    "Next.js Admin Template",
    "React Dashboard",
    "ShadCN UI Admin",
    "Tailwind Dashboard",
    "SaaS Admin Template",
    "CRM Dashboard",
    "Analytics Dashboard",
    "React 19 Template",
    "Next.js 16 Dashboard",
  ],

  authors: [
    {
      name: "Pulse UI",
      url: "https://codervent.com/",
    },
  ],

  creator: "Pulse UI",
  publisher: "Pulse UI",

  robots: {
    index: true,
    follow: true,
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://codervent.com/",
    siteName: "Pulse UI",
    title: "Pulse UI - Premium Nextjs 16 Admin Dashboard Template",
    description:
      "Modern admin dashboard template built with Next.js 16, React 19, ShadCN UI, and Tailwind CSS.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Pulse UI",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Pulse UI",
    description:
      "Premium React admin dashboard template built with Next.js 16 and ShadCN UI.",
    images: ["/og-image.jpg"],
    creator: "@yourtwitter",
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark-blue"
          enableSystem
          disableTransitionOnChange
        >
          <UIThemeProvider>
            {children}
          </UIThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}