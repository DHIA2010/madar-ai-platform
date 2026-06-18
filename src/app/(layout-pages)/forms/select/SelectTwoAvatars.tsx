import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function SelectTwoAvatars() {
  return (
    <Select>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Team leads" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pair1">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              <Avatar className="h-5 w-5 border-2 border-background">
                <AvatarImage src="https://blocks.so/avatar-01.png" />
              </Avatar>
              <Avatar className="h-5 w-5 border-2 border-background">
                <AvatarImage src="https://blocks.so/avatar-02.png" />
              </Avatar>
            </div>
            Team Alpha
          </div>
        </SelectItem>

        <SelectItem value="pair2">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              <Avatar className="h-5 w-5 border-2 border-background">
                <AvatarImage src="https://blocks.so/avatar-03.png" />
              </Avatar>
              <Avatar className="h-5 w-5 border-2 border-background">
                <AvatarImage src="https://blocks.so/avatar-04.png" />
              </Avatar>
            </div>
            Team Beta
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}