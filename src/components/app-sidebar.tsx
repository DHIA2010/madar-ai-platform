"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { ThemeToggle } from "@/components/theme-toggle"
import { WorkspaceSelector } from "@/features/workspace"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  ChartNoAxesCombined,
  CircleUserRound,
  ShieldCheck,
  Gauge,
  Grid2x2,
  LayoutGrid,
  SendIcon,
  Settings2,
  Tv,
  House,
  ShoppingBag,
  HelpCircle,
  Sparkles,
} from "lucide-react"
import { ScrollArea } from "./ui/scroll-area"

const user = {
  name: "محمد",
  email: "admin@madar.ai",
  avatar: "https://untitledui.com/images/avatars/madeleine-pitts",
}

// This is the sidebar component used in the app layout.
type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  onHoverChange?: (value: boolean) => void
}

// The sidebar component used in the app layout. It receives an `onHoverChange` prop to notify the parent layout when the sidebar is hovered or not.
export function AppSidebar({ onHoverChange, ...props }: AppSidebarProps) {
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const t = useTranslations("sidebar.nav")
  const tCommon = useTranslations("common")

  const navMain = [
    { title: t("home"), url: ROUTES.dashboard, icon: <House />, isActive: true },
    { title: t("channels"), url: "/channels", icon: <Tv /> },
    { title: t("campaigns"), url: "/campaigns", icon: <SendIcon /> },
    { title: t("stores"), url: "/stores", icon: <ShoppingBag /> },
    { title: t("products"), url: "/products", icon: <Grid2x2 /> },
    { title: t("customers"), url: "/customers", icon: <CircleUserRound /> },
    { title: t("reports"), url: "/reports", icon: <ChartNoAxesCombined /> },
    { title: t("ai"), url: "/ai", icon: <Gauge /> },
    { title: t("integrations"), url: "/integrations", icon: <LayoutGrid /> },
    { title: t("administration"), url: ROUTES.administration, icon: <ShieldCheck /> },
    { title: t("settings"), url: "/settings", icon: <Settings2 /> },
  ]

  return (
    <div onMouseEnter={() => onHoverChange?.(true)} onMouseLeave={() => onHoverChange?.(false)}>
      <Sidebar
        side={locale === "ar" ? "right" : "left"}
        collapsible="icon"
        {...props}
        className="border-none shadow-sm"
      >
        <SidebarHeader className="h-20 justify-center px-4" dir={dir}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="p-1 hover:bg-transparent">
                <Link href={ROUTES.dashboard} className="flex items-center justify-center gap-2.5">
                  <div className="hidden aspect-square size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm group-data-[collapsible=icon]:flex">
                    <Sparkles className="size-5" />
                  </div>
                  <Image
                    src={ASSETS.logo}
                    alt="مدار MADAR"
                    width={778}
                    height={325}
                    priority
                    className="h-12 w-auto group-data-[collapsible=icon]:hidden"
                  />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex min-h-full flex-col">
              <NavMain items={navMain} />
            </div>
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="gap-3 px-3 pb-4" dir={dir}>
          <WorkspaceSelector compact />
          <NavUser user={user} />
          <div className="flex items-center justify-center gap-1 border-t border-sidebar-border pt-3">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="size-9 rounded-full" asChild>
              <Link href={ROUTES.settings} aria-label={tCommon("settings")}>
                <Settings2 className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              aria-label={tCommon("help")}
            >
              <HelpCircle className="size-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
