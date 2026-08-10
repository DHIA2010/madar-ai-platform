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

export function NavUser() {
  const { currentUser, logout } = useAuth()
  const router = useRouter()
  const { isMobile, state } = useSidebar()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const collapsed = state === "collapsed"
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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
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
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 p-3 rounded-xl shadow-xl"
            side={isMobile ? "bottom" : "left"}
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
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
