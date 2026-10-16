"use client"

import { Bell } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type Notification = {
  id: number
  itemKey: string
  time: { unit: "minutes" | "hours"; count: number }
  unread?: boolean
  avatar?: string
  color?: string
}

const notifications: Notification[] = [
  {
    id: 1,
    itemKey: "1",
    time: { unit: "minutes", count: 2 },
    unread: true,
    color: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  },
  {
    id: 2,
    itemKey: "2",
    time: { unit: "hours", count: 1 },
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  {
    id: 3,
    itemKey: "3",
    time: { unit: "hours", count: 3 },
    color: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  },
  {
    id: 4,
    itemKey: "4",
    time: { unit: "hours", count: 1 },
    color: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  },
  {
    id: 5,
    itemKey: "5",
    time: { unit: "minutes", count: 10 },
    color: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
  },
  {
    id: 6,
    itemKey: "6",
    time: { unit: "minutes", count: 5 },
    color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
  },
  {
    id: 7,
    itemKey: "7",
    time: { unit: "minutes", count: 20 },
    color: "bg-lime-100 text-lime-600 dark:bg-lime-500/20 dark:text-lime-400",
  },
  {
    id: 8,
    itemKey: "8",
    time: { unit: "minutes", count: 45 },
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
  },
]

export function NotificationDropdown() {
  const t = useTranslations("shared.notificationDropdown")
  const unreadCount = notifications.filter((n) => n.unread).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="relative">
          <Button variant="ghost" size="icon" className="rounded-full w-10 h-10">
            <Bell className="size-5" />
          </Button>

          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -end-1 h-4 min-w-4 rounded-full
              bg-destructive px-1 text-[10px] font-medium
              text-destructive-foreground flex items-center justify-center"
            >
              {unreadCount}
            </span>
          )}
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 rounded-xl shadow-xl">
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span>{t("title")}</span>
          <span className="text-xs text-muted-foreground">
            {t("unreadCount", { count: unreadCount })}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <ScrollArea className="h-94">
          <div>
            <div className="flex flex-col">
              {notifications.map((item) => {
                const title = t(`items.${item.itemKey}.title` as "items.1.title")
                const description = t(`items.${item.itemKey}.description` as "items.1.description")
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 cursor-pointer transition-colors",
                      item.unread ? "bg-muted/50 hover:bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={item.avatar} />
                      <AvatarFallback
                        className={cn(
                          "font-medium text-sm flex items-center justify-center",
                          item.color
                        )}
                      >
                        {title.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium leading-none">{title}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                      <span className="text-xs text-muted-foreground">
                        {t(`timeAgo.${item.time.unit}`, { count: item.time.count })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </ScrollArea>

        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full text-sm">
            {t("viewAll")}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
