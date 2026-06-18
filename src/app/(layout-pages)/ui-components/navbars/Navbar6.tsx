"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Menu } from "lucide-react"

export function Navbar6() {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <nav className="rounded-2xl px-6 py-4 bg-gradient-to-r from-sky-100 via-indigo-100 to-purple-100 shadow-lg border border-indigo-200">

        <div className="flex items-center justify-between">

          {/* Logo */}
          <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            MyAdmin
          </h2>

          {/* Desktop Menu */}
          <div className="hidden xl:flex items-center gap-8">

            {/* Left Links */}
            <div className="flex items-center gap-6">

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 transition font-medium">
                  Products <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-white rounded-xl shadow-xl border border-indigo-100">
                  <DropdownMenuItem className="hover:bg-indigo-50">
                    Product 1
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-indigo-50">
                    Product 2
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-emerald-600 hover:text-emerald-800 transition font-medium">
                  Use case <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-white rounded-xl shadow-xl border border-emerald-100">
                  <DropdownMenuItem className="hover:bg-emerald-50">
                    Use Case 1
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-emerald-50">
                    Use Case 2
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-pink-600 hover:text-pink-800 transition font-medium">
                  Integration <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-white rounded-xl shadow-xl border border-pink-100">
                  <DropdownMenuItem className="hover:bg-pink-50">
                    Integration 1
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-pink-50">
                    Integration 2
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-orange-600 hover:text-orange-800 transition font-medium">
                  Resources <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-white rounded-xl shadow-xl border border-orange-100">
                  <DropdownMenuItem className="hover:bg-orange-50">
                    Blog
                  </DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-orange-50">
                    Docs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <a
                href="#"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 transition"
              >
                Pricing
              </a>

            </div>

            {/* Right Links */}
            <div className="flex items-center gap-3">

              <a
                href="#"
                className="text-sm font-semibold text-purple-600 hover:text-purple-800"
              >
                Login
              </a>

              <Button
                variant="outline"
                className="rounded-lg border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              >
                Request demo
              </Button>

              <Button className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-md">
                Get started
              </Button>

            </div>
          </div>

          {/* Mobile Toggle */}
          <button
            className="xl:hidden text-indigo-600"
            onClick={() => setOpen(!open)}
          >
            <Menu className="h-6 w-6" />
          </button>

        </div>

        {/* Mobile Menu */}
        {open && (
          <div className="mt-4 flex flex-col gap-4 xl:hidden border-t border-indigo-200 pt-4">

            <a href="#" className="text-indigo-600 font-medium">
              Products
            </a>

            <a href="#" className="text-emerald-600 font-medium">
              Use case
            </a>

            <a href="#" className="text-blue-600 font-medium">
              Pricing
            </a>

            <div className="flex flex-col gap-3 pt-3 border-t border-indigo-200">
              <a href="#" className="text-purple-600 font-semibold">
                Login
              </a>

              <Button
                variant="outline"
                className="rounded-lg w-full border-indigo-300 text-indigo-600"
              >
                Request demo
              </Button>

              <Button className="rounded-lg w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                Get started
              </Button>
            </div>

          </div>
        )}

      </nav>
    </div>
  )
}
