"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  ChevronsUpDownIcon,
  ShieldPlus,
  BadgeCheckIcon,
  CreditCardIcon,
  BellIcon,
  LogOutIcon,
} from "lucide-react"

import { useAuth } from "@/features/authentication/hooks/use-auth"
import { cn } from "@/lib/utils"

function getInitials(fullName: string | undefined) {
  if (!fullName) {
    return "?"
  }
  const parts = fullName.trim().split(/\s+/)
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
  return initials.toUpperCase() || "?"
}

interface NavUserProps {
  // "sidebar" (default): sized to the rail, collapses to an icon with the rail itself, and opens
  // its dropdown to the side -- the footer's original behavior. "header": a fixed-size trigger
  // that always shows the full card regardless of the sidebar's own collapsed state (a header
  // control has no "collapsed" state of its own to follow), opening downward like every other
  // header dropdown.
  variant?: "sidebar" | "header"
}

export function NavUser({ variant = "sidebar" }: NavUserProps) {
  const { currentUser, logout } = useAuth()
  const router = useRouter()
  const { isMobile, state } = useSidebar()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const collapsed = variant === "sidebar" && state === "collapsed"
  const name = currentUser?.fullName ?? "—"
  const email = currentUser?.email ?? ""
  const avatarUrl = currentUser?.avatarUrl ?? undefined
  const initials = getInitials(currentUser?.fullName)

  const handleLogout = async () => {
    if (isLoggingOut) {
      return
    }

    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      router.replace("/auth/basic/login")
      setIsLoggingOut(false)
    }
  }

  const trigger =
    variant === "header" ? (
      <button
        type="button"
        className="flex w-[220px] max-w-full cursor-pointer items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-3 py-2 text-start transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
      >
        <Avatar className="h-9 w-9 rounded-xl shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 text-start text-sm leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </div>
        <ChevronsUpDownIcon className="ms-auto size-4 shrink-0 text-muted-foreground" />
      </button>
    ) : collapsed ? (
      <button
        className="
        flex h-12 w-12 items-center justify-center
        rounded-xl bg-muted mx-auto
      "
      >
        <Avatar className="h-9 w-9 rounded-xl">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </button>
    ) : (
      <SidebarMenuButton
        size="lg"
        className="
        bg-muted px-2
        data-[state=open]:bg-sidebar-accent
        data-[state=open]:text-sidebar-accent-foreground
      "
      >
        <Avatar className="h-9 w-9 rounded-xl shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>

        <div className="grid flex-1 text-start text-sm leading-tight">
          <span className="truncate font-medium">{name}</span>

          <span className="truncate text-xs">{email}</span>
        </div>

        <ChevronsUpDownIcon className="ms-auto size-4" />
      </SidebarMenuButton>
    )

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(
          "min-w-56 p-3 rounded-xl shadow-xl",
          variant === "header" ? "w-[220px]" : "w-(--radix-dropdown-menu-trigger-width)"
        )}
        side={variant === "header" ? "bottom" : isMobile ? "bottom" : "left"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal border-border rounded-xl border-1 mb-3 bg-muted/50">
          <div className="flex items-center gap-2 text-start text-sm p-2">
            <Avatar className="h-10 w-10">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs">{email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuGroup>
          <DropdownMenuItem className="gap-2 h-9">
            <ShieldPlus className="!size-5" />
            Upgrade to Pro
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="gap-2 h-9"
            onClick={() => router.push("/account/edit-profile")}
          >
            <BadgeCheckIcon className="!size-5" />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 h-9">
            <CreditCardIcon className="!size-5" />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 h-9">
            <BellIcon className="!size-5" />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-2" />
        <DropdownMenuItem className="gap-2 h-9" onSelect={() => void handleLogout()}>
          <LogOutIcon className="!size-5" />
          {isLoggingOut ? "Logging out..." : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // The header trigger is a standalone control; the sidebar trigger has to be a SidebarMenuButton
  // inside a SidebarMenu to pick up the rail's own list styling and collapse behavior.
  if (variant === "header") {
    return menu
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>{menu}</SidebarMenuItem>
    </SidebarMenu>
  )
}
