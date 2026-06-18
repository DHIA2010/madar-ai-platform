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

export function Navbar5() {
  return (
    <div>
      <div className="rounded-2xl px-6 py-4 bg-gradient-to-r from-red-500 via-orange-500 to-pink-500 shadow-lg text-white">

        <div className="flex items-center justify-between">

          {/* Left Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 transition"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search Bar (Desktop Only) */}
          <div className="hidden lg:block flex-1 max-w-sm mx-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
            <Input
              placeholder="Search"
              className="pl-9 pr-16 rounded-full bg-white/20 border-none text-white placeholder:text-white/70 focus-visible:ring-2 focus-visible:ring-white/40 backdrop-blur-md"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/70">
              Ctrl + K
            </span>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">

            {/* Theme */}
            <Button
              size="icon"
              className="bg-yellow-400 hover:bg-yellow-300 text-black rounded-full shadow-md"
            >
              <Moon className="h-5 w-5" />
            </Button>

            {/* Apps */}
            <Button
              size="icon"
              className="bg-blue-500 hover:bg-blue-400 text-white rounded-full shadow-md"
            >
              <Grid className="h-5 w-5" />
            </Button>

            {/* Notifications */}
            <Button
              size="icon"
              className="bg-red-500 hover:bg-red-400 text-white rounded-full shadow-md"
            >
              <Bell className="h-5 w-5" />
            </Button>

            {/* Settings */}
            <Button
              size="icon"
              className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-full shadow-md"
            >
              <Settings className="h-5 w-5" />
            </Button>

            {/* Avatar Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg">
                  <span className="font-semibold text-white">S</span>

                  {/* Online Dot */}
                  <span className="absolute bottom-1 right-1 h-3 w-3 bg-green-400 rounded-full border-2 border-white"></span>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-48 bg-white text-black rounded-xl shadow-xl"
              >
                <DropdownMenuItem className="hover:bg-purple-50">
                  <User className="mr-2 h-4 w-4 text-purple-600" />
                  Profile
                </DropdownMenuItem>

                <DropdownMenuItem className="hover:bg-blue-50">
                  <Settings className="mr-2 h-4 w-4 text-blue-600" />
                  Settings
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem className="text-red-600 hover:bg-red-50">
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
