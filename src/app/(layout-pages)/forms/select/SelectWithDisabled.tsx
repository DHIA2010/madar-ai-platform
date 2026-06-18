
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select"
export function SelectWithDisabled() {
  return (
    <Select>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="online">Online</SelectItem>
        <SelectItem value="offline" disabled>
          Offline (Disabled)
        </SelectItem>
        <SelectItem value="busy">Busy</SelectItem>
      </SelectContent>
    </Select>
  )
}