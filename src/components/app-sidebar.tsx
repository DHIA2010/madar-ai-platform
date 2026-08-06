"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"
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

// nav menues
const data = {
  user: {
    name: "محمد",
    email: "admin@madar.ai",
    avatar: "https://untitledui.com/images/avatars/madeleine-pitts",
  },
  navMain: [
    {
      title: "الرئيسية",
      url: ROUTES.dashboard,
      icon: <House />,
      isActive: true,
    },
    {
      title: "القنوات",
      url: "/channels",
      icon: <Tv />,
    },
    {
      title: "الحملات",
      url: "/campaigns",
      icon: <SendIcon />,
    },
    {
      title: "المتاجر",
      url: "/stores",
      icon: <ShoppingBag />,
    },
    {
      title: "المنتجات",
      url: "/products",
      icon: <Grid2x2 />,
    },
    {
      title: "العملاء",
      url: "/customers",
      icon: <CircleUserRound />,
    },
    {
      title: "التقارير",
      url: "/reports",
      icon: <ChartNoAxesCombined />,
    },
    {
      title: "الذكاء الاصطناعي",
      url: "/ai",
      icon: <Gauge />,
    },
    {
      title: "التكاملات",
      url: "/integrations",
      icon: <LayoutGrid />,
    },
    {
      title: "الإدارة",
      url: ROUTES.administration,
      icon: <ShieldCheck />,
    },
    {
      title: "الإعدادات",
      url: "/settings",
      icon: <Settings2 />,
    },
  ],
}

// This is the sidebar component used in the app layout.
type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  onHoverChange?: (value: boolean) => void
}

// The sidebar component used in the app layout. It receives an `onHoverChange` prop to notify the parent layout when the sidebar is hovered or not.
export function AppSidebar({ onHoverChange, ...props }: AppSidebarProps) {
  return (
    <div onMouseEnter={() => onHoverChange?.(true)} onMouseLeave={() => onHoverChange?.(false)}>
      <Sidebar side="right" collapsible="icon" {...props} className="border-none shadow-sm">
        <SidebarHeader className="h-20 justify-center px-4" dir="rtl">
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
              <NavMain items={data.navMain} />
            </div>
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="gap-3 px-3 pb-4" dir="rtl">
          <WorkspaceSelector compact />
          <NavUser user={data.user} />
          <div className="flex items-center justify-center gap-1 border-t border-sidebar-border pt-3">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="size-9 rounded-full" asChild>
              <Link href={ROUTES.settings} aria-label="Settings">
                <Settings2 className="size-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Help">
              <HelpCircle className="size-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
