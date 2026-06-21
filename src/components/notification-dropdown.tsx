import { Bell } from "lucide-react"

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
  title: string
  description: string
  time: string
  unread?: boolean
  avatar?: string
  color?: string
}

const notifications: Notification[] = [
  {
    id: 1,
    title: "New order placed",
    description: "Order #1234 has been placed",
    time: "2m ago",
    unread: true,
    color: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  },
  {
    id: 2,
    title: "Payment received",
    description: "₹4,500 received from client",
    time: "1h ago",
    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  {
    id: 3,
    title: "New user registered",
    description: "A new user joined your platform",
    time: "3h ago",
    color: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  },
  {
    id: 4,
    title: "Password changed",
    description: "A user updated their account password",
    time: "1h ago",
    color: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  },
  {
    id: 5,
    title: "Subscription renewed",
    description: "A user renewed their subscription plan",
    time: "10m ago",
    color: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
  },
  {
    id: 6,
    title: "Support ticket opened",
    description: "A user submitted a new support request",
    time: "5m ago",
    color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
  },
  {
    id: 7,
    title: "New review received",
    description: "A customer left a 5-star review",
    time: "20m ago",
    color: "bg-lime-100 text-lime-600 dark:bg-lime-500/20 dark:text-lime-400",
  },
  {
    id: 8,
    title: "Server restarted",
    description: "Production server was successfully restarted",
    time: "45m ago",
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
  },
]

export function NotificationDropdown() {
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
          <span>Notifications</span>
          <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <ScrollArea className="h-94">
          <div>
            <div className="flex flex-col">
              {notifications.map((item) => (
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
                      {item.title.charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium leading-none">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>

        <div className="p-2 border-t">
          <Button variant="ghost" className="w-full text-sm">
            View all notifications
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
