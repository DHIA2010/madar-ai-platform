"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Activity,
  CalendarClock,
  FileText,
  Flag,
  HeartPulse,
  History,
  House,
  Layers,
  LayoutGrid,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Ticket,
  UserCog,
  Users,
  Wallet,
} from "lucide-react"

import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import { NavMain } from "@/components/nav-main"

type MadarAdminSidebarProps = React.ComponentProps<typeof Sidebar> & {
  onHoverChange?: (value: boolean) => void
}

// Structurally the same shell as app-sidebar.tsx (logo header / scrollable nav / footer card),
// but with its own grouped nav list -- there's no tenant/workspace concept in this console, so
// nothing about app-sidebar.tsx's actual nav items applies here.
export function MadarAdminSidebar({ onHoverChange, ...props }: MadarAdminSidebarProps) {
  const groupOne = [
    { title: "الرئيسية", url: ROUTES.madarAdmin, icon: <House /> },
    { title: "العملاء", url: ROUTES.madarAdminCustomers, icon: <Users /> },
    { title: "المتاجر", url: ROUTES.madarAdminStores, icon: <ShoppingBag /> },
    { title: "الاشتراكات", url: ROUTES.madarAdminSubscriptions, icon: <CalendarClock /> },
    { title: "الباقات", url: ROUTES.madarAdminPackages, icon: <Layers /> },
    { title: "الكوبونات", url: ROUTES.madarAdminCoupons, icon: <Ticket /> },
  ]
  const groupTwo = [
    { title: "المدفوعات", url: ROUTES.madarAdminPayments, icon: <Wallet /> },
    { title: "الفواتير", url: ROUTES.madarAdminInvoices, icon: <FileText /> },
  ]
  const groupThree = [
    { title: "التكاملات", url: ROUTES.madarAdminIntegrations, icon: <LayoutGrid /> },
    { title: "Tracking & Events", url: ROUTES.madarAdminTracking, icon: <Activity /> },
    { title: "System Health", url: ROUTES.madarAdminSystemHealth, icon: <HeartPulse /> },
  ]
  const groupFour = [
    { title: "المستخدمون", url: ROUTES.madarAdminUsers, icon: <UserCog /> },
    { title: "الأدوار والصلاحيات", url: ROUTES.madarAdminRoles, icon: <ShieldCheck /> },
    { title: "سجل التغييرات", url: ROUTES.madarAdminActivityLog, icon: <History /> },
    { title: "Feature Flags", url: ROUTES.madarAdminFeatureFlags, icon: <Flag /> },
    { title: "إعدادات المنصة", url: ROUTES.madarAdminSettings, icon: <Settings2 /> },
  ]

  return (
    <div onMouseEnter={() => onHoverChange?.(true)} onMouseLeave={() => onHoverChange?.(false)}>
      <Sidebar
        side="right"
        collapsible="icon"
        {...props}
        className="border-none border-e border-e-sidebar-border"
      >
        <SidebarHeader
          className="justify-center border-b border-sidebar-border px-4 pt-[18px] pb-[14px]"
          dir="rtl"
        >
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="p-1 hover:bg-transparent">
                <Link href={ROUTES.madarAdmin} className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="hidden aspect-square size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm group-data-[collapsible=icon]:flex">
                      <Sparkles className="size-5" />
                    </div>
                    <Image
                      src={ASSETS.logo}
                      alt="مدار MADAR"
                      width={778}
                      height={325}
                      priority
                      className="h-10 w-auto group-data-[collapsible=icon]:hidden"
                    />
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Admin Console
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex min-h-full flex-col gap-2">
              <NavMain items={groupOne} />
              <NavMain items={groupTwo} />
              <NavMain items={groupThree} />
              <NavMain items={groupFour} />
            </div>
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:hidden" dir="rtl">
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 text-center">
            <p className="text-xs font-medium leading-5 text-muted-foreground">
              نبني رؤى أوضح للتجارة الإلكترونية
            </p>
          </div>
        </SidebarFooter>
      </Sidebar>
    </div>
  )
}
