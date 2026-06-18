"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
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
import { ChevronsUpDownIcon, ShieldPlus, BadgeCheckIcon, CreditCardIcon, BellIcon, LogOutIcon } from "lucide-react"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile, state } = useSidebar()

const collapsed = state === "collapsed"

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
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback>CN</AvatarFallback>
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
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>

      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          {user.name}
        </span>

        <span className="truncate text-xs">
          {user.email}
        </span>
      </div>

      <ChevronsUpDownIcon className="ml-auto size-4" />
    </SidebarMenuButton>
  )}
</DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 p-3 rounded-xl shadow-xl"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal border-border rounded-xl border-1 mb-3 bg-muted/50">
              <div className="flex items-center gap-2 text-left text-sm p-2">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-2"/>
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 h-9">
                <ShieldPlus className="!size-5" 
                />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-2"/>
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 h-9">
                <BadgeCheckIcon className="!size-5" 
                />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 h-9">
                <CreditCardIcon className="!size-5" 
                />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 h-9">
                <BellIcon className="!size-5" 
                />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-2"/>
            <DropdownMenuItem className="gap-2 h-9">
              <LogOutIcon className="!size-5" 
              />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
