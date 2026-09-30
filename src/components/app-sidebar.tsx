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
import { APPLICATION_SETTINGS_KEY, type ApplicationCategoryId } from "@/features/applications"
import { usePermissions } from "@/features/authentication"
import { useWorkspace } from "@/features/workspace"
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
  Blocks,
  ChartNoAxesCombined,
  CircleUserRound,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
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
  const { currentOrganization } = useWorkspace()

  // Which of the 4 applications (see src/features/applications) this organization has activated
  // -- a brand-new org has none active, so only items with no `applications` field (core/platform
  // pages) show until something is activated from /marketplace.
  const activeApplications = (
    Object.keys(APPLICATION_SETTINGS_KEY) as ApplicationCategoryId[]
  ).filter((app) => Boolean(currentOrganization?.settings?.[APPLICATION_SETTINGS_KEY[app]]))

  const navMain = [
    {
      title: t("home"),
      url: ROUTES.dashboard,
      icon: <House />,
      isActive: true,
      permission: "dashboard:view",
    },
    // No permission key: unlike every other module here, there's no real "applications:view"
    // entry in the IAM permission taxonomy yet. Always visible, same as "settings" below -- it's
    // the page you go to in order to activate everything else.
    { title: t("applications"), url: ROUTES.marketplace, icon: <Blocks /> },
    {
      title: t("liveVisitors"),
      url: ROUTES.liveVisitors,
      icon: <Radio />,
      // Same permission the underlying GET /v1/tracking/live-dashboard enforces -- hiding the
      // nav entry from someone the API would reject anyway.
      permission: "liveVisitors:view",
      applications: ["ecommerce"],
    },
    {
      title: t("channels"),
      url: "/channels",
      icon: <Tv />,
      permission: "campaigns:view",
      applications: ["advertising"],
    },
    {
      title: t("campaigns"),
      url: "/campaigns",
      icon: <SendIcon />,
      permission: "campaigns:view",
      applications: ["advertising"],
    },
    {
      title: t("linkBuilder"),
      url: ROUTES.campaignLinks,
      icon: <Link2 />,
      permission: "campaigns:view",
      applications: ["advertising"],
    },
    {
      title: t("stores"),
      url: "/stores",
      icon: <ShoppingBag />,
      permission: "stores:view",
      applications: ["ecommerce"],
    },
    // Shared: a merchant running only POS (no online store) still needs Products, and an
    // ecommerce-only merchant needs Invoices too -- neither belongs to exactly one application.
    {
      title: t("products"),
      url: "/products",
      icon: <Grid2x2 />,
      permission: "products:view",
      applications: ["ecommerce", "pos"],
    },
    {
      title: t("orders"),
      url: ROUTES.orders,
      icon: <ClipboardList />,
      permission: "orders:view",
      applications: ["ecommerce"],
    },
    {
      title: t("pos"),
      url: ROUTES.pos,
      icon: <CreditCard />,
      permission: "pos:view",
      applications: ["pos"],
    },
    {
      title: t("invoices"),
      url: ROUTES.invoices,
      icon: <FileText />,
      permission: "pos:view",
      applications: ["ecommerce", "pos"],
    },
    {
      title: t("shifts"),
      url: ROUTES.shifts,
      icon: <Clock />,
      permission: "pos:view",
      applications: ["pos"],
    },
    {
      title: t("customers"),
      url: "/customers",
      icon: <CircleUserRound />,
      permission: "customers:view",
      applications: ["ecommerce", "pos"],
    },
    // Reports/AI/Integrations are cross-cutting utility pages, not owned by a single application
    // -- visible once ANY application is active (the `.some()` filter below naturally treats a
    // 4-item `applications` list as "any of these").
    {
      title: t("reports"),
      url: "/reports",
      icon: <ChartNoAxesCombined />,
      permission: "reports:view",
      applications: ["advertising", "ecommerce", "pos", "madarApps"],
    },
    {
      title: t("ai"),
      url: "/ai",
      icon: <Gauge />,
      permission: "ai:view",
      applications: ["advertising", "ecommerce", "pos", "madarApps"],
    },
    {
      title: t("integrations"),
      url: "/integrations",
      icon: <LayoutGrid />,
      permission: "connections:view",
      applications: ["advertising", "ecommerce", "pos", "madarApps"],
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
  ]
    .filter((item) => !item.permission || can(item.permission))
    .filter(
      (item) =>
        !item.applications ||
        item.applications.some((app) => activeApplications.includes(app as ApplicationCategoryId))
    )

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
