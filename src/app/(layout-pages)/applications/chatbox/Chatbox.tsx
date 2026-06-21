"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Search,
  Menu,
  Phone,
  Video,
  Paperclip,
  Mic,
  Send,
  Users,
  ListFilter,
  MessageSquareLock,
  Heart,
  UsersRound,
  PhoneOff,
  FileCheckCorner,
} from "lucide-react"

export default function ChatBox() {
  const [collapsed, setCollapsed] = useState(false)

  const chats = [
    {
      name: "Sophia Turner",
      message: "Hey, are we still on for tonight?",
      time: "9:34 PM",
      image: "https://randomuser.me/api/portraits/women/35.jpg",
    },
    {
      name: "Liam Carter",
      message: "Just sent the files. Check your mail!",
      time: "10:23 PM",
      image: "https://randomuser.me/api/portraits/men/58.jpg",
    },
    {
      name: "Emily Brown",
      message: "Typing...",
      time: "2 days ago",
      image: "https://randomuser.me/api/portraits/women/45.jpg",
    },
    {
      name: "Noah Patel",
      message: "Got it, thanks bro 👍",
      time: "Yesterday",
      image: "https://randomuser.me/api/portraits/men/12.jpg",
    },
    {
      name: "Mia Chen",
      message: "See you at the meeting tomorrow!",
      time: "7:52 AM",
      image: "https://randomuser.me/api/portraits/women/67.jpg",
    },
    {
      name: "Ethan Walker",
      message: "Let's catch up this weekend!",
      time: "",
      image: "https://randomuser.me/api/portraits/men/42.jpg",
    },
    {
      name: "Ava Johnson",
      message: "Can you review my design draft?",
      time: "",
      image: "https://randomuser.me/api/portraits/women/30.jpg",
    },
    {
      name: "Oliver King",
      message: "I'll be there in 5 mins 🚗",
      time: "",
      image: "https://randomuser.me/api/portraits/men/9.jpg",
    },
  ]

  return (
    <div
      className={`flex h-[600px] bg-background border border-border rounded-xl overflow-hidden relative shadow`}
    >
      {/* Sidebar */}
      <div
        className={`absolute left-0 top-0 w-80 h-full bg-background border-r border-border flex flex-col transform transition-transform duration-200 ease-in-out ${collapsed ? "translate-x-0 z-50" : "-translate-x-full"} lg:relative lg:translate-x-0 lg:flex lg:z-auto`}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          {/* Profile Section */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src="https://avatars.githubusercontent.com/u/6880091?v=4"
                    alt="profile"
                  />
                  <AvatarFallback>AM</AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></span>
              </div>
              <div className="flex-1 min-w-0">
                <h6 className="font-semibold text-sm truncate mb-0">Alex Martin</h6>
                <p className="text-xs text-muted-foreground mb-0">Online</p>
              </div>
            </div>

            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
                  <ListFilter className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-xl p-2">
                <DropdownMenuLabel>Filter chats by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex items-center gap-2">
                  <MessageSquareLock /> Unread
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2">
                  <Heart /> Favorites
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2">
                  <UsersRound /> Contacts
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2">
                  <PhoneOff /> Non-contacts
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2">
                  <Users /> Groups
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2">
                  <FileCheckCorner /> Drafts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="text" placeholder="Search chat" className="pl-10 rounded-full" />
          </div>
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2 h-64">
            {chats.map((chat, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors"
              >
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={chat.image} alt={chat.name} />
                  <AvatarFallback>{chat.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h6 className="font-semibold text-md truncate">{chat.name}</h6>
                    {chat.time && (
                      <span className="text-xs text-muted-foreground ml-1">{chat.time}</span>
                    )}
                  </div>
                  <small className="text-sm text-muted-foreground truncate block">
                    {chat.message}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b h-[70px] px-6 py-4">
          <div className="flex items-center gap-3 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-full h-10 w-10 p-0 overflow-hidden"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu className="size-5" />
            </Button>

            <div className="flex items-center gap-3 flex-1">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src="https://randomuser.me/api/portraits/women/35.jpg"
                  alt="chat-user"
                />
                <AvatarFallback>ST</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block space-y-0">
                <h5 className="font-semibold text-md">Sophia Turner</h5>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
              <Video className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
              <Phone className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10">
              <Search className="size-5" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6 bg-muted/50">
          <div className="space-y-6 w-full h-88">
            {/* Received Message */}
            <div className="flex justify-start">
              <div className="bg-background rounded-lg rounded-tl-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">Hey! How are you doing today?</p>
                <span className="text-xs text-muted-foreground block text-right mt-1">9:34 PM</span>
              </div>
            </div>

            {/* Sent Message */}
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">I&apos;m good, thanks! How about you?</p>
                <span className="text-xs opacity-70 block text-right mt-1">9:35 PM</span>
              </div>
            </div>

            {/* Received Message */}
            <div className="flex justify-start">
              <div className="bg-background rounded-lg rounded-tl-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">Pretty good! Just got back from the gym 💪</p>
                <span className="text-xs text-muted-foreground block text-right mt-1">9:36 PM</span>
              </div>
            </div>

            {/* Sent Message */}
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">Nice! Trying to stay consistent with workouts too.</p>
                <span className="text-xs opacity-70 block text-right mt-1">9:37 PM</span>
              </div>
            </div>

            {/* Received Message */}
            <div className="flex justify-start">
              <div className="bg-background rounded-lg rounded-tl-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">
                  Yeah, it&apos;s tough but worth it. Anyway, did you finish that project?
                </p>
                <span className="text-xs text-muted-foreground block text-right mt-1">9:39 PM</span>
              </div>
            </div>

            {/* Sent Message */}
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">Almost done! Just need to polish a few things.</p>
                <span className="text-xs opacity-70 block text-right mt-1">9:40 PM</span>
              </div>
            </div>

            {/* Received Message */}
            <div className="flex justify-start">
              <div className="bg-background rounded-lg rounded-tl-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">
                  Cool 😎 Send it over when you&apos;re done — I&apos;ll take a look!
                </p>
                <span className="text-xs text-muted-foreground block text-right mt-1">9:41 PM</span>
              </div>
            </div>

            {/* Sent Message */}
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-4 py-2 max-w-xs lg:max-w-md shadow">
                <p className="text-sm">Will do. Thanks for the help!</p>
                <span className="text-xs opacity-70 block text-right mt-1">9:42 PM</span>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Input Footer */}
        <div className="px-6 py-4 border-t border-border h-[70px] flex items-center justify-between">
          <div className="flex items-center gap-4 w-full">
            <div className="flex-1 flex items-center gap-2">
              <Input
                type="text"
                placeholder="Type a message..."
                className="flex-1 rounded-full h-10"
              />
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0 rounded-full [&_svg]:size-5"
              >
                <Send />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
                <Paperclip />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
                <Mic />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {collapsed && (
        <div
          className="absolute inset-0 bg-black/50 lg:hidden z-40"
          onClick={() => setCollapsed(false)}
        />
      )}
    </div>
  )
}
