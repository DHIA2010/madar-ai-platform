"use client"

import { useEffect, useState } from "react"
import type { UIEvent } from "react"

import { ChevronDown, RefreshCw } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { LanguageSwitcher } from "@/components/language-switcher"
import { NotificationDropdown } from "@/components/notification-dropdown"
import { GlobalSearch } from "@/components/global-search"
import { NavUser } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import { WorkspaceSelector } from "@/features/workspace"

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

import { cn } from "@/lib/utils"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // ✅ State for scroll, sidebar open, and hover
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [headerOpen, setHeaderOpen] = useState(false)

  const isExpanded = open || hovered

  // Content now scrolls inside its own container (see the content div below) instead of the
  // document, so the header's scroll-shadow reads that container's scrollTop directly.
  function handleContentScroll(event: UIEvent<HTMLDivElement>) {
    setScrolled(event.currentTarget.scrollTop > 10)
  }

  // Handle responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      setOpen(window.innerWidth >= 1024)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <SidebarProvider open={isExpanded} onOpenChange={setOpen} className="h-svh overflow-hidden">
      <AppSidebar onHoverChange={setHovered} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="relative w-full shrink-0">
          <header
            className={cn(
              "px-6 flex w-full items-center gap-2 overflow-hidden border-b bg-background/95 backdrop-blur transition-[height,opacity] duration-200 supports-[backdrop-filter]:bg-background/80",
              headerOpen ? "h-16 opacity-100" : "h-0 border-b-transparent opacity-0",
              scrolled && headerOpen && "shadow-md"
            )}
          >
            <div className="flex items-center gap-1">
              <SidebarTrigger className="-ms-1 rounded-full h-10 w-10 [&_svg]:!size-5 hover:bg-muted/60 transition-colors" />
            </div>

            <div className="ms-auto">
              <div className="flex items-center gap-2">
                <GlobalSearch />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-full hover:bg-muted/60"
                  aria-label="Refresh"
                >
                  <RefreshCw className="size-4" />
                </Button>
                <div className="relative hidden md:inline-flex">
                  <NotificationDropdown />
                </div>
                <LanguageSwitcher />
                {/* Moved here from the sidebar footer: the account/workspace switcher and the
                    signed-in user, both one click away from the same page regardless of whether
                    the rail is expanded or collapsed to icons. */}
                <div className="hidden w-[200px] lg:block">
                  <WorkspaceSelector compact />
                </div>
                <NavUser variant="header" />
              </div>
            </div>
          </header>

          <button
            type="button"
            onClick={() => setHeaderOpen((value) => !value)}
            aria-label={headerOpen ? "إخفاء الشريط العلوي" : "إظهار الشريط العلوي"}
            aria-expanded={headerOpen}
            className="absolute left-1/2 top-full z-50 flex h-7 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-md transition-colors hover:bg-muted"
          >
            <ChevronDown
              className={cn(
                "size-4 stroke-[2.5]",
                headerOpen && "rotate-180",
                "transition-transform duration-200"
              )}
            />
          </button>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6"
          onScroll={handleContentScroll}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
