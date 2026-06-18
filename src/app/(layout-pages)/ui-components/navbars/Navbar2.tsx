"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Menu,
  Search,
  Moon,
  Grid,
  Bell,
  Settings,
  User,
  LogOut,
} from "lucide-react"

export function Navbar2() {
  return (
    <div>
      <div className="border rounded-xl px-6 py-4 bg-background shadow-sm">

        <div className="flex items-center justify-between">

          {/* Left Menu Button */}
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search Bar (Desktop Only) */}
          <div className="hidden lg:block flex-1 max-w-sm mx-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="pl-9 pr-16 rounded-full"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Ctrl + K
            </span>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-1">

            <Button variant="ghost" size="icon">
              <Moon className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon">
              <Grid className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>

            {/* Avatar Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center">
                  <span className="font-semibold text-cyan-600">S</span>

                  {/* Online Dot */}
                  <span className="absolute bottom-1 right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white"></span>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>

                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>

        </div>
      </div>
    </div>
  )
}
