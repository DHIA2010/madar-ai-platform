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
  House,
  Inbox,
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
import { useAuth } from "@/features/authentication"

type MadarAdminSidebarProps = React.ComponentProps<typeof Sidebar> & {
  onHoverChange?: (value: boolean) => void
}

// Structurally the same shell as app-sidebar.tsx (logo header / scrollable nav / footer card),
// but with its own grouped nav list -- there's no tenant/workspace concept in this console, so
// nothing about app-sidebar.tsx's actual nav items applies here.
export function MadarAdminSidebar({ onHoverChange, ...props }: MadarAdminSidebarProps) {
  // Each staff role sees only the pages its permissions reach (the backend enforces the same
  // permissions on every route -- hiding is just so nobody lands on a page that would refuse).
  const { currentUser } = useAuth()
  const granted = new Set(currentUser?.platformPermissions ?? [])
  type Item = { title: string; url: string; icon: React.ReactNode; permission: string }
  const visible = (items: Item[]) => items.filter((item) => granted.has(item.permission))

  const groupOne = visible([
    { title: "الرئيسية", url: ROUTES.madarAdmin, icon: <House />, permission: "customers:view" },
    {
      title: "طلبات الاشتراك",
      url: ROUTES.madarAdminRequests,
      icon: <Inbox />,
      permission: "customers:view",
    },
    {
      title: "العملاء",
      url: ROUTES.madarAdminCustomers,
      icon: <Users />,
      permission: "customers:view",
    },
    {
      title: "المتاجر",
      url: ROUTES.madarAdminStores,
      icon: <ShoppingBag />,
      permission: "operations:view",
    },
    {
      title: "الاشتراكات",
      url: ROUTES.madarAdminSubscriptions,
      icon: <CalendarClock />,
      permission: "customers:view",
    },
    {
      title: "الباقات",
      url: ROUTES.madarAdminPackages,
      icon: <Layers />,
      permission: "pricing:manage",
    },
    {
      title: "الكوبونات",
      url: ROUTES.madarAdminCoupons,
      icon: <Ticket />,
      permission: "coupons:manage",
    },
  ])
  const groupTwo = visible([
    {
      title: "المدفوعات",
      url: ROUTES.madarAdminPayments,
      icon: <Wallet />,
      permission: "billing:view",
    },
    {
      title: "الفواتير",
      url: ROUTES.madarAdminInvoices,
      icon: <FileText />,
      permission: "billing:view",
    },
  ])
  const groupThree = visible([
    {
      title: "التكاملات",
      url: ROUTES.madarAdminIntegrations,
      icon: <LayoutGrid />,
      permission: "operations:view",
    },
    {
      title: "Tracking & Events",
      url: ROUTES.madarAdminTracking,
      icon: <Activity />,
      permission: "operations:view",
    },
    {
      title: "System Health",
      url: ROUTES.madarAdminSystemHealth,
      icon: <HeartPulse />,
      permission: "operations:view",
    },
  ])
  const groupFour = visible([
    {
      title: "المستخدمون",
      url: ROUTES.madarAdminUsers,
      icon: <UserCog />,
      permission: "staff:manage",
    },
    {
      title: "الأدوار والصلاحيات",
      url: ROUTES.madarAdminRoles,
      icon: <ShieldCheck />,
      permission: "customers:view",
    },
    {
      title: "Feature Flags",
      url: ROUTES.madarAdminFeatureFlags,
      icon: <Flag />,
      permission: "flags:manage",
    },
    {
      title: "إعدادات المنصة",
      url: ROUTES.madarAdminSettings,
      icon: <Settings2 />,
      permission: "settings:manage",
    },
  ])

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
              {[groupOne, groupTwo, groupThree, groupFour]
                .filter((group) => group.length > 0)
                .map((group) => (
                  <NavMain key={group[0].url} items={group} />
                ))}
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
