import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function PositionedBadges() {
  return (
    <div className="flex flex-wrap gap-6">
      
      {/* Inbox */}
      <div className="relative">
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6">
          Inbox
        </Button>
        <Badge className="absolute -top-2 -right-3 bg-red-500 text-white px-2">
          99+
        </Badge>
      </div>

      {/* Alerts */}
      <div className="relative">
        <Button className="bg-amber-500 hover:bg-amber-600 text-white px-6">
          Alerts
        </Button>
        <Badge className="absolute -top-2 -right-3 bg-black text-white px-2">
          7
        </Badge>
      </div>

      {/* Downloads */}
      <div className="relative">
        <Button className="bg-green-600 hover:bg-green-700 text-white px-6">
          Downloads
        </Button>
        <Badge className="absolute -top-2 -right-3 bg-gray-500 text-white px-2">
          2
        </Badge>
      </div>

      {/* Updates */}
      <div className="relative">
        <Button className="bg-cyan-600 hover:bg-cyan-700 text-white px-6">
          Updates
        </Button>
        <Badge className="absolute -top-2 -right-3 bg-purple-600 text-white px-2">
          14
        </Badge>
      </div>

      {/* Cart */}
      <div className="relative">
        <Button className="bg-red-500 hover:bg-red-600 text-white px-6">
          Cart
        </Button>
        <Badge className="absolute -top-2 -right-3 bg-yellow-500 text-black px-2">
          5
        </Badge>
      </div>

      {/* Messages */}
      <div className="relative">
        <Button className="bg-gray-600 hover:bg-gray-700 text-white px-6">
          Messages
        </Button>
        <Badge className="absolute -top-2 -right-3 bg-green-500 text-white px-2">
          3
        </Badge>
      </div>

    </div>
  )
}
