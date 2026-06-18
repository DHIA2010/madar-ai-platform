import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Mail,
  Bell,
  ShoppingCart,
  Download,
  MessageCircle,
  Settings,
} from "lucide-react"

export function IconBadgeButtons() {
  return (
    <div className="flex flex-wrap gap-6">
      
      {/* Mail */}
      <div className="relative">
        <Button
          size="icon"
          className="rounded-full h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Mail className="h-6 w-6" />
        </Button>
        <Badge className="absolute -top-1 -right-1 rounded-full h-5 min-w-[20px] flex items-center justify-center bg-red-500 text-white text-xs">
          9
        </Badge>
      </div>

      {/* Notifications */}
      <div className="relative">
        <Button
          size="icon"
          className="rounded-full h-10 w-10 bg-amber-500 hover:bg-amber-600 text-white"
        >
          <Bell className="h-6 w-6" />
        </Button>
        <Badge className="absolute -top-1 -right-1 rounded-full h-5 min-w-[20px] flex items-center justify-center bg-black text-white text-xs">
          7
        </Badge>
      </div>

      {/* Downloads */}
      <div className="relative">
        <Button
          size="icon"
          className="rounded-full h-10 w-10 bg-green-600 hover:bg-green-700 text-white"
        >
          <Download className="h-6 w-6" />
        </Button>
        <Badge className="absolute -top-1 -right-1 rounded-full h-5 min-w-[20px] flex items-center justify-center bg-gray-500 text-white text-xs">
          2
        </Badge>
      </div>

      {/* Cart */}
      <div className="relative">
        <Button
          size="icon"
          className="rounded-full h-10 w-10 bg-red-500 hover:bg-red-600 text-white"
        >
          <ShoppingCart className="h-6 w-6" />
        </Button>
        <Badge className="absolute -top-1 -right-1 rounded-full h-5 min-w-[20px] flex items-center justify-center bg-yellow-500 text-black text-xs">
          5
        </Badge>
      </div>

      {/* Messages */}
      <div className="relative">
        <Button
          size="icon"
          className="rounded-full h-10 w-10 bg-gray-600 hover:bg-gray-700 text-white"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
        <Badge className="absolute -top-1 -right-1 rounded-full h-5 min-w-[20px] flex items-center justify-center bg-green-500 text-white text-xs">
          3
        </Badge>
      </div>

      {/* Settings */}
      <div className="relative">
        <Button
          size="icon"
          className="rounded-full h-10 w-10 bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Settings className="h-6 w-6" />
        </Button>
        <Badge className="absolute -top-1 -right-1 rounded-full h-5 min-w-[20px] flex items-center justify-center bg-blue-500 text-white text-xs">
          14
        </Badge>
      </div>

    </div>
  )
}
