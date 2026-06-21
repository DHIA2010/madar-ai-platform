"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { DialogTitle } from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

import {
  Search,
  LayoutDashboard,
  BarChart3,
  Users,
  User,
  CreditCard,
  ArrowRight,
} from "lucide-react"

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      {/* Mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full h-10 w-10 flex xl:hidden"
        onClick={() => setOpen(true)}
      >
        <Search className="size-5" />
      </Button>

      {/* Desktop */}
      <Button
        variant="ghost"
        className="rounded-full hidden xl:flex items-center w-[280px] gap-2 h-9 px-4 border border-border justify-between bg-muted/40 hover:bg-muted/80 transition"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Search className="size-5" />
          <span className="text-sm">ابحث...</span>
        </div>

        {/* Shortcut */}
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
          ⌘K
        </kbd>
      </Button>

      {/* Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <VisuallyHidden>
          <DialogTitle>Global Search</DialogTitle>
        </VisuallyHidden>

        {/* Input */}
        <div className="border-b px-3">
          <CommandInput placeholder="Search pages, actions..." className="h-11 text-sm" />
        </div>

        <CommandList className="max-h-[400px] overflow-y-auto">
          <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </CommandEmpty>

          {/* Dashboard */}
          <CommandGroup
            heading="Dashboard"
            className="px-2 text-xs font-semibold text-muted-foreground"
          >
            <CommandItem
              onSelect={() => router.push("/")}
              className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer"
            >
              <LayoutDashboard className="size-4 text-muted-foreground" />
              <span>Dashboard</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>

            <CommandItem
              onSelect={() => router.push("/analytics")}
              className="flex items-center gap-2 px-2 py-2 rounded-md"
            >
              <BarChart3 className="size-4 text-muted-foreground" />
              <span>Analytics</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>

            <CommandItem
              onSelect={() => router.push("/crm")}
              className="flex items-center gap-2 px-2 py-2 rounded-md"
            >
              <Users className="size-4 text-muted-foreground" />
              <span>CRM</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Settings */}
          <CommandGroup
            heading="Settings"
            className="px-2 text-xs font-semibold text-muted-foreground"
          >
            <CommandItem
              onSelect={() => alert("Profile")}
              className="flex items-center gap-2 px-2 py-2 rounded-md"
            >
              <User className="size-4 text-muted-foreground" />
              <span>Profile</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>

            <CommandItem
              onSelect={() => alert("Billing")}
              className="flex items-center gap-2 px-2 py-2 rounded-md"
            >
              <CreditCard className="size-4 text-muted-foreground" />
              <span>Billing</span>
              <ArrowRight className="ms-auto size-3 opacity-40 rtl:rotate-180" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
