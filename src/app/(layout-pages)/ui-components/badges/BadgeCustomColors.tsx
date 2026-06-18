import { Badge } from "@/components/ui/badge"

export function BadgeCustomColors() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-200/20">
        Blue
      </Badge>
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-200/20">
        Green
      </Badge>
      <Badge variant="outline" className="bg-sky-50 text-sky-700 border-blue-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-200/20">
        Sky
      </Badge>
      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-200/20">
        Purple
      </Badge>
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-200/20">
        Red
      </Badge>
      <Badge variant="outline" className="bg-red-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-200/20">
        Orange
      </Badge>
    </div>
  )
}
