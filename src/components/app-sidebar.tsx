"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import { NavMain } from "@/components/nav-main"
import { SettingsHelpCard } from "@/components/settings-help-card"
import { usePermissions } from "@/features/authentication"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  ChartNoAxesCombined,
  CircleUserRound,
  ClipboardList,
  Clock,
  CreditCard,
  ShieldCheck,
  Gauge,
  Grid2x2,
  LayoutGrid,
  Link2,
  SendIcon,
  Settings2,
  Tv,
  House,
  ShoppingBag,
  Sparkles,
  Radio,
} from "lucide-react"
import { ScrollArea } from "./ui/scroll-area"

// This is the sidebar component used in the app layout.
type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  onHoverChange?: (value: boolean) => void
}

// The sidebar component used in the app layout. It receives an `onHoverChange` prop to notify the parent layout when the sidebar is hovered or not.
export function AppSidebar({ onHoverChange, ...props }: AppSidebarProps) {
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const t = useTranslations("sidebar.nav")
  const { can } = usePermissions()

  const navMain = [
    {
      title: t("home"),
      url: ROUTES.dashboard,
      icon: <House />,
      isActive: true,
      permission: "dashboard:view",
    },
    {
      title: t("liveVisitors"),
      url: ROUTES.liveVisitors,
      icon: <Radio />,
      // Same permission the underlying GET /v1/tracking/live-dashboard enforces -- hiding the
      // nav entry from someone the API would reject anyway.
      permission: "campaigns:view",
    },
    { title: t("channels"), url: "/channels", icon: <Tv /> },
    { title: t("campaigns"), url: "/campaigns", icon: <SendIcon />, permission: "campaigns:view" },
    {
      title: t("linkBuilder"),
      url: ROUTES.campaignLinks,
      icon: <Link2 />,
      permission: "campaigns:view",
    },
    { title: t("stores"), url: "/stores", icon: <ShoppingBag /> },
    { title: t("products"), url: "/products", icon: <Grid2x2 />, permission: "products:view" },
    { title: t("orders"), url: ROUTES.orders, icon: <ClipboardList />, permission: "orders:view" },
    { title: t("pos"), url: ROUTES.pos, icon: <CreditCard />, permission: "pos:view" },
    { title: t("shifts"), url: ROUTES.shifts, icon: <Clock />, permission: "pos:view" },
    {
      title: t("customers"),
      url: "/customers",
      icon: <CircleUserRound />,
      permission: "customers:view",
    },
    {
      title: t("reports"),
      url: "/reports",
      icon: <ChartNoAxesCombined />,
      permission: "reports:view",
    },
    { title: t("ai"), url: "/ai", icon: <Gauge />, permission: "ai:view" },
    {
      title: t("integrations"),
      url: "/integrations",
      icon: <LayoutGrid />,
      permission: "connections:view",
    },
    {
      title: t("administration"),
      url: ROUTES.administration,
      icon: <ShieldCheck />,
      permission: "users:view",
    },
    // No sub-items: the settings screens carry their own section rail beside the content, and
    // duplicating it here gave two navigations for the same set of pages.
    { title: t("settings"), url: ROUTES.settings, icon: <Settings2 /> },
  ].filter((item) => !item.permission || can(item.permission))

  return (
    <div onMouseEnter={() => onHoverChange?.(true)} onMouseLeave={() => onHoverChange?.(false)}>
      <Sidebar
        side={locale === "ar" ? "right" : "left"}
        collapsible="icon"
        {...props}
        className="border-none border-e border-e-sidebar-border"
      >
        <SidebarHeader
          className="justify-center border-b border-sidebar-border px-4 pt-[18px] pb-[14px]"
          dir={dir}
        >
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
        {/* The account/workspace switcher and the signed-in user used to live here; they now sit
            in the header (admin-layout.tsx) instead, one click away regardless of whether this
            rail is expanded or collapsed to icons. The theme toggle, settings shortcut, and help
            icon that replaced them are gone too -- settings is already the last item in the nav
            list above, and this help card is the one thing worth always having in reach.
            group-data-[collapsible=icon]:hidden matches every other piece of sidebar text: there
            is no room for a paragraph of Arabic in a 40px-wide collapsed rail. */}
        <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:hidden" dir={dir}>
          <SettingsHelpCard />
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
