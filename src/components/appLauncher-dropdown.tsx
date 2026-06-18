"use client"

import { Airplay } from "lucide-react"
import {
  FolderKanban,
  FileText,
  Users,
  MessageCircle,
  ShoppingCart,
  CreditCard,
  Briefcase,
  Inbox,
  File,
  Calendar,
  Cloud,
  Store,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type AppItem = {
  icon: LucideIcon
  label: string
  color: string
}

const appItems: AppItem[] = [
  {
    icon: FolderKanban,
    label: "Projects",
    color: "bg-zinc-700/10 text-zinc-600",
  },
  {
    icon: FileText,
    label: "Invoice",
    color: "bg-indigo-700/10 text-indigo-600",
  },
  {
    icon: Users,
    label: "Teams",
    color: "bg-rose-700/10 text-rose-600",
  },
  {
    icon: MessageCircle,
    label: "Chat",
    color: "bg-amber-700/10 text-amber-600",
  },
  {
    icon: ShoppingCart,
    label: "Billing",
    color: "bg-cyan-700/10 text-cyan-600",
  },
  {
    icon: CreditCard,
    label: "Payment",
    color: "bg-emerald-700/10 text-emerald-600",
  },
  {
    icon: Briefcase,
    label: "Management",
    color: "bg-violet-700/10 text-violet-600",
  },
  {
    icon: Inbox,
    label: "Inbox",
    color: "bg-pink-700/10 text-pink-600",
  },
  {
    icon: File,
    label: "Docs",
    color: "bg-orange-700/10 text-orange-600",
  },
  {
    icon: Calendar,
    label: "Events",
    color: "bg-teal-700/10 text-teal-600",
  },
  {
    icon: Cloud,
    label: "Cloud",
    color: "bg-sky-700/10 text-sky-600",
  },
  {
    icon: Store,
    label: "Store",
    color: "bg-red-700/10 text-red-600",
  },
  {
    icon: BarChart3,
    label: "Analytics",
    color: "bg-fuchsia-700/10 text-fuchsia-600",
  },
  {
    icon: Settings,
    label: "Settings",
    color: "bg-slate-700/10 text-slate-600",
  },
]

export function AppLauncherDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full w-10 h-10"
        >
          <Airplay className="size-5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[300px] p-0 rounded-xl overflow-hidden shadow-xl"
      >
        <ScrollArea className="h-[420px]">
          <div className="grid grid-cols-2">
            {appItems.map((item, index) => {
              const Icon = item.icon

              return (
                <div
                  key={item.label}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-4",
                    "border-border border-b border-r",
                    "hover:bg-muted/50 transition-all duration-200 cursor-pointer",
                    (index + 1) % 2 === 0 && "border-r-0"
                  )}
                >
                  <div
                    className={cn(
                      "h-12 w-12 flex items-center justify-center rounded-full",
                      item.color
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <span className="text-xs font-medium text-center">
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}