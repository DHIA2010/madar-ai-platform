import { Check } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select"

export function SelectWithCheckmarks() {
  return (
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Pick status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">
          <Check className="mr-2 h-4 w-4 text-green-500" />
          Active
        </SelectItem>
        <SelectItem value="inactive">
          <Check className="mr-2 h-4 w-4 text-red-500" />
          Inactive
        </SelectItem>
        <SelectItem value="pending">
          <Check className="mr-2 h-4 w-4 text-yellow-500" />
          Pending
        </SelectItem>
      </SelectContent>
    </Select>
  )
}