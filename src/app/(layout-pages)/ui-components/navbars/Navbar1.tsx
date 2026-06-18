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

export function Navbar1() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <nav className="border rounded-xl px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">

          {/* Left Section */}
          <div className="flex items-center gap-8">

            {/* Brand */}
            <h2 className="text-lg font-semibold">MyAdmin</h2>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-6">
              <a href="#" className="text-md hover:text-primary transition">
                Dashboard
              </a>
              <a href="#" className="text-md hover:text-primary transition">
                Components
              </a>
              <a href="#" className="text-md hover:text-primary transition">
                Reports
              </a>

              {/* Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-sm hover:text-primary transition">
                  Pages <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Settings</DropdownMenuItem>
                  <DropdownMenuItem>Reports</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

          </div>

          {/* Right Section */}
          <div className="hidden lg:flex items-center gap-4">

            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type to search"
                className="pl-9"
              />
            </div>

            <Button>Login</Button>
          </div>

          {/* Mobile Toggle */}
          <button
            className="lg:hidden"
            onClick={() => setOpen(!open)}
          >
            <Menu className="h-6 w-6" />
          </button>

        </div>

        {/* Mobile Menu */}
        {open && (
          <div className="mt-4 flex flex-col gap-3 lg:hidden">

            <a href="#" className="text-sm">Dashboard</a>
            <a href="#" className="text-sm">Components</a>
            <a href="#" className="text-sm">Reports</a>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-sm">
                Pages <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Reports</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative w-full mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type to search"
                className="pl-9"
              />
            </div>

            <Button className="w-full mt-2">Login</Button>

          </div>
        )}

      </nav>
    </div>
  )
}
