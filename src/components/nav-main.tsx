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

// Sub-items carry their own icon and active treatment rather than inheriting the parent's:
// a nested item reads as a different level, and the filled parent style at this depth made the
// tree look like two selected rows.
const SUB_ITEM_CLASSNAME = cn(
  "relative h-9 min-h-9 gap-2.5 rounded-[8px] px-3 text-[13px] font-bold text-sidebar-foreground",
  "hover:bg-sidebar-active hover:text-sidebar-active-foreground",
  "data-active:bg-sidebar-active data-active:font-bold data-active:text-sidebar-active-foreground",
  "data-active:hover:bg-sidebar-active data-active:hover:text-sidebar-active-foreground",
  "[&>svg]:size-[17px] [&>svg]:shrink-0"
)

// Metrics taken from the Figma source's own token object rather than measured off a screenshot:
// 9px/10px padding, 8px radius, 13px label, 17px icon.
//
// The active row is a light tint with blue text, not the filled navy pill this used to be --
// which is why it needs its own token pair. sidebar-primary is the opposite polarity (dark fill,
// white text) and cannot express it.
const NAV_ITEM_CLASSNAME = cn(
  // Bold on every row is a deliberate departure from the Figma spec (which is 400 idle / 600
  // active): with the weight no longer varying, the active row is distinguished by the blue tint,
  // blue label and accent bar instead.
  "h-auto min-h-0 gap-2.5 rounded-[8px] px-2.5 py-[9px] text-[13px] font-bold text-sidebar-foreground",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "data-active:bg-sidebar-active data-active:font-bold data-active:text-sidebar-active-foreground",
  "data-active:hover:bg-sidebar-active data-active:hover:text-sidebar-active-foreground",
  // The glyph is muted until the row is active, so the column reads as one quiet list.
  "[&>svg:first-child]:size-[17px] [&>svg:first-child]:text-sidebar-icon",
  "data-active:[&>svg:first-child]:text-sidebar-active-foreground"
)

type NavLeafItem = {
  title: string
  url: string
  icon?: React.ReactNode
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

  // The longest matching child wins, not the first. Sibling urls nest -- "/settings" is a prefix
  // of "/settings/devices" -- so a plain prefix test lights up the parent-most item on every
  // sub-page. Longest-match still highlights a section from its own deeper pages, which is why
  // this is not simply an exact comparison.
  const activeSubUrl =
    item.items
      .filter((sub) => isActive(sub.url))
      .sort((left, right) => right.url.length - left.url.length)[0]?.url ?? null

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
            <Link href={item.url} className="flex flex-1 items-center gap-2.5 ps-2.5 py-[9px]">
              {item.icon}
              <span>{item.title}</span>
            </Link>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={item.title}
                className="flex h-full cursor-pointer items-center px-2.5 py-[9px]"
              >
                <ChevronRight className="h-4 w-4 transition-transform duration-200 rtl:rotate-180 group-data-[state=open]:rotate-90" />
              </button>
            </CollapsibleTrigger>
          </div>
        </SidebarMenuButton>

        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items.map((subItem) => {
              const subActive = subItem.url === activeSubUrl

              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuButton asChild isActive={subActive} className={SUB_ITEM_CLASSNAME}>
                    <Link href={subItem.url}>
                      {/* RTL: start-0 puts the accent on the right edge, where the list begins. */}
                      {subActive ? (
                        <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-sidebar-active-foreground" />
                      ) : null}
                      {subItem.icon}
                      <span>{subItem.title}</span>
                    </Link>
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
    <SidebarMenu className="gap-px px-2 py-2.5" dir="rtl">
      {items.map((item) => {
        return hasChildren(item) ? (
          <ParentMenuItem key={item.title} item={item} pathname={pathname} />
        ) : (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild isActive={isActive(item.url)} className={NAV_ITEM_CLASSNAME}>
              <Link href={item.url}>
                {item.icon}

                <span className="flex-1">{item.title}</span>
                {/* RTL: written last so the marker sits at the inline end -- the left edge,
                    where the design puts it. */}
                {isActive(item.url) ? (
                  <span className="-me-0.5 h-5 w-[3px] shrink-0 rounded-[2px] bg-sidebar-active-foreground" />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
