"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

import { User, Settings, LayoutDashboard, LogOut } from "lucide-react"

import { useAuth } from "@/features/authentication/hooks/use-auth"

export function UserDropdown() {
  const { logout } = useAuth()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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
    <DropdownMenu>
      {/* Trigger */}
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-full h-10 w-10 p-0 overflow-hidden ms-2">
          <Avatar className="h-10 w-10 border-border rounded-full">
            <AvatarImage src="https://untitledui.com/images/avatars/madeleine-pitts" />
            <AvatarFallback>م</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      {/* Content */}
      <DropdownMenuContent side="left" align="end" className="w-56 p-3 rounded-xl shadow-xl">
        {/* Header */}
        <DropdownMenuLabel className="border-border rounded-xl border-1 mb-3 bg-muted/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="https://untitledui.com/images/avatars/madeleine-pitts" />
              <AvatarFallback>م</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">محمد</p>
              <p className="text-xs text-muted-foreground">admin@madar.ai</p>
            </div>
          </div>
        </DropdownMenuLabel>

        {/* Items */}
        <DropdownMenuItem className="gap-2 h-9">
          <User className="!size-5" />
          Profile
        </DropdownMenuItem>

        <DropdownMenuItem className="gap-2 h-9">
          <Settings className="!size-5" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuItem className="gap-2 h-9">
          <LayoutDashboard className="!size-5" />
          Dashboard
        </DropdownMenuItem>

        <DropdownMenuSeparator className="border-1 my-2" />

        {/* Logout */}
        <div className="mt-3">
          <Button
            variant={"default"}
            className="w-full h-8 justify-center gap-2"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut className="size-4" />
            {isLoggingOut ? "Logging out..." : "Logout"}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
