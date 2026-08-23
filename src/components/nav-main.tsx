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

  // isActive (not a raw `pathname === item.url` check) so this tolerates the trailing slash
  // next.config's trailingSlash:true adds to every real pathname -- a strict comparison against
  // ROUTES.pos ("/pos", no trailing slash) never matched usePathname()'s actual "/pos/".
  const parentActive = isActive(item.url) || item.items.some((sub) => pathname.startsWith(sub.url))

  // Uncontrolled (defaultOpen), so the chevron's click handling is 100% Radix's own -- no custom
  // state syncing that could ever fight with it. The `key` forces a remount (re-reading
  // defaultOpen) only when parentActive actually flips, i.e. when entering or leaving this section
  // -- so clicking the label onto this item's url expands it, but manual toggles while already
  // inside the section (navigating between its own sub-pages) are left alone.
  return (
    <Collapsible
      key={parentActive ? "active" : "inactive"}
      defaultOpen={parentActive}
      className="group"
    >
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={parentActive}
          className={cn(NAV_ITEM_CLASSNAME, "group cursor-pointer gap-0 p-0")}
        >
          <div className="flex w-full items-center">
            <Link href={item.url} className="flex flex-1 items-center gap-3 px-3 py-2.5">
              {item.icon}
              <span>{item.title}</span>
            </Link>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={item.title}
                className="flex h-full cursor-pointer items-center px-3 py-2.5"
              >
                <ChevronRight className="h-4 w-4 transition-transform duration-200 rtl:rotate-180 group-data-[state=open]:rotate-90" />
              </button>
            </CollapsibleTrigger>
          </div>
        </SidebarMenuButton>

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

  // Longest-prefix-match across the top-level items: when one item's url is itself a path
  // prefix of another's (e.g. "/campaigns" and "/campaigns/links"), only the most specific
  // match should light up -- a plain prefix check would highlight both.
  const bestMatchUrl = items
    .map((item) => item.url)
    .filter((url) => pathname === url || pathname.startsWith(url + "/"))
    .sort((a, b) => b.length - a.length)[0]

  const isActive = (url: string) => url === bestMatchUrl

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
