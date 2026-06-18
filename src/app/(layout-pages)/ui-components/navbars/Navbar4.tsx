"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Menu, Search, ChevronDown } from "lucide-react"

export function Navbar4() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <nav className="bg-zinc-900 text-white border border-zinc-800 rounded-lg px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">

          {/* Left Section */}
          <div className="flex items-center gap-8">

            {/* Brand */}
            <h2 className="text-lg font-semibold text-white">
              MyAdmin
            </h2>

            {/* Desktop Nav */}
            <div className="hidden xl:flex items-center gap-6">
              <a href="#" className="text-sm text-zinc-300 hover:text-white transition">
                Dashboard
              </a>
              <a href="#" className="text-sm text-zinc-300 hover:text-white transition">
                Components
              </a>
              <a href="#" className="text-sm text-zinc-300 hover:text-white transition">
                Reports
              </a>

              {/* Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-sm text-zinc-300 hover:text-white transition">
                  Pages <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-800 border-zinc-700 text-white">
                  <DropdownMenuItem className="hover:bg-zinc-700">
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-zinc-700">
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-zinc-700">
                    Reports
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-zinc-700" />
                  <DropdownMenuItem className="hover:bg-zinc-700">
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Right Section */}
          <div className="hidden xl:flex items-center gap-4">

            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Type to search"
                className="pl-9 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 focus-visible:ring-zinc-600"
              />
            </div>

            <Button className="bg-white text-black hover:bg-zinc-200">
              Login
            </Button>
          </div>

          {/* Mobile Toggle */}
          <button
            className="xl:hidden text-white"
            onClick={() => setOpen(!open)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Menu */}
        {open && (
          <div className="mt-4 flex flex-col gap-4 xl:hidden border-t border-zinc-800 pt-4">

            <a href="#" className="text-sm text-zinc-300 hover:text-white">
              Dashboard
            </a>
            <a href="#" className="text-sm text-zinc-300 hover:text-white">
              Components
            </a>
            <a href="#" className="text-sm text-zinc-300 hover:text-white">
              Reports
            </a>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-sm text-zinc-300 hover:text-white">
                Pages <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-zinc-800 border-zinc-700 text-white">
                <DropdownMenuItem className="hover:bg-zinc-700">
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-zinc-700">
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-zinc-700">
                  Reports
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-700" />
                <DropdownMenuItem className="hover:bg-zinc-700">
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative w-full mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Type to search"
                className="pl-9 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 focus-visible:ring-zinc-600"
              />
            </div>

            <Button className="w-full mt-2 bg-white text-black hover:bg-zinc-200">
              Login
            </Button>
          </div>
        )}
      </nav>
    </div>
  )
}
