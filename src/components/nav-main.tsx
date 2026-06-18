"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"

import { ChevronRight } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavMain({ items }: { items: any[] }) {
  const pathname = usePathname()

  // Active Route Check
  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + "/")
  }

  // Parent Active Check
  const isParentActive = (item: any): boolean => {
    if (!item.items) return false

    return item.items.some((sub: any) => {
      if (sub.items) {
        return sub.items.some((child: any) =>
          pathname.startsWith(child.url)
        )
      }

      return pathname.startsWith(sub.url)
    })
  }

  return (
    <SidebarMenu className="px-3 py-2">
      {items.map((item: any) => {
        const parentActive = isParentActive(item)

        const [open, setOpen] = useState(parentActive)

        useEffect(() => {
          if (parentActive) {
            setOpen(true)
          }
        }, [pathname])

        return item.items ? (
          <Collapsible
            key={item.title}
            open={open}
            onOpenChange={setOpen}
            className="group"
          >
            <SidebarMenuItem>
              {/* Parent Menu */}
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  className="group"
                  isActive={parentActive}
                  
                >
                  {item.icon}

                  <span>{item.title}</span>

                  <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items.map((subItem: any) => {
                    const subActive = isActive(subItem.url)

                    return (
                      <SidebarMenuSubItem key={subItem.title}>
                        {subItem.items ? (
                          <Collapsible
                            className="group"
                            defaultOpen={subItem.items.some(
                              (child: any) =>
                                pathname.startsWith(child.url)
                            )}
                          >
                            {/* Nested Trigger */}
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton className="group h-8 min-h-8 pl-6">
                                <span>{subItem.title}</span>

                                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>

                            {/* Nested Content */}
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {subItem.items.map((child: any) => (
                                  <SidebarMenuButton
                                    key={child.title}
                                    asChild
                                    isActive={isActive(child.url)}
                                    className="h-8 min-h-8 pl-6"
                                  >
                                    <Link href={child.url}>
                                      {child.title}
                                    </Link>
                                  </SidebarMenuButton>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </Collapsible>
                        ) : (
                          <SidebarMenuButton
                            asChild
                            isActive={subActive}
                            className="h-8 min-h-8 pl-6"
                          >
                            <Link href={subItem.url}>
                              {subItem.title}
                            </Link>
                          </SidebarMenuButton>
                        )}
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ) : (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              isActive={isActive(item.url)}
            >
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