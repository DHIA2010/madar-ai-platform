"use client"

import { useEffect, useState } from "react"
import type { UIEvent } from "react"
import { usePathname, useRouter } from "next/navigation"

import { ChevronDown, RefreshCw } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { LanguageSwitcher } from "@/components/language-switcher"
import { NotificationDropdown } from "@/components/notification-dropdown"
import { GlobalSearch } from "@/components/global-search"
import { NavUser } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import { WorkspaceSelector } from "@/features/workspace"

import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useIsMobile } from "@/hooks/use-mobile"

import { cn } from "@/lib/utils"

// On a phone the menu is a drawer over the page: opening a page from it should close it, so the
// page is what's on screen next (it used to stay open, covering the page just opened).
function CloseMobileMenuOnNavigate() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])
  return null
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // ✅ State for scroll, sidebar open, and hover
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(true)
  const [hovered, setHovered] = useState(false)
  const router = useRouter()
  const [headerOpen, setHeaderOpen] = useState(false)
  // On a phone the top bar holds the only way to open the menu, so it is always shown there; the
  // show/hide handle is a desktop nicety for more room.
  const isMobile = useIsMobile()
  const headerShown = headerOpen || isMobile

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
      <CloseMobileMenuOnNavigate />
      <AppSidebar onHoverChange={setHovered} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="relative w-full shrink-0">
          <header
            className={cn(
              "flex w-full items-center gap-2 overflow-hidden border-b bg-background/95 px-3 backdrop-blur transition-[height,opacity] duration-200 supports-[backdrop-filter]:bg-background/80 md:px-6",
              headerShown ? "h-16 opacity-100" : "h-0 border-b-transparent opacity-0",
              scrolled && headerShown && "shadow-md"
            )}
          >
            <div className="flex items-center gap-1">
              <SidebarTrigger className="-ms-1 rounded-full h-10 w-10 [&_svg]:!size-5 hover:bg-muted/60 transition-colors" />
            </div>

            <div className="ms-auto min-w-0">
              <div className="flex min-w-0 items-center gap-1 md:gap-2">
                <div className="hidden md:block">
                  <GlobalSearch />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-10 rounded-full hover:bg-muted/60 md:inline-flex"
                  aria-label="تحديث الصفحة"
                  // A soft refresh: reloads the page's data and keeps what is on screen (an open
                  // cashier cart, a half-filled form) instead of throwing it away.
                  onClick={() => router.refresh()}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <div className="relative inline-flex">
                  <NotificationDropdown />
                </div>
                <LanguageSwitcher />
                {/* Moved here from the sidebar footer: the account/workspace switcher and the
                    signed-in user, both one click away from the same page regardless of whether
                    the rail is expanded or collapsed to icons. */}
                <div className="hidden w-[200px] lg:block">
                  <WorkspaceSelector compact />
                </div>
                <div className="min-w-0 max-w-[150px] sm:max-w-none">
                  <NavUser variant="header" />
                </div>
              </div>
            </div>
          </header>

          {/* Below the desktop width the top bar has no room for the workspace switcher, which
              left phone and tablet users with no way to change branch: it gets its own row. */}
          {headerShown ? (
            <div className="border-b bg-background px-3 py-2 lg:hidden">
              <WorkspaceSelector compact />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setHeaderOpen((value) => !value)}
            aria-label={headerOpen ? "إخفاء الشريط العلوي" : "إظهار الشريط العلوي"}
            aria-expanded={headerOpen}
            className="absolute left-1/2 top-full z-50 hidden h-7 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-foreground shadow-md transition-colors hover:bg-muted md:flex"
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
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6"
          onScroll={handleContentScroll}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
