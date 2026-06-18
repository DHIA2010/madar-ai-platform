import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select"

export function SelectBasic() {
  return (
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Choose option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option One</SelectItem>
        <SelectItem value="option2">Option Two</SelectItem>
        <SelectItem value="option3">Option Three</SelectItem>
      </SelectContent>
    </Select>
  )
}