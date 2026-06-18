"use client"

import * as React from "react"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
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
  Gauge,
  Grid2x2,
  LayoutDashboard,
  LayoutGrid,
  SendIcon,
  Settings2,
  Tv,
  House,
  ShoppingBag,
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
      title: "لوحة التحكم",
      url: "/dashboard/analytics",
      icon: (<House />),
      isActive: true,
    },
    {
      title: "القنوات",
      url: "/channels",
      icon: (<Tv />),
    },
    {
      title: "الحملات",
      url: "/campaigns",
      icon: (<SendIcon />),
    },
    {
      title: "المتاجر",
      url: "/stores",
      icon: (<ShoppingBag />),
    },
    {
      title: "المنتجات",
      url: "/products",
      icon: (<Grid2x2 />),
    },
    {
      title: "العملاء",
      url: "/customers",
      icon: (<CircleUserRound />),
    },
    {
      title: "التقارير",
      url: "/reports",
      icon: (<ChartNoAxesCombined />),
    },
    {
      title: "الذكاء الاصطناعي",
      url: "/ai",
      icon: (<Gauge />),
    },
    {
      title: "التكاملات",
      url: "/integrations",
      icon: (<LayoutGrid />),
    },
    {
      title: "الإعدادات",
      url: "/settings",
      icon: (<Settings2 />),
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
     <div
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
    <Sidebar collapsible="icon" {...props} className="shadow-lg">
      <SidebarHeader className="h-16 justify-center px-3 border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="p-2">
              <Link href="/dashboard/analytics">
                <div className="flex aspect-square size-8 items-center justify-center mx-auto rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">MADAR</span>
                  <span className="truncate text-xs">Marketing Intelligence</span>
                </div>
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
      <SidebarFooter className="border-t justify-center px-3">
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
    </div>
  )
}