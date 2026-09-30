"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"
import { MadarAdminSidebar } from "@/components/madar-admin-sidebar"
import { NavUser } from "@/components/nav-user"
import { NotificationDropdown } from "@/components/notification-dropdown"
import { ThemeToggle } from "@/components/theme-toggle"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

const TODAY_LABEL = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date(2026, 7, 15))

// Structurally identical to admin-layout.tsx (SidebarProvider/SidebarInset/header), minus
// WorkspaceSelector (no workspace concept in a cross-tenant console) and GlobalSearch (its ⌘K
// palette hardcodes tenant destinations -- a plain static search input matches the screenshots'
// look without jumping to the wrong app).
export function MadarAdminShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(true)
  const [hovered, setHovered] = useState(false)

  const isExpanded = open || hovered

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const handleResize = () => setOpen(window.innerWidth >= 1024)
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <SidebarProvider open={isExpanded} onOpenChange={setOpen}>
      <MadarAdminSidebar onHoverChange={setHovered} />
      <SidebarInset>
        <header
          dir="rtl"
          className={cn(
            "sticky top-0 z-40 flex h-16 w-full shrink-0 items-center gap-3 border-b px-6 transition-all duration-200",
            scrolled
              ? "bg-background/80 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/60"
              : "bg-transparent"
          )}
        >
          <SidebarTrigger className="-ms-1 size-10 rounded-full [&_svg]:!size-5 hover:bg-muted/60" />

          <div className="max-w-md flex-1">
            <AppInput
              placeholder="البحث عن عميل، متجر، اشتراك، أو أي شيء..."
              startIcon={<Search className="size-4 text-muted-foreground" />}
              endIcon={
                <span className="rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  ⌘K
                </span>
              }
              className="h-10 bg-muted/40"
              readOnly
            />
          </div>

          <div className="me-auto hidden text-sm text-muted-foreground md:block">{TODAY_LABEL}</div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationDropdown />
            <NavUser variant="header" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
