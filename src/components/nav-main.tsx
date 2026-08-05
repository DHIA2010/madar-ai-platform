"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"

import { ChevronRight } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

import { cn } from "@/lib/utils"

const NAV_ITEM_CLASSNAME = cn(
  "h-11 gap-3 rounded-xl px-3 text-[15px] font-medium text-sidebar-foreground",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground",
  "[&>svg:first-child]:size-[18px]"
)

type NavLeafItem = {
  title: string
  url: string
}

type NavItem = {
  title: string
  url: string
  icon?: React.ReactNode
  items?: NavLeafItem[]
}

type NavWithChildren = NavItem & { items: NavLeafItem[] }

function hasChildren(item: NavItem): item is NavWithChildren {
  return Array.isArray(item.items) && item.items.length > 0
}

function ParentMenuItem({ item, pathname }: { item: NavWithChildren; pathname: string }) {
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/")

  const parentActive = item.items.some((sub) => pathname.startsWith(sub.url))

  return (
    <Collapsible key={`${item.title}:${pathname}`} defaultOpen={parentActive} className="group">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className={cn(NAV_ITEM_CLASSNAME, "group")} isActive={parentActive}>
            {item.icon}
            <span>{item.title}</span>
            <ChevronRight className="ms-auto h-4 w-4 transition-transform duration-200 rtl:rotate-180 group-data-[state=open]:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items.map((subItem) => {
              const subActive = isActive(subItem.url)

              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuButton asChild isActive={subActive} className="h-8 min-h-8 ps-6">
                    <Link href={subItem.url}>{subItem.title}</Link>
                  </SidebarMenuButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  // Active Route Check
  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + "/")
  }

  return (
    <SidebarMenu className="gap-1 px-3 py-2" dir="rtl">
      {items.map((item) => {
        return hasChildren(item) ? (
          <ParentMenuItem key={item.title} item={item} pathname={pathname} />
        ) : (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={isActive(item.url)} className={NAV_ITEM_CLASSNAME}>
              <Link href={item.url}>
                {item.icon}

                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
